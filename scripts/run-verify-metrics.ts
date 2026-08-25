/**
 * Run the verify-metrics cron handler locally against production data.
 *
 * A guard that only compiles is not a guard. This exercises the real
 * handler so the thing that is supposed to catch drift is itself proven
 * to run.  npx tsx scripts/run-verify-metrics.ts [days]
 */
import "dotenv/config";
import { GET } from "../src/app/api/cron/verify-metrics/route";

(async () => {
  const secret = process.env.CRON_SECRET ?? "";
  const days = process.argv[2] ?? "7";
  const req = new Request(`http://localhost/api/cron/verify-metrics?days=${days}`, {
    headers: { "x-cron-secret": secret },
  });
  const res = await GET(req as never);
  const body = await res.json();
  if (res.status !== 200) { console.log("status", res.status, JSON.stringify(body)); process.exit(1); }

  console.log(`window ${body.window.start} → ${body.window.end}`);
  console.log(`checked ${body.checked} stores · ${body.problems} flagged\n`);
  const bad = (body.stores ?? []).filter((s: { problem?: string }) => s.problem);
  const drift = bad.filter((s: { problem?: string }) => s.problem!.includes("out of line"));
  const chores = bad.filter((s: { problem?: string }) => !s.problem!.includes("out of line"));

  console.log(`LIVE MISMATCHES: ${drift.length}`);
  for (const s of drift) console.log(`  ${s.store}: ${s.problem}`);
  console.log(`\nNEEDS A HUMAN: ${chores.length}`);
  for (const s of chores.slice(0, 8)) console.log(`  ${s.store}: ${s.problem}`);
  if (chores.length > 8) console.log(`  … +${chores.length - 8} more`);
  process.exit(0);
})();
