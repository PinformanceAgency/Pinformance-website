/**
 * ORGANIC DESIGN SYSTEM · display primitives
 *
 * Everything here is presentation only — no data fetching, no business
 * logic. Server-component safe.
 *
 * The rules these encode, so no screen has to remember them:
 *   · a figure that could not be measured renders as an em dash, never 0
 *   · headline and supporting figures differ dramatically, not slightly
 *   · exactly three ink levels
 *   · the accent appears on a few percent of the screen and never as a fill
 */
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ *
 * Structure
 * ------------------------------------------------------------------ */

/** A titled band. One idea per band; the serif heading is what makes the
 *  page read as a document rather than a grid of widgets. */
export function Band({
  title, sub, right, children, className,
}: {
  title?: string;
  sub?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mb-9", className)}>
      {(title || right) && (
        <header className="flex items-baseline justify-between gap-4 mb-3">
          <div className="min-w-0">
            {title && (
              <h2 className="o-display text-[length:var(--text-o-head)] font-semibold text-o-ink leading-tight">
                {title}
              </h2>
            )}
            {sub && <p className="text-[length:var(--text-o-body)] text-o-ink-2 mt-0.5">{sub}</p>}
          </div>
          {right && <div className="shrink-0">{right}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/** A plain white panel. Hairline border, no shadow — shadows are what
 *  make dashboards look cheap. */
export function Panel({
  children, className, inset = false,
}: {
  children: React.ReactNode;
  className?: string;
  inset?: boolean;
}) {
  return (
    <div className={cn(
      "rounded-lg border border-o-hairline",
      inset ? "bg-o-sunk" : "bg-o-surface",
      className
    )}>
      {children}
    </div>
  );
}

/** Micro-label. Uppercase, tracked, tertiary ink. */
export function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn(
      "block text-[length:var(--text-o-label)] uppercase tracking-[0.08em] text-o-ink-3 font-medium",
      className
    )}>
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Figures
 * ------------------------------------------------------------------ */

export type FigureSize = "xl" | "lg" | "md";

const FIGURE_CLASS: Record<FigureSize, string> = {
  xl: "text-[length:var(--text-o-figure-xl)] leading-[1.02] tracking-[-0.02em]",
  lg: "text-[length:var(--text-o-figure-lg)] leading-[1.05] tracking-[-0.015em]",
  md: "text-[length:var(--text-o-figure-md)] leading-tight tracking-[-0.01em]",
};

/**
 * The one component that decides what a number looks like.
 *
 * `value === null` is missing, not zero — it renders an em dash in
 * tertiary ink with the reason available on hover. This is the visual
 * half of the Stage-0 provenance contract.
 */
export function Figure({
  value, size = "lg", prefix, suffix, reason, className,
}: {
  value: number | string | null;
  size?: FigureSize;
  prefix?: string;
  suffix?: string;
  /** Why the value is missing. Surfaced on hover; never swallowed. */
  reason?: string;
  className?: string;
}) {
  const missing = value === null;

  // A missing value holds the slot but does not shout. An em dash set at
  // headline size reads as a rule across the card rather than an absent
  // number, so missing always renders one step down and in tertiary ink.
  if (missing) {
    return (
      <span
        title={reason}
        className={cn(
          "o-display text-o-ink-3 font-normal leading-none",
          size === "xl" ? "text-[length:var(--text-o-figure-lg)]" : FIGURE_CLASS.md,
          className
        )}
      >
        —
      </span>
    );
  }

  const text = typeof value === "number"
    ? value.toLocaleString("en-US", { maximumFractionDigits: 2 })
    : value;
  return (
    <span className={cn("o-display o-num font-semibold text-o-ink", FIGURE_CLASS[size], className)}>
      {prefix}
      {text}
      {suffix && (
        <span className="text-[0.45em] font-normal text-o-ink-2 ml-1 align-baseline">{suffix}</span>
      )}
    </span>
  );
}

/** Movement against a comparison point. Renders nothing at all when the
 *  comparison is suppressed — an empty badge is worse than no badge. */
export function Movement({
  pct, reason, className,
}: {
  pct: number | null;
  reason?: string;
  className?: string;
}) {
  if (pct === null) return null;
  const dir = pct > 0 ? "pos" : pct < 0 ? "neg" : "flat";
  return (
    <span
      title={reason}
      className={cn(
        "o-num text-[length:var(--text-o-body)] font-medium tabular-nums",
        dir === "pos" && "text-o-pos",
        dir === "neg" && "text-o-neg",
        dir === "flat" && "text-o-ink-3",
        className
      )}
    >
      {pct > 0 ? "▲" : pct < 0 ? "▼" : "—"} {Math.abs(pct)}%
    </span>
  );
}

/** A headline figure with its label and optional movement. The gap
 *  between the figure and the label is the hierarchy. */
export function Stat({
  label, value, size = "lg", prefix, suffix, movement, movementReason, reason, footnote,
}: {
  label: string;
  value: number | string | null;
  size?: FigureSize;
  prefix?: string;
  suffix?: string;
  movement?: number | null;
  movementReason?: string;
  reason?: string;
  footnote?: React.ReactNode;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1.5 flex items-baseline gap-2.5">
        <Figure value={value} size={size} prefix={prefix} suffix={suffix} reason={reason} />
        {movement !== undefined && <Movement pct={movement ?? null} reason={movementReason} />}
      </div>
      {footnote && (
        <div className="mt-1 text-[length:var(--text-o-body)] text-o-ink-3">{footnote}</div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Empty states
 * ------------------------------------------------------------------ */

/**
 * A deliberate empty state. An empty dashboard should still look
 * considered — it says what is missing, why, and what closes it.
 * Never a shrug, never a spinner, never a zero.
 */
export function Empty({
  headline, body, action,
}: {
  headline: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <Panel className="px-6 py-8">
      <div className="max-w-md">
        <p className="o-display text-[length:var(--text-o-figure-md)] text-o-ink leading-snug">
          {headline}
        </p>
        <p className="mt-2 text-[length:var(--text-o-body)] text-o-ink-2 leading-relaxed">{body}</p>
        {action && <div className="mt-4">{action}</div>}
      </div>
    </Panel>
  );
}

/** Text link in the accent. The accent's whole job on this screen. */
export function AccentLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="text-[length:var(--text-o-body)] font-medium text-o-accent hover:underline underline-offset-2"
    >
      {children}
    </a>
  );
}
