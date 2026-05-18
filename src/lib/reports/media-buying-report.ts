/**
 * Media Buying report generator. Dynamically composes a .docx from a
 * structured config that the modal builds — section toggles, per-dimension
 * toggles, view mode, and a free-form "Recommendation for Clients" section.
 *
 * Chart-in-document rendering is deferred to a follow-up: server-side chart
 * → image requires an SVG rasterizer (sharp / resvg) and Vercel deployment
 * tweaks. For now, dimensions configured with view: "chart" or "both" are
 * rendered as the Numbers table with a small note that charts are coming.
 */
import {
  title,
  subtitle,
  h1,
  h2,
  muted,
  spacer,
  p,
  dataTable,
  kpiStrip,
  buildDocxBuffer,
} from "./docx-builder";

// ---- Data shapes ----

export interface ReportKpis {
  spend: number;
  revenue: number;
  conversions: number;
  roas: number;
  cpa: number | null;
  /** Previous-period deltas (percentage points). null = no comparison. */
  spend_delta_pct?: number | null;
  revenue_delta_pct?: number | null;
  conversions_delta_pct?: number | null;
  roas_delta_pct?: number | null;
  cpa_delta_pct?: number | null;
}

export interface ReportLandingPage {
  url: string;
  ad_count: number;
  spend: number;
  conversions: number;
  revenue: number;
  roas: number;
  cpa: number | null;
}

export interface ReportDimensionRow {
  label: string;
  hint?: string | null;
  count: number;
  spend: number;
  revenue: number;
  conversions: number;
  roas: number;
  cpa: number | null;
}

export type ViewMode = "numbers" | "chart" | "both";

export interface ReportDimensionSection {
  title: string;
  description?: string;
  viewMode: ViewMode;
  rows: ReportDimensionRow[];
  /** Label for the first column header — defaults to "Value". */
  valueColumnLabel?: string;
  /** Label for the second column header — defaults to "Items". */
  countColumnLabel?: string;
}

export interface ReportAdTableRow {
  name: string;
  pin_id: string | null;
  created_time: number | null;
  spend: number;
  revenue: number;
  conversions: number;
  roas: number;
  cpa: number | null;
}

export interface ReportInput {
  client_name: string;
  date_range_label: string;
  currency: string;
  notes: string;

  /** Account Overview section — included if present. */
  overview?: {
    kpis?: ReportKpis;
    landingPages?: ReportLandingPage[];
  };

  campaignLevel?: {
    dimensions: ReportDimensionSection[];
  };

  adGroupLevel?: {
    dimensions: ReportDimensionSection[];
  };

  adLevel?: {
    dimensions: ReportDimensionSection[];
    /** If present, the report includes the top-N ad table. */
    topAds?: {
      title: string;
      description: string;
      ads: ReportAdTableRow[];
    };
  };
}

// ---- Formatters ----

const dash = "—";

function fmtCurrency(n: number | null, currency: string): string {
  if (n == null || !isFinite(n)) return dash;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: Math.abs(n) >= 1000 ? 0 : 2,
  }).format(n);
}

function fmtRoas(n: number | null): string {
  if (n == null || !isFinite(n)) return dash;
  return `${n.toFixed(2)}x`;
}

function fmtNum(n: number | null): string {
  if (n == null) return dash;
  return new Intl.NumberFormat("en-US").format(Math.round(n));
}

function fmtPctDelta(pct: number | null | undefined, inverse: boolean = false): string {
  if (pct == null || !isFinite(pct)) return "";
  const sign = pct >= 0 ? "+" : "";
  const good = inverse ? pct < 0 : pct > 0;
  const symbol = good ? "▲" : "▼";
  return `${symbol} ${sign}${pct.toFixed(1)}% vs prev.`;
}

