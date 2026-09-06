/**
 * Re-derive BLOCKED / TODO for every organic client.
 *
 * Needed because one path used to skip it: a checklist task closed by
 * answering its last question set itself to DONE and never recomputed, so
 * the tasks waiting on it stayed BLOCKED. That is invisible from every
 * screen — the dependent task simply sits there greyed out, and the person
 * looking at it concludes the tool is broken for them.
 *
 * `syncTaskStatusFromAnswers` recomputes now; this repairs whatever the
 * old behaviour left behind, and is safe to run again at any time.
 *
 *   RECOMPUTE_DRY_RUN=1 DOTENV_CONFIG_PATH=.env.local npx tsx scripts/recompute-task-blocks.ts
 */
import "dotenv/config";
import { organicPool } from "../src/lib/organic/db";
import { recomputeStatuses } from "../src/lib/organic/status";

const DRY = process.env.RECOMPUTE_DRY_RUN === "1";

(async () => {
  const pool = organicPool();
  const orgs = (await pool.query(
    `SELECT o.id, o.name FROM organic.client_settings cs
       JOIN organizations o ON o.id = cs.org_id ORDER BY o.name`
  )).rows as Array<{ id: string; name: string }>;

  let changedTotal = 0;
  for (const o of orgs) {
    const snap = async () => new Map((await pool.query(
      `SELECT task_id, status::text FROM organic.client_tasks WHERE org_id=$1 AND cycle IS NULL`, [o.id]
    )).rows.map((r) => [r.task_id as string, r.status as string]));

    const before = await snap();
    if (DRY) {
      // Recompute, read the difference, then put every row back exactly as it was.
      await recomputeStatuses(o.id);
      const after = await snap();
      const diff = [...after].filter(([t, s]) => before.get(t) !== s);
      for (const [t, s] of diff) {
        console.log(`  ${o.name}: ${t} ${before.get(t)} → ${s}`);
      }
      for (const [t, s] of before) {
        await pool.query(
          `UPDATE organic.client_tasks SET status=$1::organic.task_status
            WHERE org_id=$2 AND task_id=$3 AND cycle IS NULL AND status::text <> $1`,
          [s, o.id, t]);
      }
      changedTotal += diff.length;
      continue;
    }

    await recomputeStatuses(o.id);
    const after = await snap();
    const diff = [...after].filter(([t, s]) => before.get(t) !== s);
    for (const [t, s] of diff) console.log(`  ${o.name}: ${t} ${before.get(t)} → ${s}`);
    changedTotal += diff.length;
  }

  console.log(`${DRY ? "[dry run] " : ""}${changedTotal} task status change(s) across ${orgs.length} client(s).`);
  process.exit(0);
})();
