/**
 * Anthropic wrapper for the organic AI_DRAFT tasks (P3.2.1 / P3.2.2 /
 * P3.3.3). Every call is validated against the target's hard rules
 * (character limits, keyword-must-appear, no forbidden characters) and
 * regenerated up to N times before returning to the operator, so a
 * proposal that fails a validator is not shown.
 *
 * Every generation lands in organic.ai_drafts with prompt_version + a
 * timestamp, whether or not it gets approved. When the operator approves
 * (with edits), the approved_text is written back to the same row so we
 * can measure how much editing each AI surface required.
 */
import Anthropic from "@anthropic-ai/sdk";
import { organicPool } from "./db";

const MODEL_ID = "claude-haiku-4-5-20251001";
const PROMPT_VERSION = "v1-2026-08";
const MAX_ATTEMPTS = 3;

export type DraftKind =
  | "DISPLAY_NAME"
  | "BIO"
  | "BOARD_DESCRIPTION"
  | "MARKET_ANALYSIS"
  /** P4.2.8 — the four copy sets for one URL's designs. */
  | "PIN_COPY"
  /** P4.2.4, AI route — the prompt a designer or an image model runs. */
  | "IMAGE_PROMPT"
  /** P5.3.3 — the forward-looking paragraph in the monthly report. */
  | "TREND_FORECAST";

export function anthropicClient(): Anthropic {
  const key = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPHIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");
  return new Anthropic({ apiKey: key });
}

/** Prompt + validator harness — regenerates on validator failure with
 *  explicit "you produced X but Y failed" feedback so the second attempt
 *  actually corrects instead of re-drafting from scratch. */
export async function generateWithValidator(
  systemPrompt: string,
  userPrompt: string,
  validate: (text: string) => { ok: boolean; errors: string[] },
  maxTokens = 400
): Promise<{ text: string; attempts: number; failed_attempts: string[] }> {
  const client = anthropicClient();
  const failed: string[] = [];
  let feedback = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const resp = await client.messages.create({
      model: MODEL_ID,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: attempt === 1 ? userPrompt : `${userPrompt}\n\nYour previous attempt was:\n"""${failed[failed.length - 1]}"""\n\nIt was rejected because: ${feedback}\n\nProduce a new attempt that fixes ALL of the above. Output the copy only, no preamble.` }],
    });
    const text = resp.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("")
      .trim()
      .replace(/^["']|["']$/g, "");
    const v = validate(text);
    if (v.ok) return { text, attempts: attempt, failed_attempts: failed };
    failed.push(text);
    feedback = v.errors.join("; ");
  }
  throw new Error(`AI failed all ${MAX_ATTEMPTS} attempts. Last errors: ${feedback}. Last output: "${failed[failed.length - 1].slice(0, 120)}"`);
}

/** Record every generation, whether approved or not. Returns the draft id. */
export async function persistDraft(orgId: string, kind: DraftKind, targetId: string | null, generatedText: string): Promise<string> {
  const pool = organicPool();
  const r = await pool.query<{ id: string }>(
    `INSERT INTO organic.ai_drafts (org_id, kind, target_id, generated_text, prompt_version, model_version)
     VALUES ($1, $2::text, $3, $4, $5, $6) RETURNING id::text`,
    [orgId, kind, targetId, generatedText, PROMPT_VERSION, MODEL_ID]
  );
  return r.rows[0].id;
}

export async function approveDraft(draftId: string, approvedText: string): Promise<void> {
  const pool = organicPool();
  await pool.query(
    `UPDATE organic.ai_drafts SET approved_text = $1, approved_at = now() WHERE id = $2`,
    [approvedText, draftId]
  );
}

/** Return the most recent draft for a kind + target, so re-opening a form
 *  shows what was last generated (and what was approved on top of it). */
export async function latestDraft(orgId: string, kind: DraftKind, targetId: string | null) {
  const pool = organicPool();
  const r = await pool.query(
    `SELECT id::text, generated_text, approved_text, generated_at::text, approved_at::text
       FROM organic.ai_drafts
      WHERE org_id = $1 AND kind = $2
        AND (target_id = $3 OR ($3::uuid IS NULL AND target_id IS NULL))
      ORDER BY generated_at DESC LIMIT 1`,
    [orgId, kind, targetId]
  );
  return r.rows[0] ?? null;
}

// ---------- P3.3.6 — which of the store's own pins belong on which board ----

