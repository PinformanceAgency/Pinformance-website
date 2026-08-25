/**
 * ORGANIC DESIGN SYSTEM · chart primitives
 *
 * Hand-drawn SVG rather than a chart library, because the brief's rules
 * are exactly the ones libraries fight you on: direct labelling instead
 * of legends, no gridline clutter, a baseline drawn as a real reference
 * line, and a palette that is never the library default.
 *
 * Every chart answers one question, named in its title. A chart that
 * needs a paragraph to explain is the wrong chart.
 */
import { cn } from "@/lib/utils";

// Series order, not a rainbow: brand red, near black, then two greys.
// The keys are historical — `teal` is now the brand red — and are kept
// so every existing chart call site stays valid.
export const DATA_COLORS = {
  teal:  "var(--color-o-teal)",   // primary series · brand red
  sand:  "var(--color-o-sand)",   // secondary · near black
  clay:  "var(--color-o-clay)",   // tertiary · mid grey
  slate: "var(--color-o-slate)",  // quaternary · light grey
} as const;
export type DataColor = keyof typeof DATA_COLORS;

/* ------------------------------------------------------------------ *
 * Segmented bar — a composite score with its parts exposed
 * ------------------------------------------------------------------ */

export interface Segment {
  label: string;
  /** 0–100 for this component. null = not yet measurable. */
  score: number | null;
  /** Share of the composite, 0–1. */
  weight: number;
  color: DataColor;
}

/**
 * The health score, never a black box. Each component occupies its
 * weighted share of the width and fills to its own score, so a weak
 * component is visible as a short fill rather than hidden inside an
 * average. Unmeasurable components are drawn as hatched voids — present,
 * clearly not counted.
 */
