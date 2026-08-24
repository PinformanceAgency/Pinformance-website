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

export const DATA_COLORS = {
  teal:  "var(--color-o-teal)",
  sand:  "var(--color-o-sand)",
  clay:  "var(--color-o-clay)",
  slate: "var(--color-o-slate)",
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
export function SegmentedScore({ segments, height = 10 }: { segments: Segment[]; height?: number }) {
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
              className="relative rounded-[2px] overflow-hidden bg-o-sunk"
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
                    backgroundImage:
                      "repeating-linear-gradient(45deg, var(--color-o-hairline-firm) 0 2px, transparent 2px 5px)",
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
            <div className="text-[length:var(--text-o-label)] text-o-ink-2 truncate">{s.label}</div>
            <div className="o-num text-[length:var(--text-o-body)] font-medium text-o-ink">
              {s.score === null
                ? <span className="text-o-ink-3 font-normal">—</span>
                : Math.round(s.score)}
              <span className="text-o-ink-3 font-normal ml-1">
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
