/**
 * P5.1.1 — pulling Pinterest analytics into the organic schema.
 *
 * Until now nothing wrote `organic.pin_performance` or
 * `organic.monthly_kpis` except the seed scripts. Every winner, every
 * sparkline, every client report and the whole phase-5 → phase-4 learning
 * loop ran on fiction, and there was no way to tell from any screen.
 *
 * Two pulls, deliberately separate:
 *
 *   pullPinPerformance()  per pin, per day, in batches of 100. This is what
 *                         P5.2.1 ranks winners on and what the design brief
 *                         reads back as `proven`.
 *
 *   pullAccountKpis()     the account totals per month. These are the report
 *                         figures.
 *
 * The filters are fixed and are the method's, not a preference: ORGANIC
 * content only, and realtime excluded by ending the window yesterday.
 * Pinterest's realtime numbers move for about a day, and a report that
 * changes after it has been sent is worse than one that lands a day later.
 * `ANALYTICS_FILTERS` is exported so the screen can show them above the
 * figures — a number that looks wrong is almost always a filter, and if the
 * filters live only in this file nobody can check that.
 */
import { ownPinsAnalytics } from "./own-pins";
import { pullReportingExtras } from "./reporting-pull";
import { organicPool } from "./db";
import {
  pinterestClientsForOrgs,
  type PinterestAuthError,
} from "@/lib/pinterest/for-org";
import type { PinterestClient } from "@/lib/pinterest/client";

/** Shown on screen next to the numbers. Changing one here changes the label. */
export const ANALYTICS_FILTERS = [
  { label: "Content type", value: "Organic only" },
  { label: "Attribution", value: "Claimed domain" },
  { label: "Scope", value: "Your Pins" },
  { label: "Realtime", value: "Excluded — window ends yesterday" },
] as const;

/** Core metrics. Every business account returns these. */
const PIN_METRICS = ["IMPRESSION", "SAVE", "OUTBOUND_CLICK"];
const ACCOUNT_METRICS = [
  "IMPRESSION", "SAVE", "PIN_CLICK", "OUTBOUND_CLICK",
  "ENGAGEMENT", "ENGAGEMENT_RATE", "SAVE_RATE",
];

/**
 * Conversiemetrics worden NIET aan dit endpoint gevraagd, en dat is geen
 * voorzichtigheid maar een feit: `/v5/user_account/analytics` kent ze niet.
 * Gemeten 22-09-2026 op een live store:
 *
 *     metric_types=TOTAL_PAGE_VISIT
 *     → 400 code 1: "Parameter 'metric_types' (value TOTAL_PAGE_VISIT) is not
 *       one of ENGAGEMENT, ENGAGEMENT_RATE, IMPRESSION, OUTBOUND_CLICK,
 *       OUTBOUND_CLICK_RATE, PIN_CLICK, PIN_CLICK_RATE, SAVE, SAVE_RATE."
 *
 * Die vier namen stonden hier sinds het begin en konden nooit werken. De
 * kolommen page_visits, add_to_cart, checkouts, conversions en revenue komen
 * dus uit handmatige invoer, en de pull laat ze met rust — de COALESCE in de
 * upsert hieronder is precies daarvoor.
 */

/**
 * Pinterest geeft op dit endpoint niets ouder dan 90 dagen:
 *
 *     400 code 1: "You can only get data from the last 90 days."
 *
 * Dat is geen instelling en geen access tier — het is de grens. Een maand die
 * daarbuiten valt wordt dus overgeslagen en niet opgehaald, en de historie
 * vult van vandaag vooruit. Wat er al staat blijft staan: de upsert raakt een
 * maand die hij niet opnieuw kan meten niet aan.
 */
const API_WINDOW_DAYS = 90;

/** Wat de cron aan tijd heeft. `maxDuration = 300` is wat we vragen, niet wat
 *  we krijgen, en een run die halverwege wordt afgekapt laat een store zonder
 *  cijfers achter zonder dat iemand dat ziet. Dus stopt hij zelf, op tijd, en
 *  zegt wie hij niet meer gehaald heeft. */
const RUN_BUDGET_MS = 240_000;

function yesterdayISO(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function monthStartISO(monthsBack = 0): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - monthsBack);
  return d.toISOString().slice(0, 10);
}

