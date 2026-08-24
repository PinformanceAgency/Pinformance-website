/**
 * Bulk-move an organisation's Pinterest pins into the right board.
 *
 * Use case: a buyer uploaded hundreds of pins to Pinterest directly
 * (outside our dashboard pipeline) and none of them are assigned to a
 * board — they all sit in "All Pins" while every actual board shows 0.
 * This script:
 *
 *   1. Pulls every pin the org owns from Pinterest
 *   2. Filters to pins that need moving (no board, or on a system board
 *      like "Ad-only Pins" / "Products")
 *   3. Asks Claude Haiku to pick the best target board per pin, in batches
 *   4. Prints a dry-run table so you can eyeball the proposals
 *   5. Only if you pass --apply does it PATCH the pins on Pinterest
 *
 * Usage:
 *   # Dry-run (safe — no changes)
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/redistribute-pins.ts "Nature Roots"
 *
 *   # Apply for real — after reviewing the dry-run
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/redistribute-pins.ts "Nature Roots" --apply
 */
import "dotenv/config";
import { Client } from "pg";
import Anthropic from "@anthropic-ai/sdk";
import { PinterestClient } from "../src/lib/pinterest/client";
import { decrypt } from "../src/lib/encryption";

const CLAUDE_MODEL = "claude-haiku-4-5-20251001";
const CLASSIFY_BATCH = 25;
const PATCH_DELAY_MS = 250; // ~4 req/sec, well under Pinterest's rate limit
const EXCLUDE_BOARDS = new Set([
  "Ad-only Pins",
  "Products",
  "Quick Saves",
  "On-Sale",
]);

interface Pin {
  id: string;
  title: string | null;
  description: string | null;
  board_id: string | null;
  board_name?: string | null;
}
interface Board {
  id: string;
  name: string;
}

function log(...args: unknown[]) {
  console.log(...args);
}

async function loadOrg(orgName: string): Promise<{ id: string; token: string; isTrial: boolean }> {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    const { rows } = await c.query(
      "SELECT id, pinterest_access_token_encrypted, settings FROM organizations WHERE name = $1 LIMIT 1",
      [orgName]
    );
    if (!rows.length) throw new Error(`Org "${orgName}" not found`);
    const enc = rows[0].pinterest_access_token_encrypted;
    if (!enc) throw new Error(`Org "${orgName}" has no Pinterest token`);
    const isTrial = (rows[0].settings?.pinterest_access_tier === "trial");
    return { id: rows[0].id, token: decrypt(enc), isTrial };
  } finally {
    await c.end();
  }
}

async function fetchAllPins(client: PinterestClient): Promise<Pin[]> {
  const out: Pin[] = [];
  let bookmark: string | undefined;
  let page = 0;
  do {
    page++;
    const resp = await client.getAccountPins(bookmark);
    for (const p of resp.items) {
      out.push({
        id: p.id,
        title: p.title ?? null,
        description: p.description ?? null,
        board_id: p.board_id ?? null,
      });
    }
    bookmark = resp.bookmark;
    log(`  fetched page ${page} (${out.length} pins total)`);
  } while (bookmark);
  return out;
}

async function classifyBatch(
  claude: Anthropic,
  pins: Pin[],
  targetBoardNames: string[]
): Promise<Map<string, string>> {
  const boardList = targetBoardNames.map((n, i) => `${i + 1}. ${n}`).join("\n");
  const pinList = pins.map((p) =>
    `PIN_ID: ${p.id}\nTitle: ${p.title || "(no title)"}\nDescription: ${(p.description || "").slice(0, 300)}`
  ).join("\n---\n");
  const prompt = `You are classifying Pinterest pins into topical boards for a wellness brand called Nature Roots.

Available boards:
${boardList}

For each pin, output exactly one line: PIN_ID -> BOARD_NAME
- BOARD_NAME must match one of the boards above exactly.
- If a pin is generic and doesn't clearly fit any board, pick the closest topical match anyway (best-effort, not "unknown").
- No preamble, no explanation, no code fences. Only lines of "PIN_ID -> BOARD_NAME".

PINS:
${pinList}`;

  const res = await claude.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });
  const text = res.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");

  const map = new Map<string, string>();
  const validBoards = new Set(targetBoardNames);
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([0-9]+)\s*->\s*(.+?)\s*$/);
    if (!m) continue;
    const pinId = m[1];
    const boardName = m[2].trim();
    if (validBoards.has(boardName)) map.set(pinId, boardName);
  }
  return map;
}

