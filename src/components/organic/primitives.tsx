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

/** A titled band. One idea per band. The heading sits on a short accent
 *  rule rather than floating — it is what gives a long page a spine to
 *  scan down instead of a stack of equally-weighted blocks. */
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
    <section className={cn("mb-10", className)}>
      {(title || right) && (
        <header className="flex items-baseline justify-between gap-4 mb-4">
          <div className="min-w-0 flex items-baseline gap-3">
            {title && (
              <>
                <span aria-hidden className="mt-[0.45rem] h-3.5 w-[3px] rounded-full bg-o-accent shrink-0 self-start" />
                <div className="min-w-0">
                  <h2 className="o-h2 text-o-ink">{title}</h2>
                  {sub && (
                    <p className="mt-1 text-[length:var(--text-o-body)] text-o-ink-2 leading-relaxed max-w-3xl">
                      {sub}
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
          {right && <div className="shrink-0">{right}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/**
 * A surface.
 *
 * This used to be a bare 1px rectangle, on the theory that shadows make a
 * dashboard look cheap. Heavy shadows do; none at all just reads as a
 * wireframe. It now carries the two-layer elevation from the surface
 * system — a tight contact shadow plus a wider ambient one, each almost
 * invisible alone.
 */
export function Panel({
  children, className, inset = false, raised = false,
}: {
  children: React.ReactNode;
  className?: string;
  /** Sits *into* the page rather than on it — for wells and asides. */
  inset?: boolean;
  /** One step further off the page, for things that float above content. */
  raised?: boolean;
}) {
  return (
    <div className={cn(
      inset ? "rounded-[10px] border border-o-hairline bg-o-sunk" : "o-card",
      raised && "o-card-raised",
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
      "o-eyebrow block",
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
    <span className={cn("o-figure text-o-ink", FIGURE_CLASS[size], className)}>
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
    // A dashed inner rule rather than a solid card. An empty state that
    // looks identical to a populated one reads as a loading failure; the
    // dashed edge says "nothing here yet" before the words do.
    <div className="rounded-[10px] border border-dashed border-o-hairline-firm bg-o-sunk/40 px-7 py-9">
      <div className="max-w-xl">
        <p className="o-h3 text-o-ink">{headline}</p>
        <p className="mt-2 text-[length:var(--text-o-body)] text-o-ink-2 leading-relaxed">{body}</p>
        {action && <div className="mt-5">{action}</div>}
      </div>
    </div>
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
