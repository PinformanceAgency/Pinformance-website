/**
 * ORGANIC DESIGN SYSTEM · internal primitives
 *
 * The client report is generous. This is the opposite on purpose: someone
 * holding fifty accounts needs information per screen, not breathing room.
 * Tight rows, tabular figures, no card padding where a border will do.
 *
 * That contrast is itself a design signal — the client view feels
 * considered because it is not built like the tool behind it.
 */
import { cn } from "@/lib/utils";
import { DATA_COLORS } from "./charts";

/* ------------------------------------------------------------------ *
 * Dense table
 * ------------------------------------------------------------------ */

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto rounded-md border border-o-hairline bg-o-surface", className)}>
      <table className="w-full text-[length:var(--text-o-body)] border-collapse">{children}</table>
    </div>
  );
}

export function TH({ children, align = "left", className }: {
  children?: React.ReactNode; align?: "left" | "right" | "center"; className?: string;
}) {
  return (
    <th className={cn(
      "sticky top-0 z-10 bg-o-surface px-3 py-2 font-medium text-o-ink-3 whitespace-nowrap",
      "text-[length:var(--text-o-label)] uppercase tracking-[0.06em] border-b border-o-hairline-firm",
      align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left",
      className
    )}>
      {children}
    </th>
  );
}

export function TD({ children, align = "left", muted, className }: {
  children?: React.ReactNode; align?: "left" | "right" | "center"; muted?: boolean; className?: string;
}) {
  return (
    <td className={cn(
      "px-3 py-1.5 border-b border-o-hairline align-middle",
      muted ? "text-o-ink-3" : "text-o-ink-2",
      align === "right" ? "text-right o-num tabular-nums" : align === "center" ? "text-center" : "",
      className
    )}>
      {children}
    </td>
  );
}

/** Small status chip. Tone carries meaning; there is no decorative variant. */
export function Pill({ children, tone = "neutral" }: {
  children: React.ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad" | "accent";
}) {
  return (
    <span className={cn(
      "inline-flex items-center rounded-sm px-1.5 py-0.5 whitespace-nowrap",
      "text-[length:var(--text-o-label)] font-medium leading-none",
      tone === "good"   && "bg-o-pos/10 text-o-pos",
      tone === "warn"   && "bg-o-sand/20 text-o-clay",
      tone === "bad"    && "bg-o-neg/10 text-o-neg",
      tone === "accent" && "bg-o-accent/10 text-o-accent",
      tone === "neutral" && "bg-o-sunk text-o-ink-3",
    )}>
      {children}
    </span>
  );
}

/** A count with its label, sized for a toolbar rather than a headline. */
export function Metric({ label, value, tone }: {
  label: string; value: number | string | null; tone?: "good" | "warn" | "bad";
}) {
  return (
    <div className="min-w-0">
      <span className="block text-[length:var(--text-o-label)] uppercase tracking-[0.06em] text-o-ink-3">
        {label}
      </span>
      <span className={cn(
        "block o-num text-[length:var(--text-o-figure-md)] font-semibold tabular-nums leading-tight",
        tone === "good" ? "text-o-pos" : tone === "warn" ? "text-o-clay"
          : tone === "bad" ? "text-o-neg" : "text-o-ink"
      )}>
        {value === null ? "—" : value}
      </span>
    </div>
  );
}

/** Row of metrics above a working surface. */
export function Toolbar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start gap-x-10 gap-y-4 rounded-md border border-o-hairline bg-o-surface px-5 py-3.5 mb-5">
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Coverage matrix
 * ------------------------------------------------------------------ */

/**
 * Topics as rows, board count as a filled bar, anything under the
 * threshold in red.
 *
 * The single most useful internal view for spotting where phase 4 will
 * jam: a topic under five boards cannot enter production, so this is the
 * screen that predicts a blockage a fortnight before it happens.
 */
