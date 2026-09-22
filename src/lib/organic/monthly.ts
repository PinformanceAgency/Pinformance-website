/**
 * C — de maandcijfers: wat organic oplevert, welke pins het deden, en wat er
 * terug moet in de volgende ronde.
 *
 * Fase 5 had de opslag (`monthly_kpis`, `pin_performance`, `baseline_kpis`) en
 * de taken, maar er stond voor geen enkele echte store één rij in: de
 * nachtelijke pull viel om op een endpoint die onze apps niet mogen gebruiken.
 * Dat is gerepareerd in analytics-pull.ts; dit is de kant die het leesbaar
 * maakt.
 *
 * Drie regels die door dit hele bestand lopen:
 *
 *   - **Organic omzet is één bak, niet de som.** Pinterest kent organic
 *     conversion, paid-assisted en paid-unassisted. Alleen de eerste is onze
 *     omzet. Paid-assisted erbij optellen laat organic omzet claimen die het
 *     paid-rapport ook claimt, en dan is de som van beide rapporten groter dan
 *     de webshop. Ze staan hier dus naast elkaar en worden nooit opgeteld.
 *   - **Een ontbrekend cijfer is geen nul** (provenance.ts). Een maand waarin
 *     niemand de omzet heeft ingevuld heeft `null`, en dat rendert als een
 *     streep met de reden — niet als € 0, wat een gemeten resultaat zou zijn.
 *   - **Twee maanden met verschillende attributievensters zijn niet
 *     vergelijkbaar.** Dat verschil is op een scherm onzichtbaar, dus het wordt
 *     gemeld in plaats van weggerekend.
 */
import { organicPool } from "./db";
import type { CreativeFormat } from "./formats";

/* ------------------------------------------------------------------ */
/* Wat een maand oplevert                                              */
/* ------------------------------------------------------------------ */

export interface MonthRow {
  /** Eerste van de maand, YYYY-MM-DD. */
  month: string;
  impressions: number | null;
  pin_saves: number | null;
  pin_clicks: number | null;
  outbound_clicks: number | null;
  engagements: number | null;
  /** Wat anderen op het geclaimde domein pinnen. Nooit bij het onze geteld. */
  other_impressions: number | null;
  other_saves: number | null;
  pins_published: number | null;
  /** De enige bak die als organic omzet telt. */
  revenue_organic: number | null;
  revenue_paid_assisted: number | null;
  revenue_paid_unassisted: number | null;
  /** Het oude, ongesplitste veld. Blijft leesbaar voor wat er al in stond. */
  revenue_legacy: number | null;
  page_visits: number | null;
  add_to_cart: number | null;
  checkouts: number | null;
  conversions: number | null;
  conversion_window_click: number | null;
  conversion_window_view: number | null;
  figures_source: string | null;
  figures_note: string | null;
  /** De maand is nog niet voorbij, of kon maar deels gemeten worden. */
  is_partial: boolean;
  measured_at: string | null;
}

export interface MonthDelta {
  key: keyof MonthRow;
  label: string;
  value: number | null;
  previous: number | null;
  /** Null als een van de twee ontbreekt — een verandering tegen een afwezige
   *  basis is geen verandering maar een onbekende. */
  pct: number | null;
}

export interface TopPin {
  pin_id: string;
  sequence: number;
  cycle: string;
  design_number: number;
  format: CreativeFormat | null;
  /** AI_GENERATED of DIRECT — of de creative van de klant/Canva kwam of
   *  gegenereerd is. Dat is de vraag die achter "welke pins winnen" zit. */
  route: string;
  board: string | null;
  url: string | null;
  image_url: string | null;
  pin_url: string | null;
  published_on: string | null;
  impressions: number;
  saves: number;
  outbound_clicks: number;
  is_winner: boolean;
  winner_note: string | null;
}

export interface FormatPerformance {
  format: CreativeFormat | null;
  pins: number;
  impressions: number;
  saves: number;
  outbound_clicks: number;
  /** Per pin, want vier pins van één format tegen één pin van een ander
   *  vergelijken zegt niets over het format. */
  clicks_per_pin: number | null;
  saves_per_pin: number | null;
}

export interface TrendInput {
  id: string;
  month: string;
  term: string;
  direction: string;
  note: string | null;
  used_at: string | null;
}

