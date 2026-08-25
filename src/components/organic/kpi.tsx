/**
 * KPI tiles.
 *
 * The gap between this app and a dashboard was never polish — it was that
 * every screen was prose and counts, and a dashboard is figures, deltas
 * and shape. A number on its own is a snapshot: nobody can tell whether
 * 585 clicks is a recovery or a collapse. The trend beside it is what
 * turns it into information.
 *
 * So a tile is always four things where they exist: the figure, what it
 * moved against, the shape it moved in, and the state it was measured in.
 * Where a piece is genuinely unavailable it is absent, not faked — the
 * Stage-0 rule holds here exactly as it does everywhere else.
 */
import { cn } from "@/lib/utils";
import { Sparkline } from "./charts";
import type { DataColor } from "./charts";

export interface KpiProps {
  label: string;
  /** null renders an em dash, never a zero. */
  value: number | string | null;
  prefix?: string;
  suffix?: string;
  /** Percentage movement. null suppresses the badge entirely rather than
   *  printing 0% — no baseline and no change are different facts. */
  delta?: number | null;
  deltaLabel?: string;
  /** History for the sparkline, oldest first. */
  series?: Array<number | null>;
  color?: DataColor;
  /** Why the figure is missing, on hover. */
  reason?: string;
  /** One clause under the tile. */
  foot?: React.ReactNode;
  /** Lower is better — flips the delta colouring, for bounce rate and cost. */
  invert?: boolean;
  href?: string;
}

export function Kpi({
  label, value, prefix, suffix, delta, deltaLabel, series,
  color = "teal", reason, foot, invert,
}: KpiProps) {
  const missing = value === null;
  const good = delta == null ? null : invert ? delta < 0 : delta > 0;

  return (
    <div className="group relative flex flex-col justify-between bg-o-surface px-5 pt-5 pb-4 min-h-[9rem] transition-colors hover:bg-o-sunk/35">
      <div>
        <span className="o-eyebrow">{label}</span>
        <div className="mt-2.5 flex items-baseline gap-2 flex-wrap">
          {missing ? (
            <span className="o-hero-sm text-o-ink-3 font-normal" title={reason}>—</span>
          ) : (
            <span className="o-hero-sm text-o-ink">
              {prefix}
              {typeof value === "number" ? value.toLocaleString("en-US") : value}
              {suffix && <span className="text-[0.42em] font-medium text-o-ink-2 ml-1">{suffix}</span>}
            </span>
          )}
          {delta != null && (
            <span className={cn(
              "inline-flex items-center gap-0.5 rounded-md px-1.5 py-[2px] text-[11px] font-semibold ring-1 ring-inset",
              good ? "bg-o-pos/[0.08] text-o-pos ring-o-pos/20"
                   : "bg-o-neg/[0.08] text-o-neg ring-o-neg/20"
            )}>
              {delta > 0 ? "▲" : delta < 0 ? "▼" : "—"} {Math.abs(delta)}%
            </span>
          )}
        </div>
        {deltaLabel && (
          <p className="mt-1 text-[length:var(--text-o-label)] text-o-ink-3">{deltaLabel}</p>
        )}
      </div>

      <div className="mt-5 -mx-1">
        {series && <Sparkline points={series} color={color} height={34} />}
        {foot && (
          <p className="mt-2 text-[length:var(--text-o-label)] text-o-ink-3 leading-snug">{foot}</p>
        )}
      </div>
    </div>
  );
}

/**
 * A grid of tiles sharing one surface, divided by hairlines rather than
 * each tile floating in its own bordered box. Twelve separate cards on a
 * page is twelve times the chrome and none of the rhythm.
 */
export function KpiGrid({
  children, cols = 4, className,
}: {
  children: React.ReactNode;
  cols?: 2 | 3 | 4 | 5;
  className?: string;
}) {
  return (
    <div className={cn("o-card overflow-hidden", className)}>
      <div className={cn(
        "grid gap-px bg-o-hairline",
        cols === 2 && "sm:grid-cols-2",
        cols === 3 && "sm:grid-cols-2 lg:grid-cols-3",
        cols === 4 && "sm:grid-cols-2 lg:grid-cols-4",
        cols === 5 && "sm:grid-cols-2 lg:grid-cols-5",
      )}>
        {children}
      </div>
    </div>
  );
}

/** A tile on the dark focus surface, for the hero row. */
export function KpiDark({
  label, value, prefix, suffix, delta, series, foot, reason, invert,
}: KpiProps) {
  const missing = value === null;
  const good = delta == null ? null : invert ? delta < 0 : delta > 0;
  return (
    <div className="px-6 py-5">
      <span className="o-eyebrow">{label}</span>
      <div className="mt-2 flex items-baseline gap-2 flex-wrap">
        {missing ? (
          <span className="o-hero-sm text-white/30 font-normal" title={reason}>—</span>
        ) : (
          <span className="o-hero-sm text-white">
            {prefix}
            {typeof value === "number" ? value.toLocaleString("en-US") : value}
            {suffix && <span className="text-[0.42em] font-medium text-white/50 ml-1">{suffix}</span>}
          </span>
        )}
        {delta != null && (
          <span className={cn("text-[11px] font-semibold",
            good ? "text-emerald-400" : "text-red-400")}>
            {delta > 0 ? "▲" : delta < 0 ? "▼" : "—"} {Math.abs(delta)}%
          </span>
        )}
      </div>
      {series && (
        <div className="mt-3.5 opacity-90">
          <Sparkline points={series} color="teal" height={26} />
        </div>
      )}
      {foot && <p className="mt-2 text-[11px] text-white/40 leading-snug">{foot}</p>}
    </div>
  );
}
