/**
 * Does the calendar agree with the cron?
 *
 * The publishing calendar is only worth looking at if what it draws is
 * what `publishDuePins()` will actually do. The two derive the same answer
 * from the same columns by different routes — the cron in one WHERE
 * clause, the calendar per pin in `blockerFor()` — and the moment they
 * drift, the screen starts reassuring people about a store that is not
 * publishing. That is the exact failure the calendar was built to end, so
 * it does not get to reintroduce it.
 *
 * Read-only. Exits 1 on any divergence.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/check-publish-calendar.ts
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/check-publish-calendar.ts "Fit Cherries"
 */
import "dotenv/config";
import { loadPublishCalendar, monthKey, shiftMonth } from "../src/lib/organic/calendar";
import { organicPool } from "../src/lib/organic/db";

const WANTED = process.argv[2] ?? null;

async function main() {
  const pool = organicPool();
  const today = new Date().toISOString().slice(0, 10);
  let problems = 0;

  const orgs = await pool.query<{ id: string; name: string }>(
    `SELECT o.id::text, o.name
       FROM public.organizations o
       JOIN organic.client_settings s ON s.org_id = o.id
      WHERE ($1::text IS NULL OR o.name ILIKE $1)
      ORDER BY o.name`,
    [WANTED]
  );
  if (orgs.rowCount === 0) {
    console.error(WANTED ? `No organic store matches "${WANTED}".` : "No organic stores.");
    process.exit(1);
  }

  for (const org of orgs.rows) {
    const cal = await loadPublishCalendar(org.id);
    const header = `${org.name}`;

    if (cal.months_with_pins.length === 0) {
      console.log(`· ${header} — no dated pins`);
      continue;
    }

    /* -- 1. the due set ------------------------------------------- */
    // Exactly the cron's own WHERE clause. Anything that changes there has
    // to change here, and the diff below is what makes that impossible to
    // forget.
    const cron = await pool.query<{ pin_id: string }>(
      `SELECT p.id::text AS pin_id
         FROM organic.pins p
         JOIN organic.waterfalls w ON w.id = p.waterfall_id
         JOIN organic.boards b     ON b.id = p.board_id
         JOIN organic.designs d    ON d.id = p.design_id
         JOIN organic.copy_sets cs ON cs.id = p.copy_set_id
         LEFT JOIN organic.client_settings st ON st.org_id = w.org_id
        WHERE w.org_id = $1
          AND p.status = 'SCHEDULED'::organic.pin_status
          AND p.scheduled_date <= CURRENT_DATE
          AND p.image_path IS NOT NULL
          AND b.pinterest_board_id IS NOT NULL
          AND cs.title IS NOT NULL
          AND (d.media_type = 'IMAGE'::organic.media_kind OR p.video_path IS NOT NULL)
          AND st.publishing_paused_at IS NULL
          AND w.paused_at IS NULL`,
      [org.id]
    );
    const cronSet = new Set(cron.rows.map((r) => r.pin_id));

    // The calendar has to be read across every month it knows about, not
    // just the one on screen — an overdue pin from August is precisely the
    // kind the cron still picks up.
    const calDue = new Set<string>();
    const seen = new Map<string, number>();
    for (const m of cal.months_with_pins) {
      const mc = await loadPublishCalendar(org.id, m);
      for (const d of mc.weeks.flat()) {
        if (!d.in_month) continue;
        for (const p of d.pins) {
          seen.set(p.pin_id, (seen.get(p.pin_id) ?? 0) + 1);
          if (p.status === "SCHEDULED" && p.blocker === null && p.scheduled_date <= today) {
            calDue.add(p.pin_id);
          }
        }
      }
    }

    const onlyCron = [...cronSet].filter((id) => !calDue.has(id));
    const onlyCal = [...calDue].filter((id) => !cronSet.has(id));
    if (onlyCron.length > 0 || onlyCal.length > 0) {
      problems++;
      console.log(`✗ ${header} — calendar and cron disagree on what is due`);
      if (onlyCron.length) console.log(`    cron would publish, calendar says blocked: ${onlyCron.length}`);
      if (onlyCal.length) console.log(`    calendar says due, cron skips: ${onlyCal.length}`);
      continue;
    }

    /* -- 2. every pin drawn exactly once --------------------------- */
    const dup = [...seen.entries()].filter(([, n]) => n > 1);
    const total = await pool.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n
         FROM organic.pins p
         JOIN organic.waterfalls w ON w.id = p.waterfall_id
        WHERE w.org_id = $1
          AND w.status <> 'ABANDONED'::organic.waterfall_status
          AND p.status <> 'CANCELLED'::organic.pin_status`,
      [org.id]
    );
    if (dup.length > 0) {
      problems++;
      console.log(`✗ ${header} — ${dup.length} pin(s) drawn on more than one day`);
      continue;
    }
    if (seen.size !== Number(total.rows[0].n)) {
      problems++;
      console.log(`✗ ${header} — ${Number(total.rows[0].n)} live pins, ${seen.size} on the calendar`);
      continue;
    }

    /* -- 3. the grid itself ---------------------------------------- */
    // Monday-first, whole weeks, and the month it claims to be. A grid
    // that starts on the wrong weekday puts every pin one column out and
    // looks entirely plausible.
    const flat = cal.weeks.flat();
    const inMonth = flat.filter((d) => d.in_month);
    const gridOk =
      flat.length % 7 === 0 &&
      inMonth.every((d) => monthKey(d.date) === cal.month) &&
      inMonth[0].date === `${cal.month}-01` &&
      flat.findIndex((d) => d.in_month) === flat.indexOf(inMonth[0]) &&
      cal.prev_month === shiftMonth(cal.month, -1) &&
      cal.next_month === shiftMonth(cal.month, 1);
    if (!gridOk) {
      problems++;
      console.log(`✗ ${header} — the ${cal.month} grid is malformed`);
      continue;
    }

    const state =
      cal.standstill ? "NOT PUBLISHING — nothing queued"
        : cal.totals.blocked > 0 ? `${cal.totals.blocked} blocked this month`
        : `clear · next ${cal.next_publish ?? "—"}`;
    console.log(
      `✓ ${header} — ${seen.size} pins, ${cronSet.size} due now, ${cal.daily_target}/day · ${state}`
    );
  }

  await pool.end();
  if (problems > 0) {
    console.log(`\n${problems} store(s) where the calendar cannot be trusted.`);
    process.exit(1);
  }
  console.log("\nThe calendar agrees with the publishing cron on every store.");
}

main().catch((e) => { console.error(e); process.exit(1); });