export interface MonthlyDashboard {
  months: MonthRow[];
  /** De nieuwste maand, met de vorige ernaast. */
  current: MonthRow | null;
  previous: MonthRow | null;
  deltas: MonthDelta[];
  top_by_clicks: TopPin[];
  top_by_saves: TopPin[];
  formats: FormatPerformance[];
  trends: TrendInput[];
  /** Waarschuwingen over de cijfers zelf: verschillende attributievensters,
   *  ontbrekende omzet, een halve maand. Nooit blokkerend. */
  caveats: string[];
  /** Hoeveel van de zes maanden een organic-omzetcijfer hebben. */
  months_with_revenue: number;
}

const n = (v: string | number | null | undefined): number | null =>
  v === null || v === undefined ? null : Number(v);

function pct(value: number | null, previous: number | null): number | null {
  if (value === null || previous === null || previous === 0) return null;
  return ((value - previous) / previous) * 100;
}

/**
 * Alles wat het maandoverzicht van een store nodig heeft, in één keer.
 *
 * Zes maanden, want dat is wat de trendgrafiek toont en wat een seizoen net
 * zichtbaar maakt. De pull haalt niet verder terug dan negentig dagen
 * (Pinterest geeft niet meer), dus oudere maanden staan er alleen als ze
 * eerder zijn opgehaald of met de hand zijn ingevuld — en dat is precies waarom
 * ze blijven staan in plaats van te worden overschreven.
 */
export async function loadMonthlyDashboard(orgId: string, months = 6): Promise<MonthlyDashboard> {
  const pool = organicPool();

  const rows = await pool.query<Record<string, string | number | boolean | null>>(
    `SELECT month::text                       AS month,
            impressions, pin_saves, pin_clicks, outbound_clicks, engagements,
            other_impressions, other_saves, pins_published,
            revenue_organic::text             AS revenue_organic,
            revenue_paid_assisted::text       AS revenue_paid_assisted,
            revenue_paid_unassisted::text     AS revenue_paid_unassisted,
            revenue::text                     AS revenue_legacy,
            page_visits, add_to_cart, checkouts, conversions,
            conversion_window_click, conversion_window_view,
            figures_source, figures_note,
            is_partial, measured_at::text     AS measured_at
       FROM organic.monthly_kpis
      WHERE org_id = $1
      ORDER BY month DESC
      LIMIT $2`,
    [orgId, months]
  );

  const list: MonthRow[] = rows.rows.map((r) => ({
    month: String(r.month),
    impressions: n(r.impressions as number | null),
    pin_saves: n(r.pin_saves as number | null),
    pin_clicks: n(r.pin_clicks as number | null),
    outbound_clicks: n(r.outbound_clicks as number | null),
    engagements: n(r.engagements as number | null),
    other_impressions: n(r.other_impressions as number | null),
    other_saves: n(r.other_saves as number | null),
    pins_published: n(r.pins_published as number | null),
    revenue_organic: n(r.revenue_organic as string | null),
    revenue_paid_assisted: n(r.revenue_paid_assisted as string | null),
    revenue_paid_unassisted: n(r.revenue_paid_unassisted as string | null),
    revenue_legacy: n(r.revenue_legacy as string | null),
    page_visits: n(r.page_visits as number | null),
    add_to_cart: n(r.add_to_cart as number | null),
    checkouts: n(r.checkouts as number | null),
    conversions: n(r.conversions as number | null),
    conversion_window_click: n(r.conversion_window_click as number | null),
    conversion_window_view: n(r.conversion_window_view as number | null),
    figures_source: (r.figures_source as string | null) ?? null,
    figures_note: (r.figures_note as string | null) ?? null,
    is_partial: Boolean(r.is_partial),
    measured_at: (r.measured_at as string | null) ?? null,
  }));

  const current = list[0] ?? null;
  const previous = list[1] ?? null;

  const DELTA_FIELDS: Array<[keyof MonthRow, string]> = [
    ["impressions", "Impressions"],
    ["pin_saves", "Saves"],
    ["outbound_clicks", "Outbound clicks"],
    ["revenue_organic", "Organic revenue"],
    ["pins_published", "Pins published"],
  ];
  const deltas: MonthDelta[] = DELTA_FIELDS.map(([key, label]) => {
    const value = (current?.[key] ?? null) as number | null;
    const prev = (previous?.[key] ?? null) as number | null;
    return { key, label, value, previous: prev, pct: pct(value, prev) };
  });

  const [clicks, saves, formats, trends] = await Promise.all([
    topPins(orgId, "outbound_clicks"),
    topPins(orgId, "saves"),
    formatPerformance(orgId),
    loadTrendInputs(orgId),
  ]);

  // De waarschuwingen. Alles hier is iets wat een cijfer betekent en wat je van
  // het cijfer zelf niet kunt zien.
  const caveats: string[] = [];
  const windows = new Set(
    list
      .filter((m) => m.conversion_window_click != null)
      .map((m) => `${m.conversion_window_click}/${m.conversion_window_view ?? "?"}`)
  );
  if (windows.size > 1) {
    caveats.push(
      `These months were measured with different attribution windows (${[...windows].join(", ")} ` +
      `day click/view). Revenue across them is not a like-for-like comparison.`
    );
  }
  if (current?.is_partial) {
    caveats.push(
      `${current.month.slice(0, 7)} is still running, so it is a part-month next to whole ones.`
    );
  }
  const withRevenue = list.filter((m) => m.revenue_organic != null).length;
  if (withRevenue === 0) {
    caveats.push(
      "No organic revenue has been entered for any of these months. Pinterest's API does not " +
      "return revenue or conversions for organic, so those figures come in by hand or by CSV."
    );
  }
  if (list.some((m) => m.revenue_paid_assisted != null)) {
    caveats.push(
      "Paid-assisted revenue is shown separately and is never added to organic. Adding the two " +
      "would claim the same money twice, once in each report."
    );
  }

  return {
    months: list,
    current,
    previous,
    deltas,
    top_by_clicks: clicks,
    top_by_saves: saves,
    formats,
    trends,
    caveats,
    months_with_revenue: withRevenue,
  };
}

