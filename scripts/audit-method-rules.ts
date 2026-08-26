/**
 * Does the build obey the method's hard numbers?
 *
 * PINTEREST ORGANIC — BUILD REFERENCE section 2 lists every enforceable
 * value, and section 7 lists the constraints that are supposed to be
 * enforced in the database rather than in application code. This checks
 * both, against the live schema and the live code, and fails on any
 * divergence.
 *
 * It exists because I got one of them wrong by inventing a rule: the
 * save/click split was derived from the grid's overlay reading, when the
 * method fixes it at 80/20 and decides overlay by URL page type. A rule
 * invented in code looks exactly like a rule from the method three months
 * later, and nothing in the repo could tell them apart.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/audit-method-rules.ts
 */
import "dotenv/config";
import { readFileSync } from "fs";
import { Client } from "pg";
import { productionSplit } from "../src/lib/organic/brief";
import { validateCopy } from "../src/lib/organic/phase4";

const rows: Array<{ rule: string; ok: boolean; found: string }> = [];
const check = (rule: string, ok: boolean, found: string) => rows.push({ rule, ok, found });

(async () => {
  const c = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  const constraints = await c.query<{ table_name: string; def: string }>(
    `SELECT rel.relname AS table_name, pg_get_constraintdef(con.oid) AS def
       FROM pg_constraint con
       JOIN pg_class rel ON rel.oid = con.conrelid
       JOIN pg_namespace n ON n.oid = rel.relnamespace
      WHERE n.nspname = 'organic' AND con.contype = 'c'`
  );
  const defs = constraints.rows.map((r) => `${r.table_name}: ${r.def}`);
  const hasConstraint = (table: string, needle: RegExp) =>
    defs.some((d) => d.startsWith(`${table}:`) && needle.test(d));

  /* ---- COPY (section 2) ------------------------------------------- */
  const longTitle = "x".repeat(101);
  check("Title max 100 characters",
    !validateCopy({ primary_keyword: "x", title: longTitle, description: "y".repeat(260) }).ok,
    "101-char title rejected");
  check("Description 250-300 characters",
    !validateCopy({ primary_keyword: "x", title: "x ok", description: "y".repeat(249) }).ok
      && !validateCopy({ primary_keyword: "x", title: "x ok", description: "y".repeat(301) }).ok,
    "249 and 301 both rejected");
  for (const [label, bad] of [["exclamation mark", "!"], ["hashtag", "#"], ["em-dash", "—"], ["en-dash", "–"]] as const) {
    check(`No ${label} in copy`,
      !validateCopy({ primary_keyword: "x", title: `x ok ${bad}`, description: "y".repeat(260) }).ok,
      `"${bad}" rejected`);
  }
  check("Tagline 4-9 words ideal, 12 max",
    !validateCopy({ primary_keyword: "x", title: "x ok", description: "y".repeat(260),
                    tagline: "x one two" }).ok,
    "3-word tagline rejected");
  check("Title keyword at the front",
    !validateCopy({ primary_keyword: "swimwear", title: "A long preamble before swimwear appears here at last",
                    description: "y".repeat(260) }).ok,
    "keyword buried past the opening rejected");

  /* ---- DESIGN (section 2) ----------------------------------------- */
  const product = productionSplit("PRODUCT", null);
  const collection = productionSplit("COLLECTION", null);
  check("Save/click split fixed at 80/20",
    product.save_split_pct === 80 && product.click_split_pct === 20
      && collection.save_split_pct === 80 && collection.click_split_pct === 20,
    `product ${product.save_split_pct}/${product.click_split_pct}, collection ${collection.save_split_pct}/${collection.click_split_pct}`);
  check("Overlay decided by URL page type, not by the grid",
    product.overlay === false && collection.overlay === true,
    `product overlay ${product.overlay}, collection overlay ${collection.overlay}`);

  /* ---- WATERFALL (section 4) -------------------------------------- */
  const src = readFileSync("src/lib/organic/phase4.ts", "utf8");
  check("Board rotation uses % boardCount, not a hardcoded 4",
    /boardPos\s*=\s*\(designIndex \+ copyIndex\) % boards\.length/.test(src),
    /% boards\.length/.test(src) ? "(designIndex + copyIndex) % boards.length" : "hardcoded modulus");
  check("Sequence loops copy outer, design inner",
    /designIndex = \(s - 1\) % 4/.test(src) && /copyIndex\s*=\s*Math\.floor\(\(s - 1\) \/ 4\)/.test(src),
    "D1-A, D2-A, D3-A, D4-A, D1-B …");
  check("Four copy sets per URL, shared across a design's crops",
    /copySetIds\[designIndex\]/.test(src),
    "copy set indexed by design, not by pin");
  check("Dates are startDate + n x spacingDays",
    /dayOffset\s*=\s*\(s - 1\) \* spacingDays/.test(src),
    "n x spacingDays");

  /* ---- DATABASE CONSTRAINTS (section 7) --------------------------- */
  const dbRules: Array<[string, string, RegExp]> = [
    ["No homepage URLs (regex)", "urls", /~|regex|!~/i],
    ["Title max 100 chars enforced in DB", "copy_sets", /char_length\(title\)\s*<=\s*100/],
    ["Description 250-300 enforced in DB", "copy_sets", /char_length\(description\)[^)]*250/],
    ["No em-dash / en-dash / ! / # in copy", "copy_sets", /!~/],
    ["Board description 400-500 chars", "boards", /char_length\(description\)[^)]*400/],
  ];
  for (const [rule, table, needle] of dbRules) {
    check(rule, hasConstraint(table, needle), hasConstraint(table, needle) ? "constraint present" : `no CHECK on organic.${table}`);
  }

  /* ---- PACING (section 2) ----------------------------------------- */
  const pacing = await c.query<{ account_class: string; spacing_hours: number; n: string }>(
    `SELECT account_class::text, spacing_hours, COUNT(*)::text AS n
       FROM organic.client_settings GROUP BY 1, 2 ORDER BY 1`);
  const wrong = pacing.rows.filter((r) =>
    (r.account_class === "NEW" && r.spacing_hours !== 48) ||
    (r.account_class === "ESTABLISHED" && r.spacing_hours !== 24));
  check("NEW = 48h spacing, ESTABLISHED = 24h",
    wrong.length === 0,
    pacing.rows.map((r) => `${r.account_class} ${r.spacing_hours}h x${r.n}`).join(", ") || "no stores");

  const overCap = await c.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM organic.client_settings WHERE daily_pin_target > 20`);
  check("Absolute ceiling 20 pins/day", Number(overCap.rows[0].n) === 0,
    `${overCap.rows[0].n} store(s) above 20`);

  /* ---- VOLUME CACHE (section 7) ----------------------------------- */
  const cacheCols = await c.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'organic' AND table_name = 'keyword_volume_cache'`);
  const names = cacheCols.rows.map((r) => r.column_name);
  check("Volume cache is agency-wide (no org_id scoping)",
    !names.includes("org_id"),
    names.includes("looked_up_for_org")
      ? "looked_up_for_org present as provenance only — not a scope column"
      : "no org column");

  /* ---- URLS (section 2) ------------------------------------------- */
  const cooldown = await c.query<{ v: string }>(
    `SELECT DISTINCT url_cooldown_days::text AS v FROM organic.client_settings`);
  check("URL cooldown 60 days",
    cooldown.rows.every((r) => r.v === "60"),
    cooldown.rows.map((r) => r.v + "d").join(", ") || "no stores");

  /* ---- REPORT ----------------------------------------------------- */
  const w = Math.max(...rows.map((r) => r.rule.length));
  console.log("=".repeat(w + 50));
  console.log("METHOD COMPLIANCE — PINTEREST ORGANIC BUILD REFERENCE");
  console.log("=".repeat(w + 50));
  for (const r of rows) {
    console.log(`  ${r.ok ? "ok    " : "FAIL  "} ${r.rule.padEnd(w)}  ${r.found}`);
  }
  const failed = rows.filter((r) => !r.ok);
  console.log(`\n${rows.length - failed.length} of ${rows.length} rules hold, ${failed.length} broken`);
  await c.end();
  process.exit(failed.length > 0 ? 1 : 0);
})().catch((e) => {
  console.error("audit failed:", (e as Error).message);
  process.exit(1);
});
