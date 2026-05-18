/**
 * Render a multi-line time-series chart as a PNG buffer for embedding in
 * the Media Buying report .docx. Matches the dashboard's Numbers/Chart
 * line chart styling.
 *
 * Implementation: build an SVG string by hand, rasterize to PNG with
 * resvg. resvg cannot render text without an explicit font — we ship
 * Roboto-Regular.ttf in src/templates/fonts and pass it via fontBuffers
 * so charts render correctly on any environment (macOS dev or Linux
 * Vercel serverless).
 */
import { Resvg } from "@resvg/resvg-js";
import path from "path";

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

// Path to the bundled Roboto TTF. resvg-js accepts file paths via
// `fontFiles`. Computed once per process.
function getFontPath(): string {
  return path.join(
    process.cwd(),
    "src",
    "templates",
    "fonts",
    "Roboto-Regular.ttf"
  );
}

export interface ChartSeries {
  name: string;
  /** One number per date entry in `dates`. null = no data for that day. */
  values: (number | null)[];
}

export interface ChartInput {
  /** Title shown above the chart — e.g. "Per Country — Daily ROAS". */
  title?: string;
  /** Dates in ISO format (YYYY-MM-DD) — used for X-axis labels. */
  dates: string[];
  series: ChartSeries[];
  /** Y-axis tick formatter. */
  yAxisFormat: "currency" | "ratio" | "number";
  /** Y-axis title text — e.g. "ROAS", "Spend (€)". */
  yAxisLabel?: string;
  currency?: string;
  /** Chart pixel dimensions before rasterization. */
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
  const height = input.heightPx ?? 600;
  const titleH = input.title ? 36 : 0;
  const legendH = 32;
  const marginLeft = 110;
  const marginRight = 30;
  const marginTop = titleH + legendH + 16;
  const marginBottom = 70;
  const innerW = width - marginLeft - marginRight;
  const innerH = height - marginTop - marginBottom;

  // Collect all finite values to find the Y range.
  const allValues: number[] = [];
  for (const s of input.series) {
    for (const v of s.values) {
      if (v != null && isFinite(v) && v > 0) allValues.push(v);
    }
  }
  const maxVal = allValues.length > 0 ? Math.max(...allValues) : 1;
  const padded = maxVal * 1.1;
  const yMin = 0;
  const yMax = padded > 0 ? padded : 1;

  const n = input.dates.length;
  const xStep = n > 1 ? innerW / (n - 1) : 0;

  // ---- Title ----
  const titleSvg = input.title
    ? `<text x="${marginLeft}" y="22" font-family="Roboto, Arial, sans-serif" font-size="18" font-weight="600" fill="#111827">${escapeXml(input.title)}</text>`
    : "";

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
      `<text x="${marginLeft - 12}" y="${y + 5}" font-family="Roboto, Arial, sans-serif" font-size="14" fill="#6B7280" text-anchor="end">${escapeXml(label)}</text>`
    );
  }

  // ---- Y-axis title (rotated) ----
  const yAxisTitle = input.yAxisLabel
    ? `<text x="${28}" y="${marginTop + innerH / 2}" font-family="Roboto, Arial, sans-serif" font-size="13" font-weight="600" fill="#374151" text-anchor="middle" transform="rotate(-90 28 ${marginTop + innerH / 2})">${escapeXml(input.yAxisLabel)}</text>`
    : "";

  // ---- X axis labels — show at most 8 to avoid crowding ----
  const maxLabels = Math.min(8, n);
  const labelStep = Math.max(1, Math.ceil(n / maxLabels));
  const xLabels: string[] = [];
  for (let i = 0; i < n; i += labelStep) {
    const x = marginLeft + xStep * i;
    xLabels.push(
      `<text x="${x}" y="${marginTop + innerH + 26}" font-family="Roboto, Arial, sans-serif" font-size="14" fill="#6B7280" text-anchor="middle">${escapeXml(formatDateLabel(input.dates[i]))}</text>`
    );
  }
  if (n > 0 && (n - 1) % labelStep !== 0) {
    const x = marginLeft + xStep * (n - 1);
    xLabels.push(
      `<text x="${x}" y="${marginTop + innerH + 26}" font-family="Roboto, Arial, sans-serif" font-size="14" fill="#6B7280" text-anchor="middle">${escapeXml(formatDateLabel(input.dates[n - 1]))}</text>`
    );
  }

  // ---- Lines, one per cohort ----
  const linePaths: string[] = [];
  for (let s = 0; s < input.series.length; s++) {
    const series = input.series[s];
    const color = COHORT_COLORS[s % COHORT_COLORS.length];
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

  // ---- Legend (below title, above plot) ----
  const legendY = titleH + 14;
  let legendX = marginLeft;
  const legend: string[] = [];
  for (let i = 0; i < input.series.length; i++) {
    const item = input.series[i];
    const color = COHORT_COLORS[i % COHORT_COLORS.length];
    legend.push(
      `<rect x="${legendX}" y="${legendY}" width="22" height="3.5" rx="1.75" fill="${color}"/>`,
      `<text x="${legendX + 30}" y="${legendY + 10}" font-family="Roboto, Arial, sans-serif" font-size="14" font-weight="500" fill="#111827">${escapeXml(item.name)}</text>`
    );
    legendX += 30 + (item.name.length * 8.5) + 28;
  }

  // ---- Axes ----
  const xAxis = `<line x1="${marginLeft}" y1="${marginTop + innerH}" x2="${marginLeft + innerW}" y2="${marginTop + innerH}" stroke="#D1D5DB" stroke-width="1"/>`;
  const yAxis = `<line x1="${marginLeft}" y1="${marginTop}" x2="${marginLeft}" y2="${marginTop + innerH}" stroke="#D1D5DB" stroke-width="1"/>`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect width="${width}" height="${height}" fill="#FFFFFF"/>` +
    titleSvg +
    legend.join("") +
    gridLines.join("") +
    yLabels.join("") +
    xLabels.join("") +
    yAxisTitle +
    xAxis +
    yAxis +
    linePaths.join("") +
    `</svg>`
  );
}

export interface ChartRenderResult {
  buffer?: Buffer;
  error?: string;
}

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
      font: {
        // Bundled Roboto — works identically on macOS dev + Linux Vercel.
        // Falls back to no system fonts so charts render consistently.
        fontFiles: [getFontPath()],
        defaultFontFamily: "Roboto",
        loadSystemFonts: false,
      },
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