/**
 * De vijf beste pins op kliks of op saves.
 *
 * Gerangschikt op de som over `pin_performance`, niet op een lifetime-cijfer:
 * die tabel is de enige die per dag meet, en een lifetime-getal tegen één datum
 * zou als één enorme dag lezen.
 */
async function topPins(
  orgId: string, by: "outbound_clicks" | "saves", limit = 5
): Promise<TopPin[]> {
  const column = by === "saves" ? "saves" : "outbound_clicks";
  const r = await organicPool().query<{
    pin_id: string; sequence_number: number; url_name: string | null; design_number: number;
    format: string | null; route: string; board: string | null; url: string | null;
    image_path: string | null; pinterest_pin_id: string | null; published_at: string | null;
    impressions: string; saves: string; outbound_clicks: string;
    is_winner: boolean; winner_note: string | null;
  }>(
    `SELECT p.id::text                AS pin_id,
            p.sequence_number,
            u.name                    AS url_name,
            d.design_number,
            d.format::text            AS format,
            d.route::text             AS route,
            b.name                    AS board,
            u.url                     AS url,
            p.image_path,
            p.pinterest_pin_id,
            p.published_at::text      AS published_at,
            COALESCE(SUM(pp.impressions), 0)::text     AS impressions,
            COALESCE(SUM(pp.saves), 0)::text           AS saves,
            COALESCE(SUM(pp.outbound_clicks), 0)::text AS outbound_clicks,
            p.is_winner, p.winner_note
       FROM organic.pins p
       JOIN organic.waterfalls w ON w.id = p.waterfall_id
       JOIN organic.designs d    ON d.id = p.design_id
       JOIN organic.urls u       ON u.id = w.url_id
       JOIN organic.boards b     ON b.id = p.board_id
       LEFT JOIN organic.pin_performance pp ON pp.pin_id = p.id
      WHERE w.org_id = $1
        AND p.status = 'PUBLISHED'::organic.pin_status
      GROUP BY p.id, u.name, d.design_number, d.format, d.route, b.name, u.url
      HAVING COALESCE(SUM(pp.${column}), 0) > 0
      ORDER BY COALESCE(SUM(pp.${column}), 0) DESC, COALESCE(SUM(pp.impressions), 0) DESC
      LIMIT $2`,
    [orgId, limit]
  );
  return r.rows.map((x) => ({
    pin_id: x.pin_id,
    sequence: x.sequence_number,
    cycle: x.url_name ?? "—",
    design_number: x.design_number,
    format: (x.format as CreativeFormat | null) ?? null,
    route: x.route,
    board: x.board,
    url: x.url,
    image_url: x.image_path,
    pin_url: x.pinterest_pin_id ? `https://www.pinterest.com/pin/${x.pinterest_pin_id}/` : null,
    published_on: x.published_at ? x.published_at.slice(0, 10) : null,
    impressions: Number(x.impressions),
    saves: Number(x.saves),
    outbound_clicks: Number(x.outbound_clicks),
    is_winner: x.is_winner,
    winner_note: x.winner_note,
  }));
}