/**
 * The relevance judgement behind board warming.
 *
 * Module 4 (1:21): even on a board that is still private, "you really need to
 * prioritise the best match between the boards and the content" — a triangle
 * bikini does not warm a strapless-bra board. Word matching could not make
 * that call: strict, it found nothing for "Bras for Small Breasts" because
 * the copy says "small bust"; loose, it put a lingerie pin at the top of
 * "Bikinis for Petite Women". So a model reads the pins and the boards and
 * proposes; a person approves (P3.3.6, "Human: chooses 10–15 own pins").
 *
 * Opus 5 rather than the drafting model above: this is judgement over the
 * whole catalogue, and a wrong pick lands on the client's own board. Run once
 * per store, not per pin, so the cost is a few calls. The pin list goes in
 * the system prompt with a cache breakpoint, so every chunk of boards after
 * the first reads it from cache.
 */
const SEED_MODEL_ID = "claude-opus-5";

export interface SeedPinCandidate { id: string; title: string; description: string }
export interface SeedBoardTarget { id: string; name: string; primary_keyword: string | null; description: string | null }

export async function pickSeedPins(
  boards: SeedBoardTarget[],
  pins: SeedPinCandidate[],
  maxPerBoard = 15
): Promise<Map<string, Array<{ pin_id: string; reason: string }>>> {
  const { z } = await import("zod");
  const { zodOutputFormat } = await import("@anthropic-ai/sdk/helpers/zod");
  const Schema = z.object({
    boards: z.array(z.object({
      board_id: z.string(),
      picks: z.array(z.object({ pin_id: z.string(), reason: z.string() })),
    })),
  });

  const clean = (s: string, n: number) => s.replace(/\s+/g, " ").trim().slice(0, n);
  const catalogue = pins.map((p) => `${p.id} | ${clean(p.title, 100)} | ${clean(p.description, 160)}`).join("\n");
  const system =
    `You pick which of a brand's own existing Pinterest pins belong on each of its new boards. ` +
    `The pins will be saved onto the board to give Pinterest context before the board goes public.\n\n` +
    `A pin qualifies only if what it shows and links to genuinely belongs on that board, judged by the board's name ` +
    `and keyword. The product type has to match: a bikini does not belong on a bra board, an ordinary push-up bra ` +
    `does not belong on a strapless-bra board, a lingerie set does not belong on a swimwear board. Synonyms count ` +
    `("small bust", "small chest" and "small breasts" are the same audience). Broad boards can take anything that ` +
    `sits under them.\n\n` +
    `Up to ${maxPerBoard} pins per board, best match first. When fewer genuinely fit, return fewer — never pad a ` +
    `board with weak matches, and an empty list is a valid answer. The same pin may go to several boards. ` +
    `The reason is one short phrase naming why it fits.\n\n` +
    `The pins, one per line as "id | title | description":\n${catalogue}`;

  const client = anthropicClient();
  const out = new Map<string, Array<{ pin_id: string; reason: string }>>();
  const known = new Set(pins.map((p) => p.id));
  const CHUNK = 8;
  const chunks: SeedBoardTarget[][] = [];
  for (let i = 0; i < boards.length; i += CHUNK) chunks.push(boards.slice(i, i + CHUNK));

  // The first chunk writes the cache; the rest run together and read it.
  const runChunk = async (chunk: SeedBoardTarget[]) => {
    const list = chunk.map((b) =>
      `${b.id} | ${b.name} | keyword: ${b.primary_keyword ?? "—"} | ${clean(b.description ?? "", 200)}`).join("\n");
    const resp = await client.messages.parse({
      model: SEED_MODEL_ID,
      max_tokens: 16000,
      output_config: { effort: "medium", format: zodOutputFormat(Schema) },
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: `The boards, one per line as "id | name | keyword | description":\n${list}` }],
    });
    if (resp.stop_reason === "refusal") throw new Error("The model declined to pick seed pins for these boards.");
    if (resp.stop_reason === "max_tokens") throw new Error("The seed-pin proposal was cut off; try again.");
    const parsed = resp.parsed_output;
    if (!parsed) throw new Error("The seed-pin proposal came back unreadable; try again.");
    for (const b of parsed.boards) {
      if (!chunk.some((c) => c.id === b.board_id)) continue;
      const seen = new Set<string>();
      out.set(b.board_id, b.picks
        .filter((p) => known.has(p.pin_id) && !seen.has(p.pin_id) && seen.add(p.pin_id))
        .slice(0, maxPerBoard)
        .map((p) => ({ pin_id: p.pin_id, reason: clean(p.reason, 140) })));
    }
  };
  if (chunks.length > 0) await runChunk(chunks[0]);
  await Promise.all(chunks.slice(1).map(runChunk));
  return out;
}
