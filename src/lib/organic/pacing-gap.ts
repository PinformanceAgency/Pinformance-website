/**
 * Pacing gap — a store publishing fewer pins than its own daily target.
 *
 * `daily_pin_target` is a ceiling, not a quota: nothing creates pins to reach
 * it. What produces pins is how many cycles run at once, because one URL may
 * only take a pin every `spacing_hours` (48h NEW, 24h ESTABLISHED). So a NEW
 * store at 1/day with one cycle publishes every other day, and on every screen
 * that looked exactly like a store on course (Icon Amsterdam, 30-09-2026).
 * The fix is a second cycle running alongside the first (Tristan, 30-09-2026:
 * "route A" — volume through more URLs, the 48h rule stays), and this is what
 * says so: target, what is planned, and how many cycles it takes.
 *
 * Read by the Overview leak panel, the agency risk list and organic-health.
 */
import { organicPool } from "./db";

/** How far ahead the plan is measured. Two weeks: a cycle's pins run a month,
 *  so a shorter window misreads the gap between two cycles as a shortfall. */
export const PACING_WINDOW_DAYS = 14;
/** Short when fewer than this share of the target's slots are planned. */
const SHORT_BELOW = 0.8;
/** The seeded demo store: its defects are deliberate. */
const DEMO_ORG = "d3e70000-0000-4000-8000-00000000de00";

export interface PacingGap {
  org_id: string;
  store: string;
  /** pins a day the store may publish (`daily_pin_target`, capped at 5) */
  target: number;
  spacing_hours: number;
  /** pins dated in the next PACING_WINDOW_DAYS days, published or still to go */
  planned: number;
  planned_per_day: number;
  /** cycles with pins in the window */
  running_cycles: number;
  /** cycles it takes to reach the target at this spacing */
  cycles_needed: number;
  more_cycles: number;
  /** URLs that pass the cycle gate and have no cycle */
  ready_urls: number;
  /** URLs whose topic is covered and cooldown clear, short only of four boards */
  urls_short_of_boards: number;
}

/**
 * Stores that are short of their target over the next two weeks. Only stores
 * already in production (a cycle ever planned) and not paused on purpose: a
 * store still onboarding is short every day for weeks, and saying so daily
 * is how a warning stops being read.
 */
export async function loadPacingGaps(orgId?: string): Promise<PacingGap[]> {
  const pool = organicPool();
  const { rows } = await pool.query<{
    org_id: string; store: string; target: number; spacing_hours: number;
    planned: string; running_cycles: string; ready_urls: string; urls_short_of_boards: string;
  }>(
    `WITH live_w AS (
       SELECT w.id, w.org_id, w.url_id
         FROM organic.waterfalls w
        WHERE w.status IN ('PLANNING','PRODUCTION','SCHEDULED','RUNNING')
     ),
     window_pins AS (
       SELECT w.org_id, p.waterfall_id
         FROM organic.pins p
         JOIN organic.waterfalls w ON w.id = p.waterfall_id
        WHERE p.status IN ('PLANNED','SCHEDULED','PUBLISHED')
          AND w.status <> 'ABANDONED'
          AND w.paused_at IS NULL
          AND p.scheduled_date BETWEEN CURRENT_DATE AND CURRENT_DATE + ($2::int - 1)
     )
     SELECT cs.org_id::text,
            COALESCE(o.name, cs.display_name, cs.org_id::text) AS store,
            LEAST(COALESCE(cs.daily_pin_target, 1), 5) AS target,
            COALESCE(cs.spacing_hours, 48) AS spacing_hours,
            (SELECT COUNT(*) FROM window_pins wp WHERE wp.org_id = cs.org_id)::text AS planned,
            (SELECT COUNT(DISTINCT wp.waterfall_id) FROM window_pins wp WHERE wp.org_id = cs.org_id)::text AS running_cycles,
            (SELECT COUNT(*) FROM organic.urls_selectable u
              WHERE u.org_id = cs.org_id AND u.is_selectable
                AND NOT EXISTS (SELECT 1 FROM live_w lw WHERE lw.url_id = u.id))::text AS ready_urls,
            (SELECT COUNT(*) FROM organic.urls_selectable u
              WHERE u.org_id = cs.org_id AND NOT u.is_selectable
                AND u.topic_covered AND u.cooldown_clear AND u.assigned_boards < 4
                AND NOT EXISTS (SELECT 1 FROM live_w lw WHERE lw.url_id = u.id))::text AS urls_short_of_boards
       FROM organic.client_settings cs
       JOIN organizations o ON o.id = cs.org_id
      WHERE cs.publishing_paused_at IS NULL
        AND ($1::uuid IS NULL OR cs.org_id = $1::uuid)
        AND ($1::uuid IS NOT NULL OR cs.org_id <> '${DEMO_ORG}'::uuid)
        AND EXISTS (SELECT 1 FROM organic.waterfalls w
                     WHERE w.org_id = cs.org_id AND w.status <> 'ABANDONED')
      ORDER BY store`,
    [orgId ?? null, PACING_WINDOW_DAYS],
  );

  const gaps: PacingGap[] = [];
  for (const r of rows) {
    const target = Number(r.target);
    const planned = Number(r.planned);
    if (target <= 0 || planned >= target * PACING_WINDOW_DAYS * SHORT_BELOW) continue;
    const running = Number(r.running_cycles);
    // one URL gives a pin every spacing_hours: 48h → half a pin a day
    const cyclesNeeded = Math.ceil((target * Number(r.spacing_hours)) / 24);
    gaps.push({
      org_id: r.org_id,
      store: r.store,
      target,
      spacing_hours: Number(r.spacing_hours),
      planned,
      planned_per_day: Math.round((planned / PACING_WINDOW_DAYS) * 10) / 10,
      running_cycles: running,
      cycles_needed: cyclesNeeded,
      // short with enough cycles already means a cycle is ending or its dates
      // are sparse: one more still closes it
      more_cycles: Math.max(1, cyclesNeeded - running),
      ready_urls: Number(r.ready_urls),
      urls_short_of_boards: Number(r.urls_short_of_boards),
    });
  }
  return gaps;
}

/** One line, in the words somebody would use to fix it. */
export function describePacingGap(g: PacingGap): string {
  const urls =
    g.ready_urls > 0
      ? `${g.ready_urls} URL(s) ready to start`
      : g.urls_short_of_boards > 0
        ? `no URL ready yet — ${g.urls_short_of_boards} only need four boards assigned (URLs page)`
        : "no URL close to ready — the cycle gate needs work first";
  return (
    `target ${g.target}/day, ${g.planned} pin(s) planned in the next ${PACING_WINDOW_DAYS} days ` +
    `(${g.planned_per_day}/day) with ${g.running_cycles} cycle(s) running — at ${g.spacing_hours}h per URL ` +
    `it takes ${g.cycles_needed}; start ${g.more_cycles} more alongside (${urls})`
  );
}
