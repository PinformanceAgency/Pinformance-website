/**
 * Run the delivery meeting pipeline locally — any stage, or all of them.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/delivery-meeting.ts all --date 2026-09-29 --dry-run
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/delivery-meeting.ts collect --date 2026-09-29 --force
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/delivery-meeting.ts check
 *
 *   <stage>     collect | targets | compute | render | deliver | all | check
 *               a stage runs everything up to and including it that is not done yet
 *   --date      the meeting Tuesday (default: this week's)
 *   --dry-run   files go to ./tmp/delivery-meeting/<date>/, nothing goes to monday
 *               and the runs stay at "deliver" so the real cron still delivers
 *   --force     throw away the runs for that date and collect again
 *   --stream    dropship | branded (default: both)
 *   --test      deliver to Tristan's group with "[TEST]" in the name, not to Tycho
 *
 * Locally there is no 60-second budget: every stage runs to the end.
 * Writes the run rows in delivery_meeting_runs, like the cron does.
 */
import "dotenv/config";
import { ROUTE_STAGES, STREAMS, type Stage, type Stream } from "../src/lib/delivery-meeting/constants";
import { advance, check } from "../src/lib/delivery-meeting/pipeline";
import { meetingTuesday } from "../src/lib/delivery-meeting/util";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

(async () => {
  const stage = (args[0] ?? "all") as Stage | "all" | "check";
  if (stage !== "all" && !(ROUTE_STAGES as readonly string[]).includes(stage)) {
    console.error(`Unknown stage "${stage}". One of: ${ROUTE_STAGES.join(", ")}, all`);
    process.exit(1);
  }
  const meetingDate = value("date") ?? meetingTuesday();
  if (stage === "check") {
    const r = await check(meetingDate);
    console.log(r.ok ? `${meetingDate}: all runs done` : r.problems.join("\n"));
    process.exit(r.ok ? 0 : 1);
  }
  const stream = value("stream") as Stream | undefined;
  if (stream && !STREAMS.includes(stream)) throw new Error(`--stream must be one of ${STREAMS.join(", ")}`);
  const dryRun = flag("dry-run");
  const res = await advance({
    meetingDate,
    ceiling: stage === "all" ? "deliver" : (stage as Stage),
    budgetMs: Infinity,
    dryRun,
    force: flag("force"),
    test: flag("test"),
    // a manual run delivers when it is done, not at the meeting's hour
    ignoreSchedule: true,
    streams: stream ? [stream] : undefined,
    outDir: dryRun ? `tmp/delivery-meeting/${meetingDate}` : undefined,
  });
  for (const [s, r] of Object.entries(res.streams)) {
    console.log(`\n${s}: now at "${r.stage}" (${r.status})${r.error ? ` — ${r.error}` : ""}`);
  }
  console.log(`\n${Math.round(res.elapsed_ms / 1000)} s${res.delivered.length ? `, delivered: ${res.delivered.join(", ")}` : ""}`);
  process.exit(Object.values(res.streams).some((r) => r.status === "error") ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