export function SegmentedScore({
  segments, height = 10, dark = false,
}: {
  segments: Segment[];
  height?: number;
  /** On the near-black focus panel. The ink levels and the empty-track
   *  colour both have to invert — near-black labels on a dark ground are
   *  simply invisible, which is what happened when this was first put
   *  there. */
  dark?: boolean;
}) {
  const totalWeight = segments.reduce((s, x) => s + x.weight, 0) || 1;
  return (
    <div>
      <div className="flex gap-[3px] w-full" style={{ height }}>
        {segments.map((s) => {
          const widthPct = (s.weight / totalWeight) * 100;
          const measurable = s.score !== null;
          return (
            <div
              key={s.label}
              style={{ width: `${widthPct}%` }}
              className={cn("relative rounded-[2px] overflow-hidden",
                dark ? "bg-white/[0.09]" : "bg-o-sunk")}
              title={measurable
                ? `${s.label}: ${Math.round(s.score!)} / 100 · ${Math.round(s.weight * 100)}% of the score`
                : `${s.label}: not yet measurable · ${Math.round(s.weight * 100)}% of the score`}
            >
              {measurable ? (
                <div
                  className="absolute inset-y-0 left-0 rounded-[2px]"
                  style={{ width: `${s.score}%`, background: DATA_COLORS[s.color] }}
                />
              ) : (
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundImage: dark
                      ? "repeating-linear-gradient(45deg, rgba(255,255,255,.20) 0 2px, transparent 2px 5px)"
                      : "repeating-linear-gradient(45deg, var(--color-o-hairline-firm) 0 2px, transparent 2px 5px)",
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
      {/* Direct labelling under each segment — no legend. */}
      <div className="flex gap-[3px] w-full mt-1.5">
        {segments.map((s) => (
          <div key={s.label} style={{ width: `${(s.weight / totalWeight) * 100}%` }} className="min-w-0">
            <div className={cn("text-[length:var(--text-o-label)] truncate",
              dark ? "text-white/45" : "text-o-ink-2")}>{s.label}</div>
            <div className={cn("o-figure text-[length:var(--text-o-body)]",
              dark ? "text-white" : "text-o-ink")}>
              {s.score === null
                ? <span className={cn("font-normal", dark ? "text-white/25" : "text-o-ink-3")}>—</span>
                : Math.round(s.score)}
              <span className={cn("font-normal ml-1",
                dark ? "text-white/30" : "text-o-ink-3")}>
                ·{Math.round(s.weight * 100)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Trend line — thin, direct-labelled, baseline drawn
 * ------------------------------------------------------------------ */

export interface TrendPoint { x: string; y: number | null }

/**
 * A single series over time against its baseline.
 *
 * Axis does NOT start at zero — this chart shows change, and forcing zero
 * flattens the very movement it exists to show. The baseline is drawn as
 * a real reference line, never implied. The series is labelled at its end
 * rather than in a legend.
 */
export function TrendLine({
  points, baseline, color = "teal", label, height = 132, annotations = [],
}: {
  points: TrendPoint[];
  /** Drawn as a dashed reference line. null = no baseline captured. */
  baseline?: number | null;
  color?: DataColor;
  label: string;
  height?: number;
  /** Events on the timeline — a chart with context is analysis. */
  annotations?: Array<{ x: string; label: string }>;
}) {
  const real = points.filter((p) => p.y !== null) as Array<{ x: string; y: number }>;
  if (real.length < 2) {
    return (
      <div className="flex items-center justify-center text-[length:var(--text-o-body)] text-o-ink-3"
           style={{ height }}>
        Not enough measured periods to draw a trend yet.
      </div>
    );
  }

  const W = 640, PAD_L = 8, PAD_R = 74, PAD_T = 12, PAD_B = 20;
  const ys = real.map((p) => p.y).concat(baseline != null ? [baseline] : []);
  const min = Math.min(...ys), max = Math.max(...ys);
  const span = max - min || 1;
  const pad = span * 0.14;
  const lo = min - pad, hi = max + pad;

  const px = (i: number) => PAD_L + (i / (points.length - 1 || 1)) * (W - PAD_L - PAD_R);
  const py = (v: number) => PAD_T + (1 - (v - lo) / (hi - lo)) * (height - PAD_T - PAD_B);

  const idxOf = (x: string) => points.findIndex((p) => p.x === x);
  const d = real
    .map((p) => `${px(idxOf(p.x))},${py(p.y)}`)
    .map((c, i) => (i === 0 ? `M${c}` : `L${c}`))
    .join(" ");

  const last = real[real.length - 1];
  const lastX = px(idxOf(last.x)), lastY = py(last.y);

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} role="img"
           aria-label={`${label} over time`} className="overflow-visible">
        {/* Baseline as a real reference line, drawn before the series. */}
        {baseline != null && (
          <>
            <line x1={PAD_L} x2={W - PAD_R} y1={py(baseline)} y2={py(baseline)}
                  stroke="var(--color-o-hairline-firm)" strokeWidth={1} strokeDasharray="3 3" />
            <text x={W - PAD_R + 6} y={py(baseline) + 3}
                  fill="var(--color-o-ink-3)" fontSize={10}>baseline</text>
          </>
        )}

        {/* Event annotations — thin verticals with a caption. */}
        {annotations.map((a) => {
          const i = idxOf(a.x);
          if (i < 0) return null;
          return (
            <g key={a.x + a.label}>
              <line x1={px(i)} x2={px(i)} y1={PAD_T} y2={height - PAD_B}
                    stroke="var(--color-o-hairline)" strokeWidth={1} />
              <text x={px(i) + 3} y={PAD_T + 8} fill="var(--color-o-ink-3)" fontSize={9}>
                {a.label}
              </text>
            </g>
          );
        })}

        {/* The series. Thin, no fill — area would imply a magnitude the
            data does not carry. */}
        <path d={d} fill="none" stroke={DATA_COLORS[color]} strokeWidth={1.75}
              strokeLinecap="round" strokeLinejoin="round" className="o-draw-once"
              style={{ ["--o-len" as string]: "1400", strokeDasharray: 1400 }} />
        <circle cx={lastX} cy={lastY} r={3} fill={DATA_COLORS[color]} />

        {/* Direct labelling at the end of the series, in place of a legend. */}
        <text x={lastX + 8} y={lastY - 5} fill={DATA_COLORS[color]} fontSize={11} fontWeight={600}>
          {last.y.toLocaleString("en-US")}
        </text>
        <text x={lastX + 8} y={lastY + 8} fill="var(--color-o-ink-3)" fontSize={9.5}>
          {label}
        </text>

        {/* Period ticks — first and last only. Reading exact values is
            not what this chart is for. */}
        <text x={PAD_L} y={height - 5} fill="var(--color-o-ink-3)" fontSize={9.5}>{points[0].x}</text>
        <text x={W - PAD_R} y={height - 5} textAnchor="end"
              fill="var(--color-o-ink-3)" fontSize={9.5}>{points[points.length - 1].x}</text>
      </svg>
    </figure>
  );
}

/* ------------------------------------------------------------------ *
 * Horizontal bars — ranked comparison, direct-labelled
 * ------------------------------------------------------------------ */

export interface BarDatum { label: string; value: number | null; note?: string }

/**
 * Ranked horizontal bars. Axis starts at zero — for bars it must, or the
 * length of the bar lies about the ratio between values.
 */
export function BarList({
  data, color = "slate", max, valueSuffix, className,
}: {
  data: BarDatum[];
  color?: DataColor;
  max?: number;
  valueSuffix?: string;
  className?: string;
}) {
  const values = data.map((d) => d.value ?? 0);
  const ceiling = max ?? Math.max(...values, 1);
  return (
    <div className={cn("space-y-2", className)}>
      {data.map((d) => {
        const missing = d.value === null;
        const pct = missing ? 0 : Math.max(0, (d.value! / ceiling) * 100);
        return (
          <div key={d.label} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 items-center">
            <div className="min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[length:var(--text-o-body)] text-o-ink truncate">{d.label}</span>
                {d.note && (
                  <span className="text-[length:var(--text-o-label)] text-o-ink-3 shrink-0">{d.note}</span>
                )}
              </div>
              <div className="mt-1 h-[5px] rounded-full bg-o-sunk overflow-hidden">
                <div className="h-full rounded-full"
                     style={{ width: `${pct}%`, background: DATA_COLORS[color] }} />
              </div>
            </div>
            <span className={cn(
              "o-num text-[length:var(--text-o-body)] font-medium tabular-nums w-16 text-right",
              missing ? "text-o-ink-3 font-normal" : "text-o-ink"
            )}>
              {missing ? "—" : d.value!.toLocaleString("en-US")}{!missing && valueSuffix}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Paired bars — one subject against a reference
 * ------------------------------------------------------------------ */

export interface PairedRow {
  label: string;
  subject: number | null;
  reference: number | null;
  /** Formats both values. Bounce rate wants %, duration wants m:ss. */
  format?: (v: number) => string;
  /** For bounce rate, lower is better — flips which side reads as good. */
  lowerIsBetter?: boolean;
}

/**
 * Pinterest traffic against the site average.
 *
 * The strongest argument the agency has, and the reason it is drawn as a
 * pair rather than a single number: "42% engagement" means nothing until
 * you see the site sits at 28%. Direct-labelled, no legend.
 */
export function PairedBars({
  rows, subjectLabel, referenceLabel,
}: {
  rows: PairedRow[];
  subjectLabel: string;
  referenceLabel: string;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-5 text-[length:var(--text-o-label)]">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-[2px]" style={{ background: DATA_COLORS.teal }} />
          <span className="text-o-ink">{subjectLabel}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-[2px]" style={{ background: "var(--color-o-hairline-firm)" }} />
          <span className="text-o-ink-3">{referenceLabel}</span>
        </span>
      </div>

      {rows.map((r) => {
        const missing = r.subject === null || r.reference === null;
        const fmt = r.format ?? ((v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 1 }));
        const ceiling = Math.max(r.subject ?? 0, r.reference ?? 0, 1);
        const better = missing ? null
          : r.lowerIsBetter ? (r.subject! < r.reference!) : (r.subject! > r.reference!);

        return (
          <div key={r.label}>
            <div className="flex items-baseline justify-between gap-3 mb-1.5">
              <span className="text-[length:var(--text-o-body)] text-o-ink">{r.label}</span>
              {better !== null && (
                <span className={cn(
                  "text-[length:var(--text-o-label)] font-medium",
                  better ? "text-o-pos" : "text-o-ink-3"
                )}>
                  {better ? "outperforms site average" : "below site average"}
                </span>
              )}
            </div>
            <div className="space-y-1">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-center">
                <div className="h-[9px] rounded-[2px] bg-o-sunk overflow-hidden">
                  <div className="h-full rounded-[2px]"
                       style={{ width: `${((r.subject ?? 0) / ceiling) * 100}%`, background: DATA_COLORS.teal }} />
                </div>
                <span className={cn("o-num text-[length:var(--text-o-body)] font-semibold w-20 text-right",
                  missing ? "text-o-ink-3" : "text-o-ink")}>
                  {r.subject === null ? "—" : fmt(r.subject)}
                </span>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-center">
                <div className="h-[9px] rounded-[2px] bg-o-sunk overflow-hidden">
                  <div className="h-full rounded-[2px]"
                       style={{ width: `${((r.reference ?? 0) / ceiling) * 100}%`, background: "var(--color-o-hairline-firm)" }} />
                </div>
                <span className="o-num text-[length:var(--text-o-body)] text-o-ink-3 w-20 text-right">
                  {r.reference === null ? "—" : fmt(r.reference)}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Column series — effort under the results line
 * ------------------------------------------------------------------ */

/** Monthly volume as thin columns. Sits under the trend line so the
 *  relationship between effort and results is legible as one picture. */
export function ColumnSeries({
  points, color = "sand", label, height = 54,
}: {
  points: Array<{ x: string; y: number | null }>;
  color?: DataColor;
  label: string;
  height?: number;
}) {
  const vals = points.map((p) => p.y ?? 0);
  const max = Math.max(...vals, 1);
  return (
    <figure>
      <div className="flex items-end gap-[3px]" style={{ height }} role="img" aria-label={label}>
        {points.map((p) => (
          <div key={p.x} className="flex-1 min-w-0" title={`${p.x}: ${p.y ?? "not measured"}`}>
            <div className="rounded-t-[2px] w-full"
                 style={{
                   height: p.y === null ? 2 : Math.max(2, (p.y / max) * height),
                   background: p.y === null ? "var(--color-o-hairline)" : DATA_COLORS[color],
                 }} />
          </div>
        ))}
      </div>
      <figcaption className="mt-1.5 text-[length:var(--text-o-label)] text-o-ink-3">{label}</figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------------ *
 * Coverage meter — a threshold, drawn
 * ------------------------------------------------------------------ */

/** N of a required M, where falling short has a consequence. The
 *  threshold is drawn as a tick so "short" is visible, not inferred. */
export function CoverageMeter({
  value, required, label,
}: {
  value: number;
  required: number;
  label: string;
}) {
  const ok = value >= required;
  const ceiling = Math.max(required, value, 1);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 items-center">
      <div className="min-w-0">
        <span className="text-[length:var(--text-o-body)] text-o-ink truncate block">{label}</span>
        <div className="mt-1 relative h-[5px] rounded-full bg-o-sunk overflow-hidden">
          <div className="h-full rounded-full"
               style={{
                 width: `${(value / ceiling) * 100}%`,
                 background: ok ? DATA_COLORS.teal : DATA_COLORS.clay,
               }} />
          <div className="absolute inset-y-0 w-px bg-o-ink-3"
               style={{ left: `${(required / ceiling) * 100}%` }} />
        </div>
      </div>
      <span className={cn(
        "o-num text-[length:var(--text-o-body)] font-medium tabular-nums w-14 text-right",
        ok ? "text-o-ink" : "text-o-clay"
      )}>
        {value}/{required}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Sparkline — the shape of a number, next to the number
 * ------------------------------------------------------------------ */

/**
 * A figure without its trend is a snapshot; nobody can tell whether 585
 * is a recovery or a collapse. Every KPI tile carries one of these, which
 * is the single biggest difference between a page of counts and a
 * dashboard.
 *
 * Deliberately axis-less and label-less. At this size the shape is the
 * only readable thing, and gridlines would be noise pretending to be
 * precision.
 */
export function Sparkline({
  points, color = "teal", height = 30, showArea = true, className,
}: {
  points: Array<number | null>;
  color?: DataColor;
  height?: number;
  showArea?: boolean;
  className?: string;
}) {
  const real = points.filter((p): p is number => p !== null);
  if (real.length < 2) {
    return (
      <div className={cn("flex items-end", className)} style={{ height }} aria-hidden>
        {/* A flat rule, not an empty box: it holds the slot so a tile with
            no history lines up with one that has it. */}
        <div className="w-full border-b border-dashed border-o-hairline-firm/70" />
      </div>
    );
  }

  const W = 120;
  const min = Math.min(...real), max = Math.max(...real);
  const span = max - min || 1;
  const step = W / (points.length - 1 || 1);
  const y = (v: number) => height - 2 - ((v - min) / span) * (height - 4);

  const coords: string[] = [];
  points.forEach((p, i) => { if (p !== null) coords.push(`${i * step},${y(p)}`); });
  const line = coords.map((c, i) => (i === 0 ? `M${c}` : `L${c}`)).join(" ");
  const area = `${line} L${W},${height} L0,${height} Z`;
  const last = real[real.length - 1];
  const lastIdx = points.length - 1 - [...points].reverse().findIndex((p) => p !== null);
  const id = `sp-${color}-${Math.round(min)}-${Math.round(max)}-${points.length}`;

  return (
    <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} preserveAspectRatio="none"
         className={cn("overflow-visible", className)} aria-hidden>
      {showArea && (
        <>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={DATA_COLORS[color]} stopOpacity="0.20" />
              <stop offset="100%" stopColor={DATA_COLORS[color]} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${id})`} />
        </>
      )}
      <path d={line} fill="none" stroke={DATA_COLORS[color]} strokeWidth={1.75}
            strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={lastIdx * step} cy={y(last)} r={2.25} fill={DATA_COLORS[color]}
              vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/* ------------------------------------------------------------------ *
 * Meter — a share of something, at tile size
 * ------------------------------------------------------------------ */

export function Meter({
  value, max = 100, color = "teal", label,
}: {
  value: number | null; max?: number; color?: DataColor; label?: string;
}) {
  const pct = value === null ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div>
      <div className="h-1.5 rounded-full bg-o-sunk overflow-hidden">
        <div className="h-full rounded-full transition-[width] duration-500"
             style={{ width: `${pct}%`, background: DATA_COLORS[color] }} />
      </div>
      {label && <p className="mt-1.5 text-[length:var(--text-o-label)] text-o-ink-3">{label}</p>}
    </div>
  );
}
