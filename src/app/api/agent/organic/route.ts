/**
 * GET /api/agent/organic — where each organic store stands.
 *
 * Scoped to `organic.client_settings`, never to `organic.boards` or
 * `organic.pins`. Those two hold rows for roughly fifty orgs whose boards
 * were imported by the main dashboard and that never entered the organic
 * method — aggregating over them reports a fifty-store finding from a book
 * of eight. Same rule `method.ts` enforces for every cross-client figure.
 *
 * The four counts worth understanding, because they are the ones that
 * actually explain "why is this store not publishing":
 *
 *   boards_live       — on Pinterest. A pin onto a board that is not there
 *                       yet is simply never returned by the publish query:
 *                       no error, no failure count, it just never goes out.
 *   boards_queued     — designed, dated, waiting for the 01:00 cron (three
 *                       per store per day).
 *   boards_undated    — designed with NO planned creation date, which puts
 *                       them outside the queue for good. This is the state
 *                       that cost The Longevity store 29 boards.
 *   pins_planned      — a plan that has never been queued. A PLANNED pin
 *                       carries a date, renders like any other pin, and will
 *                       never publish. Every regeneration resets a cycle to
 *                       this state, which is where stores silently stop.
 */
import { NextRequest } from "next/server";
import { organicPool } from "@/lib/organic/db";
import { requireAgentKey, agentJson, agentError, num } from "@/lib/agent/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Seeded demo store — deliberate defects, excluded from every tally. */
const DEMO_ORG = "d3e70000-0000-4000-8000-00000000de00";

interface Row {
  org_id: string;
  store: string;
  niche: string | null;
  domain: string | null;
  account_class: string | null;
  engagement_status: string | null;
  daily_pin_target: number | null;
  spacing_hours: number | null;
  urls_per_month: number | null;
  onboarded_date: string | null;
  scale_up_eligible_date: string | null;
  primary_language: string | null;
  market_country: string | null;
  boards_total: string;
  boards_live: string;
  boards_queued: string;
  boards_undated: string;
  pins_scheduled: string;
  pins_overdue: string;
  pins_planned: string;
  pins_published_30d: string;
  pins_failed_14d: string;
  last_published: string | null;
  next_pin_date: string | null;
  cycles_running: string;
  cycles_planning: string;
}