/** Read a metric under any of the names Pinterest has used for it. */
function metric(src: Record<string, number> | undefined, ...names: string[]): number {
  if (!src) return 0;
  for (const n of names) {
    const v = src[n];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return 0;
}

export interface PullReport {
  orgs: Array<{
    org_id: string;
    org_name: string;
    pins_measured: number;
    days_written: number;
    months_written: number;
    weeks_written: number;
    /** Of Pinterest de OTHER-kant gaf: wat anderen op het geclaimde domein
     *  pinnen. Niets te maken met conversies — die bestaan hier niet. */
    other_pins_available: boolean;
    note?: string;
  }>;
  reconnect_required: Array<{
    org_id: string; org_name: string;
    reason: PinterestAuthError["reason"]; message: string;
  }>;
  errors: Array<{ org_id: string; message: string }>;
  /** Stores waar de run niet meer aan toe kwam. Leeg is het normale geval; een
   *  naam hier betekent dat de volgende run ze meeneemt en niet dat er iets
   *  stuk is. Zonder dit veld leest een afgekapte run als een lege. */
  not_reached: string[];
}

/** The seeded demo store: fake data, no token, nothing to pull. */
const DEMO_ORG = "d3e70000-0000-4000-8000-00000000de00";

/**
 * Account figures (per month and per week) for every organic store; pin
 * performance for the stores that have pins of ours published.
 *
 * Self-healing over a window rather than incremental: Pinterest revises
 * recent days, so re-reading the last two weeks and upserting is the only
 * way the numbers converge on what Pinterest will eventually agree with.
 */
export async function pullOrganicAnalytics(
  opts: { orgId?: string; days?: number; months?: number; weeks?: number } = {}
): Promise<PullReport> {
  const pool = organicPool();
  const days = opts.days ?? 14;
  const months = opts.months ?? 2;

  // Every store in the organic book, not only the ones we have published
  // for. Until 28-09-2026 this selected on published pins, so a brand whose
  // own pins had been running for months but where our first cycle had not
  // gone live had no figures at all — 14 of 27 stores. The account totals
  // are about the store's own image and video pins, whoever pinned them.
  const orgs = await pool.query<{ org_id: string; has_published: boolean }>(
    `SELECT cs.org_id::text AS org_id,
            EXISTS (SELECT 1 FROM organic.pins p
                      JOIN organic.waterfalls w ON w.id = p.waterfall_id
                     WHERE w.org_id = cs.org_id
                       AND p.status = 'PUBLISHED'::organic.pin_status
                       AND p.pinterest_pin_id IS NOT NULL) AS has_published
       FROM organic.client_settings cs
      WHERE cs.org_id <> $2::uuid
        AND ($1::uuid IS NULL OR cs.org_id = $1::uuid)`,
    [opts.orgId ?? null, DEMO_ORG]
  );
  const hasPublished = new Map(orgs.rows.map((r) => [r.org_id, r.has_published]));

  const report: PullReport = { orgs: [], reconnect_required: [], errors: [], not_reached: [] };
  const startedAt = Date.now();
  if (orgs.rowCount === 0) return report;

  const { clients, failed } = await pinterestClientsForOrgs(orgs.rows.map((r) => r.org_id));
  report.reconnect_required.push(...failed);

  // Drie stores tegelijk. Elke store heeft zijn eigen Pinterest-app, dus ze
  // delen geen rate limit; na de rapportage-uitbreiding (migratie 114) liep
  // de reeks één-voor-één op 218s tegen een budget van 240s.
  const queue = [...clients];
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      await pullOne(next[0], next[1]);
    }
  };
  const pullOne = async (orgId: string, entry: typeof queue[number][1]) => {
    // Op tijd stoppen in plaats van halverwege een store worden afgekapt. Een
    // niet-bereikte store is over 24 uur gewoon weer aan de beurt; een
    // afgekapte run laat niemand weten waar hij bleef.
    if (Date.now() - startedAt > RUN_BUDGET_MS) {
      report.not_reached.push(entry.orgName);
      return;
    }
    // De twee pulls vallen LOS van elkaar. Dat is niet netjes-doen: precies
    // hier ging het mis. De pin-pull wierp een 401 op de bulk-endpoint, en
    // omdat beide in één try stonden, werden de maandcijfers van elke store
    // maanden achtereen overgeslagen zonder dat één scherm dat kon zeggen.
    const notes: string[] = [];
    let pins = { pins: 0, rows: 0, failed: [] as string[] };
    if (hasPublished.get(orgId)) try {
      pins = await pullPinPerformance(orgId, entry.client, days);
      if (pins.failed.length > 0) {
        notes.push(`${pins.failed.length} pin(s) gave an error: ${pins.failed[0]}`);
      }
    } catch (e) {
      report.errors.push({ org_id: orgId, message: `pin performance: ${(e as Error).message}` });
    }

    let kpis = { months: 0, other_pins: false, skipped_too_old: 0, failed: [] as string[] };
    try {
      kpis = await pullAccountKpis(orgId, entry.client, months);
      if (!kpis.other_pins) {
        notes.push("no claimed-domain split from Pinterest; other_impressions/other_saves stay blank");
      }
      if (kpis.skipped_too_old > 0) {
        notes.push(`${kpis.skipped_too_old} month(s) skipped — Pinterest only gives the last 90 days`);
      }
      if (kpis.failed.length > 0) notes.push(`month(s) refused: ${kpis.failed.join("; ").slice(0, 120)}`);
    } catch (e) {
      report.errors.push({ org_id: orgId, message: `account KPIs: ${(e as Error).message}` });
    }

    let weeks = 0;
    try {
      weeks = await pullWeeklyKpis(orgId, entry.client, opts.weeks ?? 5);
    } catch (e) {
      report.errors.push({ org_id: orgId, message: `weekly KPIs: ${(e as Error).message}` });
    }

    // Followers, posts published, top post and new pins (migration 114).
    // Its own try per part inside; a failure here costs only these columns.
    try {
      const extras = await pullReportingExtras(orgId, entry.client, fullWeekStarts(opts.weeks ?? 5));
      if (extras.notes.length > 0) notes.push(`reporting: ${extras.notes.slice(0, 2).join("; ")}`);
    } catch (e) {
      report.errors.push({ org_id: orgId, message: `reporting: ${(e as Error).message}` });
    }

    report.orgs.push({
      org_id: orgId,
      org_name: entry.orgName,
      pins_measured: pins.pins,
      days_written: pins.rows,
      months_written: kpis.months,
      weeks_written: weeks,
      other_pins_available: kpis.other_pins,
      note: notes.length > 0 ? notes.join(" · ") : undefined,
    });
  };
  await Promise.all([worker(), worker(), worker()]);
  return report;
}

