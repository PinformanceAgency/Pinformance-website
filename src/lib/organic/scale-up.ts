/**
 * The ramp, which until now was a date nobody acted on.
 *
 * `client_settings.scale_up_eligible_date` has been in the schema since the
 * first organic migration and, as of 15-09-2026, exactly two things read it:
 * the fact bar at the top of a client screen, and the settings form that
 * re-arms it. Nothing ever raised a target. So every store in the book sat at
 * **1 pin a day** — sixteen a month — from onboarding onwards, which is the
 * method's *starting* point and was never meant to be its resting point.
 * `ORGANIC_TASK_SPEC.md` P2.4.2 is explicit: "For NEW accounts starts at
 * 1/day, prompts a step-up after a few weeks and only above 5 after two
 * months." The prompt was the part that was missing, so the ramp never ran.
 *
 * This is that step, made to happen by itself once a night.
 *
 * The five conditions below are not a safety ritual; each one exists because
 * raising the ceiling on an account that fails it is either pointless or
 * actively risky:
 *
 *   1. the two-week hold has passed — the method's pace, not ours;
 *   2. the store is under the ceiling (module 4's 5/day, ORGANIC_DAILY_CAP);
 *   3. something published in the last fortnight — a store that is not
 *      running does not get a wider allowance for standing still;
 *   4. nothing failed in the last fortnight — a store with a broken token or
 *      a refused pin has a problem that more volume makes worse;
 *   5. **the current ceiling is actually what is holding it back.** This is
 *      the one that matters. `daily_pin_target` is a ceiling, not a quota:
 *      what produces pins is how many cycles are running. A store that never
 *      reaches its current target is not short of allowance, and raising it
 *      changes nothing today while quietly widening the burst it may take
 *      later. The Longevity store is the case in point — one product, one
 *      URL, a pin every 48 hours — and it correctly stops ramping at the
 *      point where more allowance would be a number on a screen.
 *
 * It only ever steps **up, by one**. Coming down is a judgement about an
 * account and stays a person's.
 */
import { organicPool } from "./db";
import { ORGANIC_DAILY_CAP, SCALE_UP_STEP_DAYS } from "./pacing";
import { computeUrlsPerMonth } from "./phase2";

export interface ScaleUpRow {
  org_id: string;
  store: string;
  from: number;
  to: number;
  urls_per_month: number;
  next_step: string;
}

export interface ScaleUpHold {
  store: string;
  target: number;
  /** Which of the five conditions is not met, in words. */
  why: string;
}

export interface ScaleUpReport {
  raised: ScaleUpRow[];
  held: ScaleUpHold[];
  checked: number;
}

interface Candidate {
  org_id: string;
  store: string;
  target: number;
  eligible_on: string | null;
  published_14d: number;
  failed_14d: number;
  /** Days in the last 14 on which the store published its whole allowance. */
  days_at_target: number;
}

/**
 * Walk every store in the organic book and take the ones that have earned
 * their next step.
 *
 * Read-then-write per store rather than one big UPDATE, because the report is
 * the point: a ramp that moves numbers without saying which and why is the
 * same kind of silent machinery this one was built to replace.
 */
export async function stepUpDailyTargets(
  opts: { dryRun?: boolean; orgId?: string } = {}
): Promise<ScaleUpReport> {
  const pool = organicPool();

  const rows = await pool.query<Candidate>(
    `WITH published AS (
       SELECT w.org_id,
              p.published_at AT TIME ZONE 'UTC' AS at,
              (p.published_at AT TIME ZONE 'UTC')::date AS day
         FROM organic.pins p
         JOIN organic.waterfalls w ON w.id = p.waterfall_id
        WHERE p.status = 'PUBLISHED'::organic.pin_status
          AND p.published_at >= now() - interval '14 days'
     ),
     per_day AS (
       SELECT org_id, day, COUNT(*)::int AS n FROM published GROUP BY 1, 2
     )
     SELECT o.id::text                        AS org_id,
            o.name                            AS store,
            s.daily_pin_target                AS target,
            s.scale_up_eligible_date::text    AS eligible_on,
            COALESCE((SELECT COUNT(*) FROM published pb WHERE pb.org_id = o.id), 0)::int
                                              AS published_14d,
            COALESCE((SELECT COUNT(*) FROM organic.pins p2
                        JOIN organic.waterfalls w2 ON w2.id = p2.waterfall_id
                       WHERE w2.org_id = o.id
                         AND p2.status = 'FAILED'::organic.pin_status
                         AND p2.scheduled_date >= current_date - 14), 0)::int
                                              AS failed_14d,
            COALESCE((SELECT COUNT(*) FROM per_day d
                       WHERE d.org_id = o.id AND d.n >= s.daily_pin_target), 0)::int
                                              AS days_at_target
       FROM public.organizations o
       JOIN organic.client_settings s ON s.org_id = o.id
      WHERE ($1::uuid IS NULL OR o.id = $1::uuid)
      ORDER BY o.name`,
    [opts.orgId ?? null]
  );

  const report: ScaleUpReport = { raised: [], held: [], checked: rows.rowCount ?? 0 };

  for (const c of rows.rows) {
    const hold = (why: string) => report.held.push({ store: c.store, target: c.target, why });

    if (c.target >= ORGANIC_DAILY_CAP) {
      hold(`at the ceiling of ${ORGANIC_DAILY_CAP}/day`);
      continue;
    }
    if (!c.eligible_on) {
      hold("no scale-up date on file — set the daily target once in Settings to start the clock");
      continue;
    }
    const today = new Date().toISOString().slice(0, 10);
    if (c.eligible_on > today) {
      hold(`holding at ${c.target}/day until ${c.eligible_on}`);
      continue;
    }
    if (c.failed_14d > 0) {
      hold(`${c.failed_14d} pin(s) failed in the last fortnight — fix that before widening the allowance`);
      continue;
    }
    if (c.published_14d === 0) {
      hold("nothing published in the last fortnight");
      continue;
    }
    if (c.days_at_target === 0) {
      // Not a failure and not a warning: it is the honest reading. See the
      // fifth condition in the header.
      hold(
        `never reached ${c.target}/day in the last fortnight, so the cap is not what is holding it back — ` +
        `more cycles are (URLs that pass the gate), not more allowance`
      );
      continue;
    }

    const to = c.target + 1;
    const { urls_per_month } = computeUrlsPerMonth(to);
    const next = new Date(Date.now() + SCALE_UP_STEP_DAYS * 86_400_000).toISOString().slice(0, 10);

    if (!opts.dryRun) {
      await pool.query(
        `UPDATE organic.client_settings
            SET daily_pin_target = $2,
                urls_per_month = $3,
                scale_up_eligible_date = current_date + interval '${SCALE_UP_STEP_DAYS} days',
                updated_at = now()
          WHERE org_id = $1`,
        [c.org_id, to, urls_per_month]
      );
    }
    report.raised.push({
      org_id: c.org_id, store: c.store, from: c.target, to,
      urls_per_month, next_step: next,
    });
  }

  return report;
}