/**
 * Prestatie per format — de vraag of infographics beter doen dan productfoto's.
 *
 * Per pin gedeeld, niet als totaal: een format waar vier pins van zijn haalt
 * altijd meer dan een format met één pin, en dat zegt niets over het format.
 * Designs zonder format staan er als eigen regel bij in plaats van te worden
 * weggelaten — dat is meestal de meerderheid en het is de reden dat deze tabel
 * nog niets zegt.
 */
async function formatPerformance(orgId: string): Promise<FormatPerformance[]> {
  const r = await organicPool().query<{
    format: string | null; pins: string;
    impressions: string; saves: string; outbound_clicks: string;
  }>(
    `SELECT d.format::text AS format,
            COUNT(DISTINCT p.id)::text                  AS pins,
            COALESCE(SUM(pp.impressions), 0)::text      AS impressions,
            COALESCE(SUM(pp.saves), 0)::text            AS saves,
            COALESCE(SUM(pp.outbound_clicks), 0)::text  AS outbound_clicks
       FROM organic.pins p
       JOIN organic.waterfalls w ON w.id = p.waterfall_id
       JOIN organic.designs d    ON d.id = p.design_id
       LEFT JOIN organic.pin_performance pp ON pp.pin_id = p.id
      WHERE w.org_id = $1
        AND p.status = 'PUBLISHED'::organic.pin_status
      GROUP BY d.format
      ORDER BY COALESCE(SUM(pp.outbound_clicks), 0) DESC`,
    [orgId]
  );
  return r.rows.map((x) => {
    const pins = Number(x.pins);
    const clicks = Number(x.outbound_clicks);
    const saves = Number(x.saves);
    return {
      format: (x.format as CreativeFormat | null) ?? null,
      pins,
      impressions: Number(x.impressions),
      saves,
      outbound_clicks: clicks,
      clicks_per_pin: pins > 0 ? clicks / pins : null,
      saves_per_pin: pins > 0 ? saves / pins : null,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Cijfers die met de hand komen                                       */
/* ------------------------------------------------------------------ */

export interface MonthlyFigures {
  month: string;
  revenue_organic?: number | null;
  revenue_paid_assisted?: number | null;
  revenue_paid_unassisted?: number | null;
  conversions?: number | null;
  checkouts?: number | null;
  add_to_cart?: number | null;
  page_visits?: number | null;
  conversion_window_click?: number | null;
  conversion_window_view?: number | null;
  /** GA4 wordt in deze ronde niet gekoppeld; de velden bestaan al en worden
   *  met de hand gevuld, of blijven leeg. */
  ga4_sessions?: number | null;
  ga4_engagement_rate?: number | null;
  ga4_bounce_rate?: number | null;
  ga4_session_seconds?: number | null;
  note?: string | null;
  source?: "MANUAL" | "CSV";
}

const WINDOWS_CLICK = [1, 7, 30, 60];
const WINDOWS_VIEW = [1, 7];

/**
 * De conversiecijfers van een maand vastleggen.
 *
 * Alleen wat er is meegegeven wordt geschreven; wat niet in het object zit
 * blijft staan. Dat is nodig omdat dit formulier en de nachtelijke pull op
 * dezelfde rij schrijven, en omdat iemand de omzet kan invullen zonder de
 * checkouts te weten.
 */
export async function saveMonthlyFigures(
  orgId: string, f: MonthlyFigures
): Promise<{ ok: true; month: string }> {
  if (!/^\d{4}-\d{2}(-\d{2})?$/.test(f.month)) {
    throw new Error(`"${f.month}" is not a month — use YYYY-MM`);
  }
  const month = f.month.length === 7 ? `${f.month}-01` : f.month;

  if (f.conversion_window_click != null && !WINDOWS_CLICK.includes(f.conversion_window_click)) {
    throw new Error(
      `A ${f.conversion_window_click}-day click window is not one Pinterest offers (1, 7, 30 or 60)`
    );
  }
  if (f.conversion_window_view != null && !WINDOWS_VIEW.includes(f.conversion_window_view)) {
    throw new Error(
      `A ${f.conversion_window_view}-day view window is not one Pinterest offers (1 or 7)`
    );
  }
  for (const [label, v] of [
    ["organic revenue", f.revenue_organic],
    ["paid-assisted revenue", f.revenue_paid_assisted],
    ["paid-unassisted revenue", f.revenue_paid_unassisted],
  ] as const) {
    if (v != null && (!Number.isFinite(v) || v < 0)) {
      throw new Error(`${label} cannot be ${v}`);
    }
  }
  // Een venster zonder omzet is niets, omzet zonder venster is een getal
  // waarvan niemand later meer weet waartegen het gemeten is.
  if (f.revenue_organic != null && f.conversion_window_click == null) {
    throw new Error(
      "Revenue needs the attribution window it was measured with — otherwise two months cannot " +
      "be compared and nobody can tell afterwards."
    );
  }

  await organicPool().query(
    `INSERT INTO organic.monthly_kpis (
       org_id, month,
       revenue_organic, revenue_paid_assisted, revenue_paid_unassisted,
       conversions, checkouts, add_to_cart, page_visits,
       conversion_window_click, conversion_window_view,
       ga4_sessions, ga4_engagement_rate, ga4_bounce_rate, ga4_session_seconds,
       figures_source, figures_note, figures_entered_at, measured_at
     ) VALUES (
       $1, $2::date,
       $3, $4, $5,
       $6, $7, $8, $9,
       $10, $11,
       $12, $13, $14, $15,
       $16, $17, now(), now()
     )
     ON CONFLICT (org_id, month) DO UPDATE SET
       -- COALESCE op EXCLUDED: wat niet is meegegeven blijft staan. De pull
       -- schrijft op dezelfde rij, en iemand die alleen de omzet weet mag de
       -- rest niet leegmaken.
       revenue_organic         = COALESCE(EXCLUDED.revenue_organic,         organic.monthly_kpis.revenue_organic),
       revenue_paid_assisted   = COALESCE(EXCLUDED.revenue_paid_assisted,   organic.monthly_kpis.revenue_paid_assisted),
       revenue_paid_unassisted = COALESCE(EXCLUDED.revenue_paid_unassisted, organic.monthly_kpis.revenue_paid_unassisted),
       conversions             = COALESCE(EXCLUDED.conversions,             organic.monthly_kpis.conversions),
       checkouts               = COALESCE(EXCLUDED.checkouts,               organic.monthly_kpis.checkouts),
       add_to_cart             = COALESCE(EXCLUDED.add_to_cart,             organic.monthly_kpis.add_to_cart),
       page_visits             = COALESCE(EXCLUDED.page_visits,             organic.monthly_kpis.page_visits),
       conversion_window_click = COALESCE(EXCLUDED.conversion_window_click, organic.monthly_kpis.conversion_window_click),
       conversion_window_view  = COALESCE(EXCLUDED.conversion_window_view,  organic.monthly_kpis.conversion_window_view),
       ga4_sessions            = COALESCE(EXCLUDED.ga4_sessions,            organic.monthly_kpis.ga4_sessions),
       ga4_engagement_rate     = COALESCE(EXCLUDED.ga4_engagement_rate,     organic.monthly_kpis.ga4_engagement_rate),
       ga4_bounce_rate         = COALESCE(EXCLUDED.ga4_bounce_rate,         organic.monthly_kpis.ga4_bounce_rate),
       ga4_session_seconds     = COALESCE(EXCLUDED.ga4_session_seconds,     organic.monthly_kpis.ga4_session_seconds),
       figures_source          = EXCLUDED.figures_source,
       figures_note            = COALESCE(EXCLUDED.figures_note, organic.monthly_kpis.figures_note),
       figures_entered_at      = now()`,
    [
      orgId, month,
      f.revenue_organic ?? null, f.revenue_paid_assisted ?? null, f.revenue_paid_unassisted ?? null,
      f.conversions ?? null, f.checkouts ?? null, f.add_to_cart ?? null, f.page_visits ?? null,
      f.conversion_window_click ?? null, f.conversion_window_view ?? null,
      f.ga4_sessions ?? null, f.ga4_engagement_rate ?? null,
      f.ga4_bounce_rate ?? null, f.ga4_session_seconds ?? null,
      f.source ?? "MANUAL", f.note ?? null,
    ]
  );
  return { ok: true, month };
}

export interface CsvPreviewRow {
  month: string;
  figures: MonthlyFigures;
  /** Wat er aan deze regel mankeert. Een rij met problemen wordt niet
   *  geïmporteerd en verdwijnt niet stil. */
  problems: string[];
}

/** Welke kolomnamen op welk veld vallen. Ruim, want elke export noemt het
 *  anders — en een kolom die niet herkend wordt, wordt gemeld en niet geraden. */
const CSV_FIELDS: Array<[keyof MonthlyFigures, string[]]> = [
  ["month", ["month", "maand", "period", "periode", "date"]],
  ["revenue_organic", ["organic revenue", "revenue organic", "organic conversion", "organic_conversion", "organic omzet"]],
  ["revenue_paid_assisted", ["paid assisted", "paid-assisted", "paid_assisted revenue", "paid assisted revenue"]],
  ["revenue_paid_unassisted", ["paid unassisted", "paid-unassisted", "paid_unassisted revenue", "paid unassisted revenue"]],
  ["conversions", ["conversions", "conversies", "total conversions", "checkout conversions"]],
  ["checkouts", ["checkouts", "checkout", "orders"]],
  ["add_to_cart", ["add to cart", "add_to_cart", "atc", "toegevoegd aan winkelwagen"]],
  ["page_visits", ["page visits", "page_visits", "pagebezoeken", "landing page views"]],
  ["conversion_window_click", ["click window", "click_window", "klikvenster", "attribution click"]],
  ["conversion_window_view", ["view window", "view_window", "viewvenster", "attribution view"]],
  ["ga4_sessions", ["sessions", "ga4 sessions", "sessies"]],
];

/**
 * Een CSV met maandcijfers lezen — voorbeeld eerst, importeren daarna.
 *
 * Dezelfde drie regels als de concurrentie-import (P2.1.6), en om dezelfde
 * redenen: het **scheidingsteken wordt gedetecteerd** (een Europese Excel
 * schrijft puntkomma's, en een komma-only parser leest zo'n bestand als één
 * kolom terwijl hij "12 rijen gelezen" meldt), de **BOM gaat eraf** of de eerste
 * kolomnaam matcht nooit, en een bestand **zonder maandkolom wordt geweigerd**
 * omdat er dan niets is om een rij aan te hangen.
 */
export function parseMonthlyCsv(text: string): {
  rows: CsvPreviewRow[];
  unknown_columns: string[];
  error?: string;
} {
  const clean = text.replace(/^﻿/, "").trim();
  if (!clean) return { rows: [], unknown_columns: [], error: "The file is empty" };

  const firstLine = clean.split(/\r?\n/)[0];
  const delimiter = [";", "\t", ","]
    .map((d) => ({ d, n: firstLine.split(d).length }))
    .sort((a, b) => b.n - a.n)[0];
  if (delimiter.n < 2) {
    return { rows: [], unknown_columns: [], error: "No columns found — is this a CSV?" };
  }

  const lines = clean.split(/\r?\n/).filter((l) => l.trim() !== "");
  const headers = lines[0].split(delimiter.d).map((h) => h.trim().replace(/^"|"$/g, "").toLowerCase());

  const mapping = new Map<number, keyof MonthlyFigures>();
  const unknown: string[] = [];
  headers.forEach((h, i) => {
    const hit = CSV_FIELDS.find(([, names]) => names.some((nm) => h === nm || h.includes(nm)));
    if (hit) mapping.set(i, hit[0]);
    else if (h) unknown.push(h);
  });
  if (![...mapping.values()].includes("month")) {
    return {
      rows: [], unknown_columns: unknown,
      error: "No month column found. Every row needs a month (YYYY-MM) to belong to.",
    };
  }

  const num = (raw: string): number | null => {
    const v = raw.trim().replace(/[€$£\s]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
    if (v === "" || v === "-") return null;
    const parsed = Number(v);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const rows: CsvPreviewRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(delimiter.d).map((c) => c.trim().replace(/^"|"$/g, ""));
    const figures: MonthlyFigures = { month: "", source: "CSV" };
    const problems: string[] = [];

    mapping.forEach((field, i) => {
      const raw = cells[i] ?? "";
      if (field === "month") {
        const m = /(\d{4})[-/](\d{1,2})/.exec(raw);
        if (m) figures.month = `${m[1]}-${m[2].padStart(2, "0")}-01`;
        else if (raw) problems.push(`"${raw}" is not a month (YYYY-MM)`);
        return;
      }
      const v = num(raw);
      if (v !== null) (figures as unknown as Record<string, unknown>)[field] = v;
    });

    if (!figures.month) { problems.push("no month on this row"); }
    if (figures.revenue_organic != null && figures.conversion_window_click == null) {
      problems.push("revenue without the attribution window it was measured with");
    }
    rows.push({ month: figures.month, figures, problems });
  }
  return { rows, unknown_columns: unknown };
}

/** De rijen uit een voorbeeld wegschrijven. Alleen de schone. */
export async function importMonthlyCsv(
  orgId: string, rows: CsvPreviewRow[]
): Promise<{ imported: number; skipped: number }> {
  let imported = 0;
  let skipped = 0;
  for (const r of rows) {
    if (r.problems.length > 0) { skipped += 1; continue; }
    await saveMonthlyFigures(orgId, { ...r.figures, source: "CSV" });
    imported += 1;
  }
  return { imported, skipped };
}

/* ------------------------------------------------------------------ */
/* De lus terug naar fase 4                                            */
/* ------------------------------------------------------------------ */

/**
 * P5.2.1 — deze pin werkte, neem hem mee.
 *
 * Een besluit en geen berekening: `winning_combinations` rangschikt op cijfers
 * en dat is een ranglijst. Wat de design brief van volgende maand nodig heeft is
 * dat iemand zei wélke, en waarom — die reden is het enige stuk dat opnieuw
 * gebruikt kan worden.
 */
export async function markPinWinner(
  orgId: string, pinId: string, isWinner: boolean, note?: string | null
): Promise<{ ok: true }> {
  if (isWinner && !note?.trim()) {
    throw new Error("A winner needs a note — what worked here is what the next brief reuses");
  }
  const r = await organicPool().query(
    `UPDATE organic.pins p
        SET is_winner = $3,
            winner_marked_at = CASE WHEN $3 THEN now() ELSE NULL END,
            winner_note = CASE WHEN $3 THEN $4 ELSE NULL END
       FROM organic.waterfalls w
      WHERE w.id = p.waterfall_id AND p.id = $1 AND w.org_id = $2`,
    [pinId, orgId, isWinner, note?.trim() ?? null]
  );
  if (r.rowCount === 0) throw new Error("Pin not found for this org");
  return { ok: true };
}

export async function loadTrendInputs(orgId: string, limit = 20): Promise<TrendInput[]> {
  const r = await organicPool().query<{
    id: string; month: string; term: string; direction: string;
    note: string | null; used_at: string | null;
  }>(
    `SELECT id::text, month::text AS month, term, direction, note, used_at::text AS used_at
       FROM organic.trend_inputs
      WHERE org_id = $1
      ORDER BY month DESC, term
      LIMIT $2`,
    [orgId, limit]
  );
  return r.rows;
}

export async function saveTrendInput(
  orgId: string,
  input: { month: string; term: string; direction?: string; note?: string | null }
): Promise<{ ok: true }> {
  const term = input.term.trim();
  if (!term) throw new Error("A trend needs a term");
  const month = input.month.length === 7 ? `${input.month}-01` : input.month;
  const direction = input.direction ?? "RISING";
  if (!["RISING", "FALLING", "SEASONAL_PEAK"].includes(direction)) {
    throw new Error(`"${direction}" is not a direction (RISING, FALLING or SEASONAL_PEAK)`);
  }
  await organicPool().query(
    `INSERT INTO organic.trend_inputs (org_id, month, term, direction, note)
     VALUES ($1, $2::date, $3, $4, $5)
     ON CONFLICT (org_id, month, lower(btrim(term))) DO UPDATE
        SET direction = EXCLUDED.direction,
            note = COALESCE(EXCLUDED.note, organic.trend_inputs.note)`,
    [orgId, month, term, direction, input.note?.trim() ?? null]
  );
  return { ok: true };
}

export async function deleteTrendInput(orgId: string, id: string): Promise<{ ok: true }> {
  const r = await organicPool().query(
    `DELETE FROM organic.trend_inputs WHERE id = $1 AND org_id = $2`, [id, orgId]
  );
  if (r.rowCount === 0) throw new Error("Trend not found for this org");
  return { ok: true };
}