function fmtLaunchDate(unixSec: number | null): string {
  if (unixSec == null) return "";
  return new Date(unixSec * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ---- Section builders ----

function renderAccountOverview(
  overview: NonNullable<ReportInput["overview"]>,
  currency: string
): string {
  const parts: string[] = [];
  parts.push(h1("Account Overview"));
  parts.push(
    muted(
      "Account-level performance and landing-page breakdown across the selected period."
    )
  );

  if (overview.kpis) {
    const k = overview.kpis;
    parts.push(
      kpiStrip([
        {
          label: "Total Spend",
          value: `${fmtCurrency(k.spend, currency)}${k.spend_delta_pct != null ? `\n${fmtPctDelta(k.spend_delta_pct)}` : ""}`,
        },
        {
          label: "Revenue",
          value: `${fmtCurrency(k.revenue, currency)}${k.revenue_delta_pct != null ? `\n${fmtPctDelta(k.revenue_delta_pct)}` : ""}`,
        },
        {
          label: "Conversions",
          value: `${fmtNum(k.conversions)}${k.conversions_delta_pct != null ? `\n${fmtPctDelta(k.conversions_delta_pct)}` : ""}`,
        },
        {
          label: "ROAS",
          value: `${fmtRoas(k.roas)}${k.roas_delta_pct != null ? `\n${fmtPctDelta(k.roas_delta_pct)}` : ""}`,
        },
        {
          label: "CPA",
          value: `${fmtCurrency(k.cpa, currency)}${k.cpa_delta_pct != null ? `\n${fmtPctDelta(k.cpa_delta_pct, true)}` : ""}`,
        },
      ])
    );
    parts.push(spacer(180));
  }

  if (overview.landingPages && overview.landingPages.length > 0) {
    parts.push(h2("Landing Page Performance"));
    parts.push(muted("All landing pages your ads point to in this period, aggregated."));
    const rows = overview.landingPages.map((lp) => [
      lp.url,
      String(lp.ad_count),
      fmtCurrency(lp.spend, currency),
      fmtCurrency(lp.revenue, currency),
      fmtNum(lp.conversions),
      fmtRoas(lp.roas),
      fmtCurrency(lp.cpa, currency),
    ]);
    parts.push(
      dataTable(
        ["Landing page", "Ads", "Spend", "Revenue", "Conv.", "ROAS", "CPA"],
        rows
      )
    );
  }

  return parts.join("");
}

function renderDimensionSection(
  dim: ReportDimensionSection,
  currency: string
): string {
  const parts: string[] = [];
  parts.push(h2(dim.title));
  if (dim.description) {
    parts.push(muted(dim.description));
  }

  const headers = [
    dim.valueColumnLabel || "Value",
    dim.countColumnLabel || "Items",
    "Spend",
    "Revenue",
    "Conv.",
    "ROAS",
    "CPA",
  ];
  const rows = dim.rows.map((r) => [
    r.hint && r.hint !== r.label && r.hint !== "—"
      ? `${r.label} (${r.hint})`
      : r.label,
    String(r.count),
    fmtCurrency(r.spend, currency),
    fmtCurrency(r.revenue, currency),
    fmtNum(r.conversions),
    fmtRoas(r.roas),
    fmtCurrency(r.cpa, currency),
  ]);
  parts.push(dataTable(headers, rows));

  // Chart placeholder when chart was requested. We don't actually render a
  // chart image yet — see file header comment.
  if (dim.viewMode === "chart" || dim.viewMode === "both") {
    parts.push(
      p(
        "Chart visualization will be rendered in a future release. The numbers above show the same data — bar lengths in the live dashboard map to the Spend / ROAS / CPA columns here.",
        { italic: true, sizeHalfPt: 18, color: "9CA3AF", spaceBefore: 120 }
      )
    );
  }
  parts.push(spacer(120));

  return parts.join("");
}

function renderLevelHeading(levelTitle: string, description: string): string {
  return h1(levelTitle) + muted(description);
}

function renderAdTopTable(
  topAds: NonNullable<NonNullable<ReportInput["adLevel"]>["topAds"]>,
  currency: string
): string {
  const parts: string[] = [];
  parts.push(h2(topAds.title));
  parts.push(muted(topAds.description));
  const rows = topAds.ads.map((a) => [
    `${a.name}${a.created_time ? `\nLaunched ${fmtLaunchDate(a.created_time)}` : ""}`,
    fmtCurrency(a.spend, currency),
    fmtCurrency(a.revenue, currency),
    fmtNum(a.conversions),
    fmtRoas(a.roas),
    fmtCurrency(a.cpa, currency),
  ]);
  parts.push(
    dataTable(
      ["Ad", "Spend", "Revenue", "Conv.", "ROAS", "CPA"],
      rows,
      9000
    )
  );
  return parts.join("");
}

function renderNotes(text: string): string {
  const parts: string[] = [];
  parts.push(h1("Recommendation for Clients"));
  const trimmed = (text || "").trim();
  if (!trimmed) {
    parts.push(
      p("(No recommendations added yet.)", {
        italic: true,
        color: "9CA3AF",
        sizeHalfPt: 22,
      })
    );
    return parts.join("");
  }
  for (const line of trimmed.split(/\r?\n/)) {
    parts.push(p(line, { sizeHalfPt: 22, spaceAfter: 80 }));
  }
  return parts.join("");
}

// ---- Top-level ----

export function generateMediaBuyingReport(input: ReportInput): Buffer {
  const parts: string[] = [];

  parts.push(title("Media Buying Report"));
  parts.push(subtitle(`${input.client_name} — ${input.date_range_label}`));

  if (input.overview) {
    parts.push(renderAccountOverview(input.overview, input.currency));
  }

  if (input.campaignLevel && input.campaignLevel.dimensions.length > 0) {
    parts.push(
      renderLevelHeading(
        "Campaign Level",
        "Aggregated performance per campaign-naming dimension. Each table totals all campaigns that share that value — not per individual campaign."
      )
    );
    for (const dim of input.campaignLevel.dimensions) {
      parts.push(renderDimensionSection(dim, input.currency));
    }
  }

  if (input.adGroupLevel && input.adGroupLevel.dimensions.length > 0) {
    parts.push(
      renderLevelHeading(
        "Ad Group Level",
        "Aggregated performance per ad-group-naming dimension across the selected period."
      )
    );
    for (const dim of input.adGroupLevel.dimensions) {
      parts.push(renderDimensionSection(dim, input.currency));
    }
  }

  if (input.adLevel && (input.adLevel.dimensions.length > 0 || input.adLevel.topAds)) {
    parts.push(
      renderLevelHeading(
        "Ad Level",
        "Aggregated performance per ad-naming dimension, plus a per-ad performance table."
      )
    );
    if (input.adLevel.topAds) {
      parts.push(renderAdTopTable(input.adLevel.topAds, input.currency));
    }
    for (const dim of input.adLevel.dimensions) {
      parts.push(renderDimensionSection(dim, input.currency));
    }
  }

  parts.push(renderNotes(input.notes));

  return buildDocxBuffer(parts.join(""));
}