/* ------------------------------------------------------------------ */

export async function pullPinPerformance(
  orgId: string,
  client: PinterestClient,
  days: number
): Promise<{ pins: number; rows: number; failed: string[] }> {
  const pool = organicPool();
  const end = yesterdayISO();
  const start = new Date(Date.parse(end) - (days - 1) * 86_400_000).toISOString().slice(0, 10);

  const published = await pool.query<{ id: string; pinterest_pin_id: string }>(
    `SELECT p.id::text, p.pinterest_pin_id
       FROM organic.pins p
       JOIN organic.waterfalls w ON w.id = p.waterfall_id
      WHERE w.org_id = $1
        AND p.status = 'PUBLISHED'::organic.pin_status
        AND p.pinterest_pin_id IS NOT NULL
        -- A pin published before the window has nothing new in it.
        AND (p.published_at IS NULL OR p.published_at >= $2::date - interval '1 day')`,
    [orgId, start]
  );
  if (published.rowCount === 0) return { pins: 0, rows: 0, failed: [] };

  let written = 0;
  let measured = 0;
  const failures: string[] = [];

  // Per pin, in kleine groepjes parallel. De bulk-endpoint (/v5/pins/analytics)
  // is bij Pinterest een restricted feature en antwoordt met 401 code 3 — dat
  // was de enige reden dat hier jarenlang niets uitkwam. Vier tegelijk: genoeg
  // om zestien pins in een oogwenk te doen, weinig genoeg om niet tegen de
  // rate limit te lopen bij een store met honderden pins.
  const CONCURRENCY = 4;
  for (let i = 0; i < published.rows.length; i += CONCURRENCY) {
    const slice = published.rows.slice(i, i + CONCURRENCY);
    const results = await Promise.all(slice.map(async (row) => {
      try {
        const payload = await client.getPinAnalytics(
          row.pinterest_pin_id, start, end, PIN_METRICS
        );
        return { row, payload, error: null as string | null };
      } catch (e) {
        // Eén pin die weigert (verwijderd op Pinterest, of een pin van een
        // board dat niet meer gedeeld is) mag de rest van de store niet kosten.
        return { row, payload: null, error: (e as Error).message };
      }
    }));

    for (const r of results) {
      if (r.error) { failures.push(`${r.row.pinterest_pin_id}: ${r.error.slice(0, 80)}`); continue; }
      measured += 1;

      // Prefer the daily breakdown: pin_performance is keyed on
      // (pin_id, measured_on) and lifetime totals written against one date
      // would read as a single enormous day and wreck every trend on top.
      const daily = (r.payload as { all?: { daily_metrics?: Array<{
        date: string; data_status?: string; metrics: Record<string, number>;
      }> } } | null)?.all?.daily_metrics ?? [];
      const rows = daily
        // Pinterest marks a day READY once it has settled. Anything else
        // is still moving and must not be frozen into the record.
        .filter((d) => !d.data_status || d.data_status === "READY")
        .map((d) => ({
          on: d.date,
          impressions: metric(d.metrics, "IMPRESSION"),
          saves: metric(d.metrics, "SAVE"),
          clicks: metric(d.metrics, "OUTBOUND_CLICK"),
        }));

      for (const day of rows) {
        if (!day.on) continue;
        await pool.query(
          `INSERT INTO organic.pin_performance (pin_id, measured_on, impressions, saves, outbound_clicks)
           VALUES ($1, $2::date, $3, $4, $5)
           ON CONFLICT (pin_id, measured_on) DO UPDATE SET
             impressions     = EXCLUDED.impressions,
             saves           = EXCLUDED.saves,
             outbound_clicks = EXCLUDED.outbound_clicks`,
          [r.row.id, day.on, day.impressions, day.saves, day.clicks]
        );
        written += 1;
      }
    }
  }

  return { pins: measured, rows: written, failed: failures };
}

