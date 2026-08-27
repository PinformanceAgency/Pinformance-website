/**
 * Re-derive the status of the two viability checks against today's rules.
 *
 * WHY THIS EXISTS
 * ---------------
 * P1.0.1 and P1.0.2 close themselves once every visible question is
 * answered (syncTaskStatusFromAnswers), and that runs only when somebody
 * saves an answer. So when the questions change, the stores assessed
 * before the change keep whatever status they had — which is fine while a
 * change only adds wording, and wrong the moment it adds a question.
 *
 * On 27-08-2026 it added one: a "no" on a good-fit signal, or a "yes" on a
 * red flag, now opens a plan box that has to be filled in. Stores assessed
 * before that are sitting at DONE with flags raised and no plan next to
 * them — which is exactly the state the change exists to prevent, so they
 * need re-deriving rather than grandfathering.
 *
 * It only ever re-derives. It cannot invent a status: a task with every
 * question answered stays DONE, a BLOCKED or SKIPPED task is never touched
 * (same refusals as the live sync), and no answer is read, written or
 * cleared. Reopening is reversible by answering the plan box, which is the
 * work it is asking for.
 *
 * RUN
 *     RESYNC_DRY_RUN=1 DOTENV_CONFIG_PATH=.env.local npx tsx scripts/resync-viability-tasks.ts
 *     DOTENV_CONFIG_PATH=.env.local npx tsx scripts/resync-viability-tasks.ts
 */
import "dotenv/config";
import { organicPool } from "../src/lib/organic/db";
import { deriveTaskStatusFromAnswers, syncTaskStatusFromAnswers } from "../src/lib/organic/workspace";

const TASKS = ["P1.0.1", "P1.0.2"];
const DRY = process.env.RESYNC_DRY_RUN === "1";

async function main() {
  const pool = organicPool();

  // answers is the count of questions actually answered on that task. A
  // task with none has not been assessed at all, and the live sync would
  // never see it — it only runs off somebody saving an answer. Deriving it
  // here anyway would move an untouched TODO to IN_PROGRESS and report
  // work that nobody has started.
  const { rows } = await pool.query<{
    org_id: string; name: string; task_id: string; status: string; answers: string;
  }>(
    `SELECT ct.org_id::text, o.name, ct.task_id, ct.status::text,
            (SELECT count(*) FROM organic.task_answers a
              WHERE a.org_id = ct.org_id AND a.task_id = ct.task_id) AS answers
       FROM organic.client_tasks ct
       JOIN public.organizations o ON o.id = ct.org_id
      WHERE ct.task_id = ANY($1) AND ct.cycle IS NULL
      ORDER BY o.name, ct.task_id`,
    [TASKS]
  );

  console.log(`${DRY ? "DRY RUN — " : ""}${rows.length} task row(s) across ${new Set(rows.map((r) => r.org_id)).size} store(s)\n`);

  const changes: Array<{ name: string; task: string; from: string; to: string }> = [];
  let untouched = 0;

  for (const r of rows) {
    if (Number(r.answers) === 0) { untouched++; continue; }
    const d = await deriveTaskStatusFromAnswers(r.org_id, r.task_id);
    // null = the sync would refuse this one too (blocked, skipped, no
    // checklist). Reported as untouched rather than silently dropped.
    if (!d || d.next === d.current) { untouched++; continue; }

    changes.push({ name: r.name, task: r.task_id, from: d.current, to: d.next });
    if (!DRY) await syncTaskStatusFromAnswers(r.org_id, r.task_id);
  }

  if (changes.length === 0) {
    console.log("Nothing to change — every viability check already agrees with the rules.");
  } else {
    console.log(`${DRY ? "Would change" : "Changed"} ${changes.length}:\n`);
    for (const c of changes) {
      console.log(`  ${c.from.padEnd(12)} → ${c.to.padEnd(12)}  ${c.task}  ${c.name}`);
    }
  }
  console.log(`\n${untouched} left as they are.`);

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
