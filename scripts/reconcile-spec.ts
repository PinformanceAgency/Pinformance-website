import "dotenv/config";
import { Client } from "pg";

/** The 116 tasks the specification defines, by phase. */
const SPEC: Record<number, string[]> = {
  1: [
    "P1.0.1","P1.0.2","P1.0.3","P1.0.4",
    "P1.1.1","P1.1.2","P1.1.3","P1.1.4","P1.1.5","P1.1.6","P1.1.7","P1.1.8","P1.1.9","P1.1.10","P1.1.11",
    "P1.2.1","P1.2.2","P1.2.3","P1.2.4","P1.2.5","P1.2.6","P1.2.7","P1.2.8","P1.2.9","P1.2.10","P1.2.11","P1.2.12","P1.2.13","P1.2.14","P1.2.15",
    "P1.3.1","P1.3.2","P1.3.3","P1.3.4","P1.3.5","P1.3.6","P1.3.7","P1.3.8","P1.3.9","P1.3.10","P1.3.11","P1.3.12","P1.3.13","P1.3.14",
  ],
  2: [
    "P2.1.1","P2.1.2","P2.1.3","P2.1.4","P2.1.5","P2.1.6","P2.1.7",
    "P2.2.1","P2.2.2",
    "P2.3.1","P2.3.2","P2.3.3",
    "P2.4.1","P2.4.2",
  ],
  3: [
    "P3.1.1","P3.1.2","P3.1.3","P3.1.4","P3.1.5","P3.1.6","P3.1.7","P3.1.8","P3.1.9","P3.1.10","P3.1.11","P3.1.12","P3.1.13","P3.1.14",
    "P3.2.1","P3.2.2","P3.2.3",
    "P3.3.1","P3.3.2","P3.3.3","P3.3.4","P3.3.5","P3.3.6","P3.3.7","P3.3.8",
  ],
  4: [
    "P4.1.1","P4.1.2","P4.1.3","P4.1.4","P4.1.5","P4.1.6","P4.1.7","P4.1.8",
    "P4.2.1","P4.2.2","P4.2.3","P4.2.4","P4.2.5","P4.2.6","P4.2.7","P4.2.8","P4.2.9","P4.2.10",
    "P4.3.1","P4.3.2",
    "P4.4.1","P4.4.2",
  ],
  5: [
    "P5.1.1","P5.1.2","P5.1.3","P5.1.4",
    "P5.2.1","P5.2.2","P5.2.3",
    "P5.3.1","P5.3.2","P5.3.3","P5.3.4",
  ],
};