/* ------------------------------------------------------------------ */

export async function pullAccountKpis(
  orgId: string,
  client: PinterestClient,
  months: number
): Promise<{ months: number; other_pins: boolean; skipped_too_old: number; failed: string[] }> {
  const pool = organicPool();
  const end = yesterdayISO();
  let otherPinsSeen = false;
  let written = 0;
  const failures: string[] = [];

  const oldestAllowed = new Date(Date.now() - (API_WINDOW_DAYS - 1) * 86_400_000)
    .toISOString().slice(0, 10);
  let skippedTooOld = 0;

  for (let back = 0; back < months; back++) {
    const monthStart = monthStartISO(back);
    const nextMonth = new Date(Date.parse(monthStart));
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
    const monthEndFull = new Date(nextMonth.getTime() - 86_400_000).toISOString().slice(0, 10);
    const monthEnd = monthEndFull > end ? end : monthEndFull;
    if (monthEnd < monthStart) continue;

    // Buiten het venster van 90 dagen: niet vragen. Vroeger wierp de eerste
    // te oude maand een 400 die de hele lus meenam, dus alles ervóór ging ook
    // verloren — en dat was elke maand behalve de laatste twee.
    if (monthStart < oldestAllowed && monthEnd < oldestAllowed) { skippedTooOld += 1; continue; }
    const windowStart = monthStart < oldestAllowed ? oldestAllowed : monthStart;

    try {

    // CLAIMED: onze eigen pins. Zonder deze parameter antwoordt Pinterest met
    // BOTH en staat andermans bereik in ons eigen cijfer.
    // Own image + video pins only: product (catalogue) pins run on paid
    // and would otherwise make up most of the month (own-pins.ts).
    const core = await ownPinsAnalytics(
      client, windowStart, monthEnd, ACCOUNT_METRICS, "CLAIMED"
    );
    const daily = core?.all?.daily_metrics ?? [];
    const ready = daily.filter((d) => !d.data_status || d.data_status === "READY");

    const sum = (name: string) => ready.reduce((t, d) => t + metric(d.metrics, name), 0);
    const avg = (name: string) => {
      const vals = ready.map((d) => metric(d.metrics, name)).filter((v) => v > 0);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    };

    // Wat anderen op het geclaimde domein pinnen. Apart opgehaald en apart
    // opgeslagen: het is bereik dat wij niet gemaakt hebben, dus het mag nooit
    // bij onze cijfers worden geteld. Een fout hier kost alleen deze twee
    // kolommen — de maand zelf staat er dan nog.
    let other: { impressions: number; saves: number } | null = null;
    try {
      const r = await client.getUserAccountAnalytics(
        windowStart, monthEnd, ["IMPRESSION", "SAVE"], "OTHER"
      );
      const od = (r?.all?.daily_metrics ?? []).filter((d) => !d.data_status || d.data_status === "READY");
      other = {
        impressions: od.reduce((t, d) => t + metric(d.metrics, "IMPRESSION"), 0),
        saves: od.reduce((t, d) => t + metric(d.metrics, "SAVE"), 0),
      };
      otherPinsSeen = true;
    } catch {
      // Niet beschikbaar op dit account: null blijft null, wat iets anders is
      // dan nul (provenance.ts).
    }

    // The month in progress is marked partial so nothing downstream
    // compares half a month against a whole one. Een maand die door de
    // 90-dagengrens maar gedeeltelijk gemeten kon worden is óók partieel —
    // anders wordt een halve juli straks vergeleken met een hele augustus.
    const isPartial = (back === 0 && monthEnd < monthEndFull) || windowStart > monthStart;

    await pool.query(
      `INSERT INTO organic.monthly_kpis (
         org_id, month, impressions, pin_saves, pin_clicks, outbound_clicks,
         engagements, engagement_rate, save_rate,
         other_impressions, other_saves,
         pins_published, is_partial, measured_at
       ) VALUES (
         $1, $2::date, $3, $4, $5, $6,
         $7, $8, $9,
         $10, $11,
         $12, $13, now()
       )
       ON CONFLICT (org_id, month) DO UPDATE SET
         impressions     = EXCLUDED.impressions,
         pin_saves       = EXCLUDED.pin_saves,
         pin_clicks      = EXCLUDED.pin_clicks,
         outbound_clicks = EXCLUDED.outbound_clicks,
         engagements     = EXCLUDED.engagements,
         engagement_rate = EXCLUDED.engagement_rate,
         save_rate       = EXCLUDED.save_rate,
         -- COALESCE en niet overschrijven: wat er met de hand is ingevuld
         -- (omzet, conversies, GA4) hoort niet door een nachtelijke pull te
         -- worden leeggemaakt, en wat Pinterest deze keer niet gaf ook niet.
         other_impressions = COALESCE(EXCLUDED.other_impressions, organic.monthly_kpis.other_impressions),
         other_saves       = COALESCE(EXCLUDED.other_saves,       organic.monthly_kpis.other_saves),
         pins_published  = EXCLUDED.pins_published,
         is_partial      = EXCLUDED.is_partial,
         measured_at     = now()`,
      [
        orgId, monthStart,
        sum("IMPRESSION"), sum("SAVE"), sum("PIN_CLICK"), sum("OUTBOUND_CLICK"),
        sum("ENGAGEMENT"), avg("ENGAGEMENT_RATE"), avg("SAVE_RATE"),
        other ? other.impressions : null,
        other ? other.saves : null,
        await pinsPublishedIn(orgId, monthStart, monthEnd),
        isPartial,
      ]
    );
    written += 1;
    } catch (e) {
      // Eén maand die weigert kost die maand, niet de rest. Dit was het
      // mechanisme waardoor `monthly_kpis` voor elke echte store leeg bleef.
      failures.push(`${monthStart.slice(0, 7)}: ${(e as Error).message.slice(0, 90)}`);
    }
  }

  return { months: written, other_pins: otherPinsSeen, skipped_too_old: skippedTooOld, failed: failures };
}

