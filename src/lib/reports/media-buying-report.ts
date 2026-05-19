/**
 * Media Buying report generator. Dynamically composes a .docx from a
 * structured config that the modal builds — section toggles, per-dimension
 * toggles, view mode, and a free-form "Recommendation for Clients" section.
 *
 * Charts are rendered server-side as PNGs (chart-renderer.ts → SVG → resvg)
 * and embedded inline so the doc matches the dashboard's line-chart look.
 */
import {
  title,
  subtitle,
  muted,
  spacer,
  p,
  dataTable,
  kpiStrip,
  chapterHeading,
  sectionHeading,
  tableOfContents,
  inlineImage,
  buildDocxFromTemplate,
  type DataTableColumn,
  type DataTableRow,
  type EmbeddedImage,
  type TocEntry,
} from "./docx-builder";
import { renderLineChartPng, type ChartInput } from "./chart-renderer";

/** Header / footer relationship IDs in media-buying-report-template.docx.
 *  Verified by inspecting the file's word/_rels/document.xml.rels — rId8 =
 *  header1.xml, rId9 = footer1.xml. */
const TEMPLATE_HEADER_REL_ID = "rId8";
const TEMPLATE_FOOTER_REL_ID = "rId9";
const TEMPLATE_PATH = "src/templates/media-buying-report-template.docx";

// ---- Data shapes ----

export interface ReportKpis {
  spend: number;
  revenue: number;
  conversions: number;
  roas: number;
  cpa: number | null;
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
  valueColumnLabel?: string;
  countColumnLabel?: string;
  /** Optional daily time-series data for chart rendering. When the section
   *  is requested with viewMode chart or both AND chart data is present, a
   *  line chart PNG is rendered below (or in place of) the numbers table. */
  chart?: ChartInput;
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

