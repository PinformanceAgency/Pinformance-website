/**
 * Bring each store's posting cap in line with what is actually planned for it.
 *
 * WHY
 * ---
 * The scheduling action lets you plan up to 50 pins a day and never looks at
 * `settings.max_pins_per_day`, which the posting cron enforces at 5. Measured
 * 27-08-2026: Celestia, Icon Amsterdam and Valerie Mason were all being planned
 * at 15 a day against a cap of 5, so each of them accumulated ten pins of
 * backlog every day — no matter how well the cron ran. That is where the 868
 * queued pins came from, and on the pins page it looks identical to a broken
 * scheduler.
 *
 * This closes the gap from the cap side; `/api/pins/bulk` now refuses to plan
 * above the cap, which closes it from the planning side. Both are needed: only
 * raising caps lets the next over-plan rebuild the backlog, and only guarding
 * the planner leaves today's plan undeliverable.
 *
 * WHAT IT SETS
 * ------------
 *   max_pins_per_day        = min(20, max(current, median planned per day))
 *   min_post_interval_minutes = min(current, floor(1440 / new cap))
 *
 * The 20 is the organic method's own absolute ceiling (see audit-method-rules).
 * A store planned above it is a planning mistake, not a cap to raise to.
 *
 * The interval matters as much as the cap and is easy to forget: a cap of 15 a
 * day with 180 minutes between pins still only delivers 8, because the interval
 * binds first. It is only ever lowered — never raised past what somebody chose.
 *
 * Median, not mean: one 60-pin day would otherwise drag a store planned at 15 a
 * day up to a cap nobody asked for. Only future-dated pins count, because
 * overdue ones pile onto their original date and would inflate it.
 *
 * RUN
 *     ALIGN_CAPS_DRY_RUN=1 DOTENV_CONFIG_PATH=.env.local npx tsx scripts/align-posting-caps.ts
 *     DOTENV_CONFIG_PATH=.env.local npx tsx scripts/align-posting-caps.ts
 */
import "dotenv/config";
import { Client } from "pg";

const DRY = process.env.ALIGN_CAPS_DRY_RUN === "1";
const METHOD_CEILING = 20;

interface Row {
  id: string;
  name: string;
  cap: number;
  interval_min: number;
  median_per_day: number;
}

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  const { rows } = await c.query<Row>(`
    WITH future AS (
      SELECT p.org_id, p.scheduled_at::date d, count(*)::int n
        FROM public.pins p
       WHERE p.status IN ('scheduled','approved') AND p.scheduled_at > now()
       GROUP BY 1, 2
    )
    SELECT o.id::text,
           o.name,
           COALESCE((o.settings->>'max_pins_per_day')::int, 5)          AS cap,
           COALESCE((o.settings->>'min_post_interval_minutes')::int, 30) AS interval_min,
           percentile_disc(0.5) WITHIN GROUP (ORDER BY f.n)::int         AS median_per_day
      FROM future f JOIN public.organizations o ON o.id = f.org_id
     GROUP BY o.id, o.name, o.settings
     ORDER BY 5 DESC`);

  const changes: Array<{ row: Row; cap: number; interval: number; note: string }> = [];
  for (const r of rows) {
    const cap = Math.min(METHOD_CEILING, Math.max(r.cap, r.median_per_day));
    const interval = Math.min(r.interval_min, Math.floor(1440 / cap));
    if (cap === r.cap && interval === r.interval_min) continue;
    const note = r.median_per_day > METHOD_CEILING
      ? `planned ${r.median_per_day}/day — above the method ceiling of ${METHOD_CEILING}, capped there`
      : "";
    changes.push({ row: r, cap, interval, note });
  }

  if (changes.length === 0) {
    console.log("Niets te doen — elke store mag posten wat er voor hem gepland staat.");
    await c.end();
    return;
  }

  console.log(`${DRY ? "DROOGLOOP — " : ""}${changes.length} store(s) aanpassen:\n`);
  for (const ch of changes) {
    console.log(
      `  ${ch.row.name.padEnd(22)} gepland ${String(ch.row.median_per_day).padStart(2)}/dag` +
      `   cap ${ch.row.cap} → ${ch.cap}` +
      `   interval ${ch.row.interval_min} → ${ch.interval} min` +
      (ch.note ? `   (${ch.note})` : "")
    );
  }

  if (DRY) {
    console.log("\nDroogloop: er is niets gewijzigd.");
    await c.end();
    return;
  }

  for (const ch of changes) {
    // Merge into the jsonb, never replace it — settings also carries
    // posting_hours, content_mix and the rest.
    await c.query(
      `UPDATE public.organizations
          SET settings = COALESCE(settings, '{}'::jsonb)
                         || jsonb_build_object('max_pins_per_day', $2::int,
                                               'min_post_interval_minutes', $3::int)
        WHERE id = $1`,
      [ch.row.id, ch.cap, ch.interval]
    );
  }
  console.log(`\n${changes.length} store(s) bijgewerkt.`);
  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
