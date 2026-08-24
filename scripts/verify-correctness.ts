import "dotenv/config";
import { Client } from "pg";
import { computeDeltas, loadSetupState, loadBaseline, type BaselineRow } from "../src/lib/organic/phase5";
import { loadClientList, loadClientHeader } from "../src/lib/organic/queries";

const ABBEY = "480b2b09-0885-4273-813e-cb7386ef4ba6";
let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`  ${ok ? "✓" : "✗"} ${label}`);
  if (detail) console.log(`      ${detail}`);
  if (!ok) failures++;
}

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  console.log("=".repeat(72));
  console.log("STAGE 0 · CORRECTNESS");
  console.log("=".repeat(72));

  // ---- DEFECT 1 · cycle tasks must not inflate the phase rollup ----
  console.log("\nDEFECT 1 · phase rollup excludes cycle-scoped tasks");
  const withCycles = await c.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM organic.client_tasks WHERE org_id=$1 AND cycle IS NOT NULL`, [ABBEY]);
  const phase4 = await c.query<{ total: string }>(
    `SELECT total_tasks::text AS total FROM organic.client_progress WHERE org_id=$1 AND phase=4`, [ABBEY]);
  const defs4 = await c.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM organic.task_definitions WHERE phase=4 AND active`);
  check("phase-4 rollup never exceeds the task-definition count",
    phase4.rowCount === 0 || Number(phase4.rows[0].total) <= defs4.rows[0].n,
    `${withCycles.rows[0].n} cycle task(s) exist; phase-4 rollup total = ${phase4.rowCount ? phase4.rows[0].total : "no row (correct — phase 4 is cycle-only)"}, definitions = ${defs4.rows[0].n}`);

  // ---- DEFECT 2 · SKIPPED is visible ----
  console.log("\nDEFECT 2 · SKIPPED reported separately from outstanding");
  const cols = await c.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema='organic' AND table_name='client_progress'
        AND column_name IN ('skipped_tasks','outstanding_tasks')`);
  check("client_progress exposes skipped_tasks and outstanding_tasks",
    cols.rowCount === 2, `columns present: ${cols.rows.map(r => r.column_name).join(", ") || "none"}`);

  // ---- DEFECT 3 · list and detail agree ----
  console.log("\nDEFECT 3 · client list and client detail agree");
  const [list, header] = await Promise.all([loadClientList(), loadClientHeader(ABBEY)]);
  const listRow = list.find((r) => r.org_id === ABBEY)!;
  const onboardingPhases = (header?.phases ?? []).filter((p) => p.phase <= 3);
  const detailTotal = onboardingPhases.reduce((s, p) => s + p.total_tasks, 0);
  const detailDone  = onboardingPhases.reduce((s, p) => s + p.done_tasks, 0);
  const detailPct   = detailTotal > 0 ? Math.round((detailDone / detailTotal) * 100) : 0;
  check("onboarding % identical on both surfaces",
    listRow.pct_done === detailPct && listRow.total_tasks === detailTotal,
    `list: ${listRow.done_tasks}/${listRow.total_tasks} = ${listRow.pct_done}%   detail: ${detailDone}/${detailTotal} = ${detailPct}%`);
  check("list reports onboarding only, not a mix of one-time and recurring",
    listRow.total_tasks === detailTotal,
    `active_cycles reported separately = ${listRow.active_cycles}, onboarding_complete = ${listRow.onboarding_complete}`);

  // ---- PROVENANCE · a missing baseline must suppress every comparison ----
  console.log("\nPROVENANCE · no baseline ⇒ no percentage, ever");
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const setup = await loadSetupState(ABBEY, from, to);
  const realBaseline = await loadBaseline(ABBEY);
  const liveTotals = { OUTBOUND_CLICK: 572, SAVE: 210, IMPRESSION: 67932, PAGE_VISIT: 0, ADD_TO_CART: 0 };

  const noBase = computeDeltas(null, liveTotals, { ...setup, has_baseline: false });
  const anyPct = noBase.filter((d) => d.delta_pct !== null);
  check("zero percentage figures produced without a baseline",
    anyPct.length === 0,
    `${noBase.length} rows, ${anyPct.length} with a percentage — this is the "+466%" artefact class`);
  const suppressedReasons = new Set(noBase.map((d) => d.delta_suppressed_because));
  check("every suppressed comparison states why",
    !suppressedReasons.has(null),
    `reasons given: ${[...suppressedReasons].join(", ")}`);

  // ---- PROVENANCE · unmeasurable conversion metrics are not zero ----
  console.log("\nPROVENANCE · tag not firing ⇒ conversions are '—', not 0");
  const noTag = computeDeltas(null, liveTotals, { ...setup, conversion_tag_firing: false });
  const convRows = noTag.filter((d) => ["Page visits", "Add to cart", "Checkouts", "Conversions", "Revenue"].includes(d.name));
  const falseZeros = convRows.filter((d) => d.current === 0);
  check("no conversion metric renders as 0 when the tag is not firing",
    falseZeros.length === 0,
    `${convRows.length} conversion rows, all state=${[...new Set(convRows.map(d => d.state))].join("/")}, values=${convRows.map(d => d.current === null ? "—" : d.current).join(",")}`);

  // ---- Hard/soft tiering ----
  console.log("\nHIERARCHY · hard and soft metrics are separated");
  const withBase = computeDeltas(realBaseline as BaselineRow | null, liveTotals, setup);
  const hard = withBase.filter((d) => d.tier === "hard").map((d) => d.name);
  const soft = withBase.filter((d) => d.tier === "soft").map((d) => d.name);
  check("impressions are classified soft, outbound clicks hard",
    soft.includes("Impressions") && hard.includes("Outbound clicks"),
    `hard: ${hard.join(", ")}\n      soft: ${soft.join(", ")}`);

  console.log();
  console.log("=".repeat(72));
  console.log(failures === 0 ? "All correctness checks pass." : `${failures} CHECK(S) FAILED`);
  console.log("=".repeat(72));
  await c.end();
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error("FAIL:", (e as Error).message); console.error((e as Error).stack); process.exit(1); });