export async function GET(request: NextRequest) {
  const auth = requireAgentKey(request);
  if (!auth.ok) return auth.response;

  const includeDemo =
    new URL(request.url).searchParams.get("include_demo") === "1";

  try {
    const pool = organicPool();
    const { rows } = await pool.query<Row>(
      `SELECT cs.org_id::text AS org_id,
              o.name          AS store,
              cs.niche, cs.domain,
              cs.account_class::text      AS account_class,
              cs.engagement_status::text  AS engagement_status,
              cs.daily_pin_target, cs.spacing_hours, cs.urls_per_month,
              cs.onboarded_date::text            AS onboarded_date,
              cs.scale_up_eligible_date::text    AS scale_up_eligible_date,
              cs.primary_language, cs.market_country,
              b.total       AS boards_total,
              b.live        AS boards_live,
              b.queued      AS boards_queued,
              b.undated     AS boards_undated,
              p.scheduled   AS pins_scheduled,
              p.overdue     AS pins_overdue,
              p.planned     AS pins_planned,
              p.published30 AS pins_published_30d,
              p.failed14    AS pins_failed_14d,
              p.last_published, p.next_pin_date,
              w.running     AS cycles_running,
              w.planning    AS cycles_planning
         FROM organic.client_settings cs
         JOIN public.organizations o ON o.id = cs.org_id
         LEFT JOIN LATERAL (
              SELECT COUNT(*)::text AS total,
                     COUNT(*) FILTER (WHERE bb.pinterest_board_id IS NOT NULL)::text AS live,
                     COUNT(*) FILTER (WHERE bb.pinterest_board_id IS NULL
                                        AND bb.planned_creation_date IS NOT NULL)::text AS queued,
                     COUNT(*) FILTER (WHERE bb.pinterest_board_id IS NULL
                                        AND bb.planned_creation_date IS NULL
                                        AND bb.status = 'PLANNED'::organic.board_status)::text AS undated
                FROM organic.boards bb
               WHERE bb.org_id = cs.org_id
         ) b ON TRUE
         LEFT JOIN LATERAL (
              SELECT COUNT(*) FILTER (WHERE pp.status = 'SCHEDULED'::organic.pin_status)::text AS scheduled,
                     COUNT(*) FILTER (WHERE pp.status = 'SCHEDULED'::organic.pin_status
                                        AND pp.scheduled_date < CURRENT_DATE)::text AS overdue,
                     COUNT(*) FILTER (WHERE pp.status = 'PLANNED'::organic.pin_status)::text AS planned,
                     COUNT(*) FILTER (WHERE pp.status = 'PUBLISHED'::organic.pin_status
                                        AND pp.published_at >= NOW() - INTERVAL '30 days')::text AS published30,
                     -- Dated by scheduled_date, the same way the watchdog
                     -- counts them: organic.pins has no updated_at, and the
                     -- date it was meant to go out is the honest anchor.
                     COUNT(*) FILTER (WHERE pp.status = 'FAILED'::organic.pin_status
                                        AND pp.scheduled_date >= CURRENT_DATE - 14)::text AS failed14,
                     MAX(pp.published_at) FILTER (WHERE pp.status = 'PUBLISHED'::organic.pin_status)::text AS last_published,
                     MIN(pp.scheduled_date) FILTER (WHERE pp.status = 'SCHEDULED'::organic.pin_status
                                        AND pp.scheduled_date >= CURRENT_DATE)::text AS next_pin_date
                FROM organic.pins pp
                JOIN organic.waterfalls ww ON ww.id = pp.waterfall_id
               WHERE ww.org_id = cs.org_id
         ) p ON TRUE
         LEFT JOIN LATERAL (
              SELECT COUNT(*) FILTER (WHERE w2.status = 'RUNNING'::organic.waterfall_status)::text AS running,
                     COUNT(*) FILTER (WHERE w2.status = 'PLANNING'::organic.waterfall_status)::text AS planning
                FROM organic.waterfalls w2
               WHERE w2.org_id = cs.org_id
         ) w ON TRUE
        WHERE ($1::boolean OR cs.org_id <> $2::uuid)
        ORDER BY o.name`,
      [includeDemo, DEMO_ORG]
    );

    const stores = rows.map((r) => ({
      org_id: r.org_id,
      store: r.store,
      niche: r.niche,
      domain: r.domain,
      engagement_status: r.engagement_status,
      account_class: r.account_class,
      pacing: {
        daily_pin_target: r.daily_pin_target,
        spacing_hours: r.spacing_hours,
        urls_per_month: r.urls_per_month,
        scale_up_eligible_date: r.scale_up_eligible_date,
      },
      language: {
        primary_language: r.primary_language,
        market_country: r.market_country,
        is_default: r.primary_language === null,
      },
      onboarded_date: r.onboarded_date,
      boards: {
        total: num(r.boards_total) ?? 0,
        live_on_pinterest: num(r.boards_live) ?? 0,
        queued_for_creation: num(r.boards_queued) ?? 0,
        designed_without_a_date: num(r.boards_undated) ?? 0,
      },
      pins: {
        scheduled: num(r.pins_scheduled) ?? 0,
        overdue: num(r.pins_overdue) ?? 0,
        planned_never_queued: num(r.pins_planned) ?? 0,
        published_last_30d: num(r.pins_published_30d) ?? 0,
        failed_last_14d: num(r.pins_failed_14d) ?? 0,
        last_published: r.last_published,
        next_scheduled_date: r.next_pin_date,
      },
      cycles: {
        running: num(r.cycles_running) ?? 0,
        planning: num(r.cycles_planning) ?? 0,
      },
    }));

    return agentJson({
      count: stores.length,
      stores,
      note:
        "`planned_never_queued` pins carry a date but will never publish — a plan is only live once it is queued. " +
        "`designed_without_a_date` boards sit outside the creation queue entirely. " +
        "The daily pin target is a ceiling, not a quota; the cron publishes at most that many a day.",
    });
  } catch (err) {
    console.error("[agent/organic]", err);
    return agentError(
      err instanceof Error ? err.message : "Could not read the organic book",
      500
    );
  }
}