async function main() {
  const args = process.argv.slice(2);
  const orgName = args.find((a) => !a.startsWith("--"));
  const apply = args.includes("--apply");
  if (!orgName) {
    console.error("Usage: redistribute-pins.ts <org-name> [--apply]");
    process.exit(1);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Missing ANTHROPIC_API_KEY");
    process.exit(1);
  }

  log(`▶ ${apply ? "APPLYING" : "DRY-RUN"} for org: ${orgName}\n`);
  const org = await loadOrg(orgName);
  const client = new PinterestClient(org.token, org.isTrial);
  const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  log("Fetching boards from Pinterest…");
  const boardsResp = await client.getBoards();
  const boards: Board[] = boardsResp.items.map((b) => ({ id: b.id, name: b.name || "(unnamed)" }));
  const boardById = new Map(boards.map((b) => [b.id, b.name] as const));
  const boardIdByName = new Map(boards.map((b) => [b.name, b.id] as const));
  const targetBoards = boards.filter((b) => !EXCLUDE_BOARDS.has(b.name));
  log(`  ${boards.length} boards total, ${targetBoards.length} eligible as targets:`);
  for (const b of targetBoards) log(`    • ${b.name}`);
  log(`  ${boards.length - targetBoards.length} excluded (system):`);
  for (const b of boards.filter((x) => EXCLUDE_BOARDS.has(x.name))) log(`    – ${b.name}`);
  log();

  log("Fetching all pins…");
  const pins = await fetchAllPins(client);
  log(`  ${pins.length} total pins\n`);

  for (const p of pins) p.board_name = p.board_id ? boardById.get(p.board_id) ?? null : null;
  const needsMove = pins.filter((p) => !p.board_id || EXCLUDE_BOARDS.has(p.board_name ?? ""));
  log(`  ${needsMove.length} pins need redistribution (no board or on a system board)`);
  log(`  ${pins.length - needsMove.length} pins already on a target board — leaving alone\n`);
  if (needsMove.length === 0) {
    log("Nothing to do. Bye.");
    return;
  }

  log(`Classifying with Claude in batches of ${CLASSIFY_BATCH}…`);
  const proposals = new Map<string, string>(); // pin_id → board_name
  const targetNames = targetBoards.map((b) => b.name);
  for (let i = 0; i < needsMove.length; i += CLASSIFY_BATCH) {
    const batch = needsMove.slice(i, i + CLASSIFY_BATCH);
    const map = await classifyBatch(claude, batch, targetNames);
    for (const [k, v] of map) proposals.set(k, v);
    log(`  batch ${Math.floor(i / CLASSIFY_BATCH) + 1}/${Math.ceil(needsMove.length / CLASSIFY_BATCH)} — ${map.size}/${batch.length} classified`);
  }
  log();

  // Group by target board for a readable dry-run summary
  const byBoard = new Map<string, Pin[]>();
  for (const p of needsMove) {
    const target = proposals.get(p.id);
    if (!target) continue;
    (byBoard.get(target) ?? byBoard.set(target, []).get(target)!).push(p);
  }
  log("=== PROPOSAL ===");
  for (const b of targetBoards) {
    const list = byBoard.get(b.name) ?? [];
    log(`  ${b.name.padEnd(45)} → ${list.length} pins`);
  }
  const unclassified = needsMove.length - proposals.size;
  if (unclassified > 0) log(`  (unclassified: ${unclassified} pins will be left alone)`);
  log();

  // Print 3 samples per board so you can eyeball whether the AI got it right
  log("=== SAMPLES ===");
  for (const b of targetBoards) {
    const list = byBoard.get(b.name) ?? [];
    if (list.length === 0) continue;
    log(`▸ ${b.name}`);
    for (const p of list.slice(0, 3)) {
      log(`    "${(p.title || "").slice(0, 60)}" — ${(p.description || "").slice(0, 60)}`);
    }
    log();
  }

  if (!apply) {
    log("═".repeat(60));
    log("DRY-RUN — no changes made.");
    log(`Run again with --apply to move ${proposals.size} pins for real.`);
    log("═".repeat(60));
    return;
  }

  // APPLY
  log(`Applying ${proposals.size} moves (${PATCH_DELAY_MS}ms between calls)…`);
  let ok = 0, fail = 0;
  const errors: string[] = [];
  for (const p of needsMove) {
    const targetName = proposals.get(p.id);
    if (!targetName) continue;
    const targetId = boardIdByName.get(targetName);
    if (!targetId) { fail++; continue; }
    try {
      await client.updatePin(p.id, { board_id: targetId });
      ok++;
      if (ok % 25 === 0) log(`  ${ok}/${proposals.size} moved…`);
    } catch (e) {
      fail++;
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${p.id} → ${targetName}: ${msg}`);
      if (errors.length <= 5) log(`  ✗ ${p.id} (${msg.slice(0, 80)})`);
    }
    await new Promise((r) => setTimeout(r, PATCH_DELAY_MS));
  }
  log();
  log(`Done. ${ok} moved, ${fail} failed.`);
  if (errors.length > 5) log(`(${errors.length - 5} more errors suppressed — first 5 shown above)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