export function CoverageMatrix({
  rows, threshold = 5,
}: {
  rows: Array<{ topic_name: string; active_boards: number; is_covered: boolean }>;
  threshold?: number;
}) {
  if (!rows.length) {
    return (
      <p className="text-[length:var(--text-o-body)] text-o-ink-3">
        No topics defined yet. Topics are set in phase 3, and board coverage is measured against them.
      </p>
    );
  }
  // Scale to the threshold, or to the widest topic when one has outgrown it.
  const ceiling = Math.max(threshold, ...rows.map((r) => r.active_boards));

  return (
    <div className="space-y-1">
      {rows.map((r) => {
        const short = r.active_boards < threshold;
        return (
          <div key={r.topic_name} className="grid grid-cols-[minmax(7rem,13rem)_1fr_3.5rem] items-center gap-3">
            <span className={cn("truncate text-[length:var(--text-o-body)]", short ? "text-o-ink" : "text-o-ink-2")}
                  title={r.topic_name}>
              {r.topic_name}
            </span>
            <div className="relative h-[14px] rounded-[2px] bg-o-sunk overflow-hidden">
              <div className="h-full rounded-[2px]"
                   style={{
                     width: `${(r.active_boards / ceiling) * 100}%`,
                     background: short ? "var(--color-o-neg)" : DATA_COLORS.teal,
                   }} />
              {/* The threshold, drawn. A number in a legend is a footnote;
                  a line the bar has to reach is a target. */}
              <span className="absolute inset-y-0 border-r border-dashed border-o-ink-3/50"
                    style={{ left: `${(threshold / ceiling) * 100}%` }} />
            </div>
            <span className={cn("o-num text-[length:var(--text-o-label)] tabular-nums text-right",
              short ? "text-o-neg font-medium" : "text-o-ink-3")}>
              {r.active_boards}/{threshold}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Volume against usage
 * ------------------------------------------------------------------ */

export interface ScatterPoint { label: string; x: number; y: number | null }

/**
 * Search volume against how often the term was actually deployed.
 *
 * The top-left quadrant — high volume, never used — is the biggest silent
 * waste in the system: reach already paid for in research hours and never
 * put on a pin. It is shaded, because a scatter where you have to work out
 * which corner matters is a chart nobody reads twice.
 */
export function VolumeUsageScatter({
  points, height = 210,
}: {
  points: ScatterPoint[];
  height?: number;
}) {
  const real = points.filter((p) => p.y !== null) as Array<{ label: string; x: number; y: number }>;
  if (real.length < 3) {
    return (
      <p className="text-[length:var(--text-o-body)] text-o-ink-3">
        Not enough volume-validated keywords to plot yet. Terms appear here once their Pinterest volume has been looked up.
      </p>
    );
  }

  const W = 620, PAD_L = 40, PAD_R = 14, PAD_T = 12, PAD_B = 26;
  const maxX = Math.max(...real.map((p) => p.x), 3);
  const maxY = Math.max(...real.map((p) => p.y));

  const px = (v: number) => PAD_L + (v / maxX) * (W - PAD_L - PAD_R);
  const py = (v: number) => PAD_T + (1 - v / maxY) * (height - PAD_T - PAD_B);

  // "High volume" = above the median of measured volume. A fixed number
  // would mean something different for every niche.
  const sorted = real.map((p) => p.y).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const wasted = real.filter((p) => p.x === 0 && p.y >= median);

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} role="img"
           aria-label="Keyword search volume against deployment count">
        {/* The waste quadrant. */}
        <rect x={PAD_L} y={PAD_T} width={px(0.5) - PAD_L} height={py(median) - PAD_T}
              fill="var(--color-o-neg)" opacity={0.06} />
        <text x={PAD_L + 5} y={PAD_T + 11} fontSize={9.5} fill="var(--color-o-neg)">
          validated, never used
        </text>

        {/* Axes — two lines, no grid. */}
        <line x1={PAD_L} x2={PAD_L} y1={PAD_T} y2={height - PAD_B} stroke="var(--color-o-hairline-firm)" />
        <line x1={PAD_L} x2={W - PAD_R} y1={height - PAD_B} y2={height - PAD_B} stroke="var(--color-o-hairline-firm)" />

        {real.map((p, i) => {
          const isWaste = p.x === 0 && p.y >= median;
          return (
            <circle key={`${p.label}-${i}`} cx={px(p.x)} cy={py(p.y)} r={isWaste ? 3.6 : 2.8}
                    fill={isWaste ? "var(--color-o-neg)" : DATA_COLORS.slate}
                    opacity={isWaste ? 0.9 : 0.5}>
              <title>{`${p.label} — volume ${p.y.toLocaleString()}, used on ${p.x} URL${p.x === 1 ? "" : "s"}`}</title>
            </circle>
          );
        })}

        <text x={PAD_L - 6} y={PAD_T + 8} textAnchor="end" fontSize={9.5} fill="var(--color-o-ink-3)">
          {maxY.toLocaleString()}
        </text>
        <text x={PAD_L - 6} y={height - PAD_B} textAnchor="end" fontSize={9.5} fill="var(--color-o-ink-3)">0</text>
        <text x={PAD_L} y={height - 8} fontSize={9.5} fill="var(--color-o-ink-3)">0 URLs</text>
        <text x={W - PAD_R} y={height - 8} textAnchor="end" fontSize={9.5} fill="var(--color-o-ink-3)">
          {maxX} URLs
        </text>
      </svg>
      <figcaption className="mt-2 text-[length:var(--text-o-label)] text-o-ink-3">
        Search volume (vertical) against how many URLs the term is deployed on (horizontal).
        {wasted.length > 0 && (
          <> <span className="text-o-neg font-medium">{wasted.length} above-median term{wasted.length === 1 ? "" : "s"} never deployed.</span></>
        )}
      </figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------------ *
 * Cooldown timeline
 * ------------------------------------------------------------------ */

/**
 * Which URLs are available now, and when the rest come back.
 *
 * The manager plans the next cycle from this view and nowhere else, so it
 * is built around the only question that matters at planning time — what
 * can I run today — rather than around the URL list.
 */
export function CooldownTimeline({
  rows, days = 90, today,
}: {
  rows: Array<{ name: string; next_available_date: string | null; clear: boolean; active: string | null }>;
  days?: number;
  /** Passed in rather than read from the clock, so server and client agree. */
  today: string;
}) {
  if (!rows.length) {
    return (
      <p className="text-[length:var(--text-o-body)] text-o-ink-3">
        No URLs captured yet. They are added in phase 1 and selected for cycles in phase 4.
      </p>
    );
  }

  const t0 = Date.parse(today + "T00:00:00Z");
  const offset = (d: string | null) => {
    if (!d) return 0;
    const n = Math.round((Date.parse(d + "T00:00:00Z") - t0) / 86_400_000);
    return Math.max(0, Math.min(days, n));
  };

  const available = rows.filter((r) => r.clear && !r.active);
  const running = rows.filter((r) => r.active);
  const waiting = rows.filter((r) => !r.clear && !r.active);

  const Group = ({ title, items, tone }: {
    title: string;
    items: typeof rows;
    tone: "good" | "accent" | "neutral";
  }) => items.length === 0 ? null : (
    <div className="mb-5 last:mb-0">
      <div className="flex items-baseline gap-2 mb-1.5">
        <Pill tone={tone}>{items.length}</Pill>
        <span className="text-[length:var(--text-o-label)] uppercase tracking-[0.06em] text-o-ink-3">
          {title}
        </span>
      </div>
      <div className="space-y-0.5">
        {items.map((r, i) => {
          const off = offset(r.next_available_date);
          return (
            <div key={`${r.name}-${i}`}
                 className="grid grid-cols-[minmax(7rem,15rem)_1fr_5rem] items-center gap-3">
              <span className="truncate text-[length:var(--text-o-body)] text-o-ink-2" title={r.name}>
                {r.name}
              </span>
              <div className="relative h-[10px] rounded-[2px] bg-o-sunk">
                {r.active ? (
                  <div className="absolute inset-y-0 left-0 rounded-[2px]"
                       style={{ width: "100%", background: DATA_COLORS.sand, opacity: 0.5 }} />
                ) : off === 0 ? (
                  <div className="absolute inset-y-0 left-0 w-[3px] rounded-[2px]"
                       style={{ background: DATA_COLORS.teal }} />
                ) : (
                  <>
                    <div className="absolute inset-y-0 left-0 rounded-l-[2px] bg-o-hairline"
                         style={{ width: `${(off / days) * 100}%` }} />
                    <div className="absolute inset-y-0 w-[3px]"
                         style={{ left: `${(off / days) * 100}%`, background: DATA_COLORS.teal }} />
                  </>
                )}
              </div>
              <span className="text-[length:var(--text-o-label)] text-o-ink-3 text-right whitespace-nowrap">
                {r.active ? r.active.toLowerCase()
                  : off === 0 ? "now"
                  : `${off}d`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div>
      <Group title="available now" items={available} tone="good" />
      <Group title="in a running cycle" items={running} tone="accent" />
      <Group title="in cooldown" items={waiting} tone="neutral" />
    </div>
  );
}
