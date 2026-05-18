/**
 * Render a multi-line time-series chart as a PNG buffer for embedding in
 * the Media Buying report .docx. Matches the dashboard's Numbers/Chart
 * line chart styling.
 *
 * Implementation: build an SVG string by hand (we know the exact shape of
 * the data — daily points per cohort), then rasterize to PNG with resvg.
 * resvg is a native Rust binding (~3MB) with prebuilds for linux-x64-gnu
 * which is what Vercel serverless runs.
 */
import { Resvg } from "@resvg/resvg-js";

const COHORT_COLORS = [
  "#2563EB",
  "#16A34A",
  "#E25822",
  "#7C3AED",
  "#0EA5E9",
  "#DB2777",
  "#CA8A04",
  "#0F766E",
  "#9333EA",
  "#DC2626",
];

export interface ChartSeries {
  name: string;
  /** One number per date entry in `dates`. null = no data for that day. */
  values: (number | null)[];
}

export interface ChartInput {
  /** Dates in ISO format (YYYY-MM-DD) — used for X-axis labels. */
  dates: string[];
  series: ChartSeries[];
  /** Optional Y-axis label suffix, e.g. "x" for ROAS or currency code. */
  yAxisFormat: "currency" | "ratio" | "number";
  currency?: string;
  /** Chart pixel dimensions before rasterization. The report embeds the
   *  PNG at 6.5" wide, so 1300x550 keeps roughly 2x DPI for crisp output. */
  widthPx?: number;
  heightPx?: number;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatTick(value: number, fmt: ChartInput["yAxisFormat"], currency?: string): string {
  if (fmt === "ratio") return `${value.toFixed(1)}x`;
  if (fmt === "currency") {
    if (!isFinite(value) || value === 0) return "0";
    const abs = Math.abs(value);
    const symbol = currency === "EUR" ? "€" : currency === "GBP" ? "£" : "$";
    if (abs >= 1000) return `${symbol}${(value / 1000).toFixed(1)}k`;
    return `${symbol}${value.toFixed(0)}`;
  }
  return Math.round(value).toString();
}

function formatDateLabel(iso: string): string {
  // Compact "May 12" style — matches dashboard.
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Build SVG for a multi-line chart with a clean dashboard-style look. */
function buildSvg(input: ChartInput): string {
  const width = input.widthPx ?? 1300;
  const height = input.heightPx ?? 550;
  const marginLeft = 90;
  const marginRight = 30;
  const marginTop = 30;
  const marginBottom = 60;
  const innerW = width - marginLeft - marginRight;
  const innerH = height - marginTop - marginBottom;

  // Collect all finite values to find the Y range.
  const allValues: number[] = [];
  for (const s of input.series) {
    for (const v of s.values) {
      if (v != null && isFinite(v) && v > 0) allValues.push(v);
    }
  }
  // 0..max with 10% padding above. Floor min at 0 so the baseline is
  // intuitive.
  const maxVal = allValues.length > 0 ? Math.max(...allValues) : 1;
  const padded = maxVal * 1.1;
  const yMin = 0;
  const yMax = padded > 0 ? padded : 1;

  const n = input.dates.length;
  const xStep = n > 1 ? innerW / (n - 1) : 0;

  // ---- Y gridlines + labels (5 ticks) ----
  const yTicks = 5;
  const gridLines: string[] = [];
  const yLabels: string[] = [];
  for (let i = 0; i <= yTicks; i++) {
    const v = yMin + ((yMax - yMin) * i) / yTicks;
    const y = marginTop + innerH - (innerH * i) / yTicks;
    gridLines.push(
      `<line x1="${marginLeft}" y1="${y}" x2="${marginLeft + innerW}" y2="${y}" stroke="#E5E7EB" stroke-width="1" stroke-dasharray="3 3"/>`
    );
    const label = formatTick(v, input.yAxisFormat, input.currency);
    yLabels.push(
      `<text x="${marginLeft - 10}" y="${y + 4}" font-family="Arial, sans-serif" font-size="14" fill="#6B7280" text-anchor="end">${escapeXml(label)}</text>`
    );
  }

  // ---- X axis labels — show at most 8 to avoid crowding ----
  const maxLabels = Math.min(8, n);
  const labelStep = Math.max(1, Math.ceil(n / maxLabels));
  const xLabels: string[] = [];
  for (let i = 0; i < n; i += labelStep) {
    const x = marginLeft + xStep * i;
    xLabels.push(
      `<text x="${x}" y="${marginTop + innerH + 24}" font-family="Arial, sans-serif" font-size="14" fill="#6B7280" text-anchor="middle">${escapeXml(formatDateLabel(input.dates[i]))}</text>`
    );
  }
  // Always show the last label too so the right edge is anchored.
  if (n > 0 && (n - 1) % labelStep !== 0) {
    const x = marginLeft + xStep * (n - 1);
    xLabels.push(
      `<text x="${x}" y="${marginTop + innerH + 24}" font-family="Arial, sans-serif" font-size="14" fill="#6B7280" text-anchor="middle">${escapeXml(formatDateLabel(input.dates[n - 1]))}</text>`
    );
  }

  // ---- Lines, one per cohort ----
  const linePaths: string[] = [];
  for (let s = 0; s < input.series.length; s++) {
    const series = input.series[s];
    const color = COHORT_COLORS[s % COHORT_COLORS.length];
    // Build a path string treating null as a gap. Recharts' `connectNulls`
    // pattern: stitch across gaps with a single continuous line.
    const xy: Array<[number, number]> = [];
    for (let i = 0; i < n; i++) {
      const v = series.values[i];
      if (v == null || !isFinite(v)) continue;
      const x = marginLeft + xStep * i;
      const y =
        marginTop + innerH - (innerH * (v - yMin)) / Math.max(0.0001, yMax - yMin);
      xy.push([x, y]);
    }
    if (xy.length === 0) continue;
    const d = xy.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    linePaths.push(
      `<path d="${d}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`
    );
  }

  // ---- Legend (top) ----
  // Word/Pages embeds the PNG flat — so the legend lives inside the SVG.
  const legendItems = input.series.map((s, i) => {
    const color = COHORT_COLORS[i % COHORT_COLORS.length];
    return { name: s.name, color };
  });
  const legendY = 12;
  let legendX = marginLeft;
  const legend: string[] = [];
  for (const item of legendItems) {
    legend.push(
      `<rect x="${legendX}" y="${legendY}" width="16" height="3" rx="1.5" fill="${item.color}"/>`,
      `<text x="${legendX + 22}" y="${legendY + 8}" font-family="Arial, sans-serif" font-size="14" fill="#111827">${escapeXml(item.name)}</text>`
    );
    legendX += 22 + (item.name.length * 7.5) + 24;
  }

  // ---- Axes ----
  const xAxis = `<line x1="${marginLeft}" y1="${marginTop + innerH}" x2="${marginLeft + innerW}" y2="${marginTop + innerH}" stroke="#D1D5DB" stroke-width="1"/>`;
  const yAxis = `<line x1="${marginLeft}" y1="${marginTop}" x2="${marginLeft}" y2="${marginTop + innerH}" stroke="#D1D5DB" stroke-width="1"/>`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect width="${width}" height="${height}" fill="#FFFFFF"/>` +
    legend.join("") +
    gridLines.join("") +
    yLabels.join("") +
    xLabels.join("") +
    xAxis +
    yAxis +
    linePaths.join("") +
    `</svg>`
  );
}

export interface ChartRenderResult {
  /** Set when rendering succeeded. */
  buffer?: Buffer;
  /** Set when rendering failed or had no data. The message is intended
   *  for end users to see inside the doc — not a stack trace. */
  error?: string;
}

/**
 * Rasterize the chart SVG to a PNG Buffer. Never throws — failures (no
 * data, resvg crash) are returned as `error` so the report can render a
 * visible note in place of the chart instead of silently omitting it.
 */
export function renderLineChartPng(input: ChartInput): ChartRenderResult {
  const hasAny = input.series.some((s) =>
    s.values.some((v) => v != null && isFinite(v))
  );
  if (!hasAny || input.dates.length === 0) {
    return { error: "No daily data available for this dimension." };
  }
  try {
    const svg = buildSvg(input);
    const resvg = new Resvg(svg, {
      background: "#FFFFFF",
      fitTo: { mode: "width", value: input.widthPx ?? 1300 },
    });
    const png = resvg.render();
    return { buffer: Buffer.from(png.asPng()) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      error: `Chart could not be rendered server-side: ${msg.slice(0, 200)}`,
    };
  }
}