  overview?: {
    kpis?: ReportKpis;
    landingPages?: ReportLandingPage[];
  };
  campaignLevel?: { dimensions: ReportDimensionSection[] };
  adGroupLevel?: { dimensions: ReportDimensionSection[] };
  adLevel?: {
    dimensions: ReportDimensionSection[];
    topAds?: { title: string; description: string; ads: ReportAdTableRow[] };
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

function fmtPctDelta(
  pct: number | null | undefined,
  inverse: boolean = false
): { text: string; color: string } | null {
  if (pct == null || !isFinite(pct)) return null;
  const sign = pct >= 0 ? "+" : "";
  const good = inverse ? pct < 0 : pct > 0;
  const symbol = good ? "▲" : "▼";
  const color = good ? "16A34A" : "B91C1C";
  return { text: `${symbol} ${sign}${pct.toFixed(1)}% vs prev.`, color };
}

function fmtLaunchDate(unixSec: number | null): string {
  if (unixSec == null) return "";
  return new Date(unixSec * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function roasValueColor(roas: number, spend: number): string | undefined {
  if (spend <= 0) return undefined;
  if (roas >= 3) return "16A34A";
  if (roas < 1.5) return "B45309";
  return undefined;
}

// ---- Chart embedding state (collected during render, injected at the end) ----

interface PendingChartImage {
  rId: string;
  filename: string;
  buffer: Buffer;
}

class ChartCollector {
  private images: PendingChartImage[] = [];
  private nextSeq = 1;

  /** Render the chart, store the PNG, and return the rId. When rendering
   *  fails or there's no data, returns an error string instead. Callers
   *  surface the error inside the doc so failures are visible, not silent. */
  add(
    chart: ChartInput,
    namePrefix: string
  ): { rId: string } | { error: string } {
    const result = renderLineChartPng(chart);
    if (result.error || !result.buffer) {
      return { error: result.error || "Unknown chart-render failure." };
    }
    const seq = this.nextSeq++;
    const rId = `rIdChart${seq}`;
    const filename = `${namePrefix}-${seq}.png`;
    this.images.push({ rId, filename, buffer: result.buffer });
    return { rId };
  }

  toEmbeddedImages(): EmbeddedImage[] {
    return this.images.map((i) => ({
      rId: i.rId,
      filename: i.filename,
      ext: "png",
      buffer: i.buffer,
    }));
  }
}

// ---- Section builders ----

function renderAccountOverview(
  overview: NonNullable<ReportInput["overview"]>,
  currency: string
): string {
  const parts: string[] = [];
  parts.push(chapterHeading("Account Overview"));
  parts.push(
    muted(
      "Account-level performance and landing-page breakdown across the selected period."
    )
  );

  if (overview.kpis) {
    const k = overview.kpis;
    parts.push(sectionHeading("Headline KPIs"));
    const spendDelta = fmtPctDelta(k.spend_delta_pct);
    const revenueDelta = fmtPctDelta(k.revenue_delta_pct);
    const convDelta = fmtPctDelta(k.conversions_delta_pct);
    const roasDelta = fmtPctDelta(k.roas_delta_pct);
    const cpaDelta = fmtPctDelta(k.cpa_delta_pct, true);
    parts.push(
      kpiStrip([
        {
          label: "Total Spend",
          value: fmtCurrency(k.spend, currency),
          sub: spendDelta?.text,
          subColor: spendDelta?.color,
        },
        {
          label: "Revenue",
          value: fmtCurrency(k.revenue, currency),
          sub: revenueDelta?.text,
          subColor: revenueDelta?.color,
        },
        {
          label: "Conversions",
          value: fmtNum(k.conversions),
          sub: convDelta?.text,
          subColor: convDelta?.color,
        },
        {
          label: "ROAS",
          value: fmtRoas(k.roas),
          sub: roasDelta?.text,
          subColor: roasDelta?.color,
          valueColor: roasValueColor(k.roas, k.spend),
        },
        {
          label: "CPA",
          value: fmtCurrency(k.cpa, currency),
          sub: cpaDelta?.text,
          subColor: cpaDelta?.color,
        },
      ])
    );
    parts.push(spacer(200));
  }

  if (overview.landingPages && overview.landingPages.length > 0) {
    parts.push(sectionHeading("Landing Page Performance"));
    parts.push(
      muted("All landing pages your ads point to in this period, aggregated.")
    );
    // Column order matches the dashboard: Landing page · Ads · Spend ·
    // Conv. · Revenue · ROAS · CPA. Bullet on the landing-page column so
    // each URL gets its own cohort indicator just like the per-dim tables.
    const rows: DataTableRow[] = overview.landingPages.map((lp) => ({
      cells: [
        lp.url,
        String(lp.ad_count),
        fmtCurrency(lp.spend, currency),
        fmtNum(lp.conversions),
        fmtCurrency(lp.revenue, currency),
        fmtRoas(lp.roas),
        fmtCurrency(lp.cpa, currency),
      ],
    }));
    const cols: DataTableColumn[] = [
      {
        header: "Landing page",
        widthDxa: 5400,
        align: "left",
        coloredBullet: true,
      },
      { header: "Ads", align: "right" },
      { header: "Spend", align: "right" },
      { header: "Conv.", align: "right" },
      { header: "Revenue", align: "right" },
      { header: "ROAS", align: "right", colorAsRoas: true },
      { header: "CPA", align: "right" },
    ];
    parts.push(dataTable(cols, rows));
  }

  return parts.join("");
}

function renderDimensionSection(
  dim: ReportDimensionSection,
  currency: string,
  charts: ChartCollector
): string {
  const parts: string[] = [];
  parts.push(sectionHeading(dim.title));
  if (dim.description) parts.push(muted(dim.description));

  const showNumbers = dim.viewMode === "numbers" || dim.viewMode === "both";
  const showChart = dim.viewMode === "chart" || dim.viewMode === "both";

  if (showNumbers) {
    // Column order matches the dashboard: Value · Count · Spend · Conv. ·
    // Revenue · ROAS · CPA. First column narrower so 7 columns fit
    // without "Revenue" / "Campaigns" wrapping mid-word.
    const cols: DataTableColumn[] = [
      {
        header: dim.valueColumnLabel || "Value",
        align: "left",
        widthDxa: 3000,
        coloredBullet: true,
      },
      { header: dim.countColumnLabel || "Items", align: "right" },
      { header: "Spend", align: "right" },
      { header: "Conv.", align: "right" },
      { header: "Revenue", align: "right" },
      { header: "ROAS", align: "right", colorAsRoas: true },
      { header: "CPA", align: "right" },
    ];
    const rows: DataTableRow[] = dim.rows.map((r) => ({
      cells: [
        r.hint && r.hint !== r.label && r.hint !== "—"
          ? `${r.label} (${r.hint})`
          : r.label,
        String(r.count),
        fmtCurrency(r.spend, currency),
        fmtNum(r.conversions),
        fmtCurrency(r.revenue, currency),
        fmtRoas(r.roas),
        fmtCurrency(r.cpa, currency),
      ],
    }));
    parts.push(dataTable(cols, rows));
  }

  if (showChart) {
    if (!dim.chart) {
      parts.push(
        p(
          "[Chart] No daily series data was available for this dimension when the report was generated.",
          { italic: true, color: "B45309", sizeHalfPt: 18 }
        )
      );
    } else {
      const result = charts.add(dim.chart, "chart");
      if ("rId" in result) {
        // 6.5" wide × 2.75" tall — fits A4 page width with margins.
        parts.push(
          inlineImage(result.rId, `${dim.title} — daily trend`, 9.5, 3)
        );
      } else {
        parts.push(
          p(`[Chart] ${result.error}`, {
            italic: true,
            color: "B45309",
            sizeHalfPt: 18,
          })
        );
      }
    }
  }

  parts.push(spacer(180));
  return parts.join("");
}

function renderLevelHeading(levelTitle: string, description: string): string {
  return chapterHeading(levelTitle) + muted(description);
}

function renderAdTopTable(
  topAds: NonNullable<NonNullable<ReportInput["adLevel"]>["topAds"]>,
  currency: string
): string {
  const parts: string[] = [];
  parts.push(sectionHeading(topAds.title));
  parts.push(muted(topAds.description));
  const cols: DataTableColumn[] = [
    { header: "Ad", widthDxa: 3600, align: "left" },
    { header: "Spend", align: "right" },
    { header: "Revenue", align: "right" },
    { header: "Conv.", align: "right" },
    { header: "ROAS", align: "right", colorAsRoas: true },
    { header: "CPA", align: "right" },
  ];
  const rows: DataTableRow[] = topAds.ads.map((a) => ({
    cells: [
      `${a.name}${a.created_time ? `\nLaunched ${fmtLaunchDate(a.created_time)}` : ""}`,
      fmtCurrency(a.spend, currency),
      fmtCurrency(a.revenue, currency),
      fmtNum(a.conversions),
      fmtRoas(a.roas),
      fmtCurrency(a.cpa, currency),
    ],
  }));
  parts.push(dataTable(cols, rows));
  return parts.join("");
}

function renderNotes(text: string): string {
  const parts: string[] = [];
  parts.push(chapterHeading("Recommendation for Clients"));
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

export async function generateMediaBuyingReport(
  input: ReportInput
): Promise<Buffer> {
  const parts: string[] = [];
  const charts = new ChartCollector();

  parts.push(title("Media Buying Report"));
  parts.push(subtitle(`${input.client_name} — ${input.date_range_label}`));
  parts.push(spacer(240));

  // Build TOC entries dynamically from what the user actually selected.
  const tocEntries: TocEntry[] = [];
  if (input.overview) {
    tocEntries.push({
      title: "Account Overview",
      description:
        "Headline KPIs (Spend, Revenue, Conversions, ROAS, CPA) for the period, plus a landing-page breakdown showing where ad clicks land.",
    });
  }
  if (input.campaignLevel && input.campaignLevel.dimensions.length > 0) {
    tocEntries.push({
      title: "Campaign Level",
      description: `Aggregated performance per campaign-naming dimension — ${input.campaignLevel.dimensions
        .map((d) => d.title)
        .join(", ")}.`,
    });
  }
  if (input.adGroupLevel && input.adGroupLevel.dimensions.length > 0) {
    tocEntries.push({
      title: "Ad Group Level",
      description: `Per ad-group-naming dimension — ${input.adGroupLevel.dimensions
        .map((d) => d.title)
        .join(", ")}.`,
    });
  }
  if (
    input.adLevel &&
    (input.adLevel.dimensions.length > 0 || input.adLevel.topAds)
  ) {
    const adParts: string[] = [];
    if (input.adLevel.topAds) adParts.push("Top ads ranking");
    if (input.adLevel.dimensions.length > 0) {
      adParts.push(input.adLevel.dimensions.map((d) => d.title).join(", "));
    }
    tocEntries.push({
      title: "Ad Level",
      description: `Per ad-naming dimension — ${adParts.join(" · ")}.`,
    });
  }
  tocEntries.push({
    title: "Recommendation for Clients",
    description:
      "Free-form gameplan, observations, and next-step suggestions for the client.",
  });
  parts.push(tableOfContents(tocEntries));

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
      parts.push(renderDimensionSection(dim, input.currency, charts));
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
      parts.push(renderDimensionSection(dim, input.currency, charts));
    }
  }

  if (
    input.adLevel &&
    (input.adLevel.dimensions.length > 0 || input.adLevel.topAds)
  ) {
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
      parts.push(renderDimensionSection(dim, input.currency, charts));
    }
  }

  parts.push(renderNotes(input.notes));

  return buildDocxFromTemplate(TEMPLATE_PATH, parts.join(""), {
    headerRelId: TEMPLATE_HEADER_REL_ID,
    footerRelId: TEMPLATE_FOOTER_REL_ID,
    images: charts.toEmbeddedImages(),
  });
}