/**
 * The last `weeks` full Monday–Sunday weeks, into `organic.weekly_kpis`.
 *
 * One call over the whole span (two, really: image and video) and bucketed
 * per week here, rather than a call per week — five weeks are ten requests
 * otherwise, times every store in the book. Same filters as the month:
 * CLAIMED, own image + video pins, READY days only. A week with a day that is
 * not READY yet, or that starts before the 90-day window, is marked partial.
 *
 * Only the API half is written. The Conversion Insights half (revenue,
 * checkouts, ...) is typed in by a person and the upsert never touches it.
 */
/** Mondays of the last `weeks` full Mon–Sun weeks, oldest first. */
export function fullWeekStarts(weeks: number, now: Date = new Date()): string[] {
  const DAY = 86_400_000;
  const today = new Date(now.toISOString().slice(0, 10) + "T00:00:00Z");
  const dow = (today.getUTCDay() + 6) % 7;
  const lastMonday = today.getTime() - (dow + 7) * DAY;
  return Array.from({ length: weeks }, (_, i) =>
    new Date(lastMonday - (weeks - 1 - i) * 7 * DAY).toISOString().slice(0, 10));
}

export async function pullWeeklyKpis(
  orgId: string,
  client: PinterestClient,
  weeks: number,
): Promise<number> {
  const pool = organicPool();
  const DAY = 86_400_000;
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  const dow = (today.getUTCDay() + 6) % 7; // Monday = 0
  const lastMonday = new Date(today.getTime() - (dow + 7) * DAY);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const oldestAllowed = iso(new Date(Date.now() - (API_WINDOW_DAYS - 1) * DAY));

  const starts: string[] = [];
  for (let i = weeks - 1; i >= 0; i--) starts.push(iso(new Date(lastMonday.getTime() - i * 7 * DAY)));
  const spanStart = starts[0] < oldestAllowed ? oldestAllowed : starts[0];
  const spanEnd = iso(new Date(lastMonday.getTime() + 6 * DAY));

  const res = await ownPinsAnalytics(
    client, spanStart, spanEnd,
    ["IMPRESSION", "SAVE", "PIN_CLICK", "OUTBOUND_CLICK", "ENGAGEMENT"], "CLAIMED",
  );
  const byDate = new Map((res?.all?.daily_metrics ?? []).map((d) => [d.date, d]));

  let written = 0;
  for (const start of starts) {
    const days = Array.from({ length: 7 }, (_, i) => iso(new Date(Date.parse(start + "T00:00:00Z") + i * DAY)));
    const ready = days.map((d) => byDate.get(d)).filter((d) => d && (!d.data_status || d.data_status === "READY"));
    // BEFORE_BUSINESS_CREATED and its kin: the account did not exist yet, so
    // there is nothing to measure — that is null, not zero. PROCESSING (the
    // last day or two) is a day we cannot count YET: the week is partial,
    // and the next nightly run fills it in. A day Pinterest left out
    // entirely had no activity (see "Data conventions").
    const before = (st?: string) => !!st && st.startsWith("BEFORE_");
    const measurable = days.filter((d) => !before(byDate.get(d)?.data_status));
    const notReady = measurable.some((d) => {
      const st = byDate.get(d)?.data_status;
      return !!st && st !== "READY";
    });
    if (start < oldestAllowed && days[6] < oldestAllowed) continue;
    const partial = notReady || start < oldestAllowed;
    const sum = (m: string) =>
      measurable.length === 0 ? null : ready.reduce((t, d) => t + metric(d!.metrics, m), 0);
    await pool.query(
      `INSERT INTO organic.weekly_kpis
         (org_id, week_start, impressions, pin_saves, pin_clicks, outbound_clicks,
          engagements, is_partial, measured_at)
       VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8, now())
       ON CONFLICT (org_id, week_start) DO UPDATE SET
         impressions     = EXCLUDED.impressions,
         pin_saves       = EXCLUDED.pin_saves,
         pin_clicks      = EXCLUDED.pin_clicks,
         outbound_clicks = EXCLUDED.outbound_clicks,
         engagements     = EXCLUDED.engagements,
         is_partial      = EXCLUDED.is_partial,
         measured_at     = now()`,
      [orgId, start, sum("IMPRESSION"), sum("SAVE"), sum("PIN_CLICK"),
       sum("OUTBOUND_CLICK"), sum("ENGAGEMENT"), partial],
    );
    written += 1;
  }
  return written;
}

async function pinsPublishedIn(orgId: string, from: string, to: string): Promise<number> {
  const pool = organicPool();
  const r = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n
       FROM organic.pins p
       JOIN organic.waterfalls w ON w.id = p.waterfall_id
      WHERE w.org_id = $1
        AND p.status = 'PUBLISHED'::organic.pin_status
        AND p.published_at::date BETWEEN $2::date AND $3::date`,
    [orgId, from, to]
  );
  return Number(r.rows[0].n);
}