/** Type each task should have per the specification. */
const SPEC_TYPES: Record<string, string> = {
  "P1.0.1":"IN_DASHBOARD","P1.0.2":"IN_DASHBOARD","P1.0.3":"AUTO","P1.0.4":"IN_DASHBOARD",
  "P1.1.1":"IN_DASHBOARD","P1.1.2":"IN_DASHBOARD","P1.1.3":"IN_DASHBOARD","P1.1.4":"EXTERNAL",
  "P1.1.5":"IN_DASHBOARD","P1.1.6":"EXTERNAL","P1.1.7":"EXTERNAL","P1.1.8":"EXTERNAL",
  "P1.1.9":"EXTERNAL","P1.1.10":"EXTERNAL","P1.1.11":"IN_DASHBOARD",
  "P1.2.1":"EXTERNAL","P1.2.2":"EXTERNAL","P1.2.3":"EXTERNAL","P1.2.4":"AUTO","P1.2.5":"AUTO",
  "P1.2.6":"EXTERNAL","P1.2.7":"IN_DASHBOARD","P1.2.8":"AUTO","P1.2.9":"AUTO","P1.2.10":"EXTERNAL",
  "P1.2.11":"AUTO","P1.2.12":"IN_DASHBOARD","P1.2.13":"AUTO","P1.2.14":"AUTO","P1.2.15":"EXTERNAL",
  "P1.3.1":"AUTO","P1.3.2":"EXTERNAL","P1.3.3":"EXTERNAL","P1.3.4":"EXTERNAL","P1.3.5":"AUTO",
  "P1.3.6":"EXTERNAL","P1.3.7":"EXTERNAL","P1.3.8":"EXTERNAL","P1.3.9":"IN_DASHBOARD",
  "P1.3.10":"IN_DASHBOARD","P1.3.11":"EXTERNAL","P1.3.12":"EXTERNAL","P1.3.13":"EXTERNAL","P1.3.14":"IN_DASHBOARD",
  "P2.1.1":"IN_DASHBOARD","P2.1.2":"EXTERNAL","P2.1.3":"IN_DASHBOARD","P2.1.4":"IN_DASHBOARD",
  "P2.1.5":"IN_DASHBOARD","P2.1.6":"EXTERNAL","P2.1.7":"IN_DASHBOARD",
  "P2.2.1":"AI_DRAFT","P2.2.2":"IN_DASHBOARD",
  "P2.3.1":"IN_DASHBOARD","P2.3.2":"EXTERNAL","P2.3.3":"IN_DASHBOARD",
  "P2.4.1":"EXTERNAL","P2.4.2":"AUTO",
  "P3.1.1":"EXTERNAL","P3.1.2":"EXTERNAL","P3.1.3":"IN_DASHBOARD","P3.1.4":"AUTO","P3.1.5":"EXTERNAL",
  "P3.1.6":"AUTO","P3.1.7":"AUTO","P3.1.8":"EXTERNAL","P3.1.9":"IN_DASHBOARD","P3.1.10":"IN_DASHBOARD",
  "P3.1.11":"IN_DASHBOARD","P3.1.12":"IN_DASHBOARD","P3.1.13":"AUTO","P3.1.14":"IN_DASHBOARD",
  "P3.2.1":"AI_DRAFT","P3.2.2":"AI_DRAFT","P3.2.3":"EXTERNAL",
  "P3.3.1":"IN_DASHBOARD","P3.3.2":"AUTO","P3.3.3":"AI_DRAFT","P3.3.4":"AUTO","P3.3.5":"AUTO",
  "P3.3.6":"IN_DASHBOARD","P3.3.7":"AUTO","P3.3.8":"AUTO",
  "P4.1.1":"AUTO","P4.1.2":"AUTO","P4.1.3":"IN_DASHBOARD","P4.1.4":"IN_DASHBOARD","P4.1.5":"IN_DASHBOARD",
  "P4.1.6":"IN_DASHBOARD","P4.1.7":"IN_DASHBOARD","P4.1.8":"IN_DASHBOARD",
  "P4.2.1":"EXTERNAL","P4.2.2":"IN_DASHBOARD","P4.2.3":"AUTO","P4.2.4":"EXTERNAL","P4.2.5":"EXTERNAL",
  "P4.2.6":"AUTO","P4.2.7":"IN_DASHBOARD","P4.2.8":"AI_DRAFT","P4.2.9":"AUTO","P4.2.10":"IN_DASHBOARD",
  "P4.3.1":"AUTO","P4.3.2":"IN_DASHBOARD",
  "P4.4.1":"AUTO","P4.4.2":"AUTO",
  "P5.1.1":"AUTO","P5.1.2":"EXTERNAL","P5.1.3":"IN_DASHBOARD","P5.1.4":"EXTERNAL",
  "P5.2.1":"AUTO","P5.2.2":"IN_DASHBOARD","P5.2.3":"IN_DASHBOARD",
  "P5.3.1":"EXTERNAL","P5.3.2":"EXTERNAL","P5.3.3":"AI_DRAFT","P5.3.4":"IN_DASHBOARD",
};

/** Tasks added beyond the 116, per OPEN ITEM 2 of the spec. */
const SANCTIONED_ADDITIONS = new Set(["P1.3.15","P1.3.16","P1.3.17","P5.4.1","P5.5.1"]);

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  const live = await c.query<{ id: string; phase: number; task_type: string; is_recurring: boolean; active: boolean; guidance: string | null }>(
    `SELECT id, phase, task_type::text, is_recurring, active, guidance
       FROM organic.task_definitions ORDER BY phase, sort_order`
  );
  const liveById = new Map(live.rows.map((r) => [r.id, r]));
  const specAll = Object.values(SPEC).flat();

  console.log("=".repeat(70));
  console.log("TASK COUNT · spec vs live");
  console.log("=".repeat(70));
  let specTotal = 0, liveTotal = 0;
  for (const phase of [1, 2, 3, 4, 5]) {
    const specN = SPEC[phase].length;
    const liveRows = live.rows.filter((r) => r.phase === phase);
    const liveN = liveRows.length;
    const extras = liveRows.filter((r) => !SPEC[phase].includes(r.id)).map((r) => r.id);
    specTotal += specN; liveTotal += liveN;
    const delta = liveN - specN;
    console.log(
      `  Phase ${phase}:  spec ${String(specN).padStart(3)}   live ${String(liveN).padStart(3)}   ` +
      (delta === 0 ? "match" : `${delta > 0 ? "+" : ""}${delta}  → ${extras.join(", ")}`)
    );
  }
  console.log(`  ${"-".repeat(60)}`);
  console.log(`  TOTAL:    spec ${specTotal}   live ${liveTotal}   (${liveTotal - specTotal > 0 ? "+" : ""}${liveTotal - specTotal})`);

  console.log();
  console.log("=".repeat(70));
  console.log("MISSING · in spec but not in DB");
  console.log("=".repeat(70));
  const missing = specAll.filter((id) => !liveById.has(id));
  if (missing.length === 0) console.log("  none — all 116 spec tasks exist");
  else for (const m of missing) console.log(`  ✗ ${m}`);

  console.log();
  console.log("=".repeat(70));
  console.log("EXTRA · in DB but not in the 116");
  console.log("=".repeat(70));
  const extra = live.rows.filter((r) => !specAll.includes(r.id));
  for (const e of extra) {
    const ok = SANCTIONED_ADDITIONS.has(e.id);
    console.log(`  ${ok ? "✓ sanctioned" : "? unlisted  "} ${e.id.padEnd(9)} phase ${e.phase}  ${e.task_type}`);
  }

  console.log();
  console.log("=".repeat(70));
  console.log("TYPE MISMATCH · spec type vs live task_type");
  console.log("=".repeat(70));
  const mismatches: Array<{ id: string; spec: string; live: string }> = [];
  for (const [id, wantType] of Object.entries(SPEC_TYPES)) {
    const row = liveById.get(id);
    if (!row) continue;
    if (row.task_type !== wantType) mismatches.push({ id, spec: wantType, live: row.task_type });
  }
  if (mismatches.length === 0) console.log("  none — every task type matches the spec");
  else for (const m of mismatches) console.log(`  ${m.id.padEnd(9)} spec=${m.spec.padEnd(13)} live=${m.live}`);

  console.log();
  console.log("=".repeat(70));
  console.log("TYPE DISTRIBUTION · spec target vs live actual (116 spec tasks only)");
  console.log("=".repeat(70));
  const specDist: Record<string, number> = {};
  const liveDist: Record<string, number> = {};
  for (const [, t] of Object.entries(SPEC_TYPES)) specDist[t] = (specDist[t] ?? 0) + 1;
  for (const id of specAll) {
    const r = liveById.get(id);
    if (r) liveDist[r.task_type] = (liveDist[r.task_type] ?? 0) + 1;
  }
  for (const t of ["IN_DASHBOARD","EXTERNAL","AUTO","AI_DRAFT"]) {
    const s = specDist[t] ?? 0, l = liveDist[t] ?? 0;
    console.log(`  ${t.padEnd(14)} spec ${String(s).padStart(3)} (${String(Math.round(s/116*100)).padStart(2)}%)   live ${String(l).padStart(3)} (${String(Math.round(l/116*100)).padStart(2)}%)   ${s === l ? "match" : `${l - s > 0 ? "+" : ""}${l - s}`}`);
  }

  console.log();
  console.log("=".repeat(70));
  console.log("GUIDANCE COVERAGE");
  console.log("=".repeat(70));
  const noGuidance = live.rows.filter((r) => !r.guidance || r.guidance.trim().length < 20);
  console.log(`  ${live.rows.length - noGuidance.length}/${live.rows.length} tasks have guidance text`);
  if (noGuidance.length > 0) {
    console.log(`  missing/thin on: ${noGuidance.map((r) => r.id).join(", ")}`);
  }

  console.log();
  console.log("=".repeat(70));
  console.log("RECURRING FLAG · phases 4+5 should be recurring, 1-3 should not");
  console.log("=".repeat(70));
  const wrongRecurring = live.rows.filter((r) =>
    (r.phase <= 3 && r.is_recurring) || (r.phase >= 4 && !r.is_recurring)
  );
  if (wrongRecurring.length === 0) console.log("  none — every task has the right recurring flag");
  else for (const r of wrongRecurring) console.log(`  ${r.id.padEnd(9)} phase ${r.phase}  is_recurring=${r.is_recurring}`);

  await c.end();
  process.exit(0);
})().catch((e) => { console.error("FAIL:", (e as Error).message); process.exit(1); });
