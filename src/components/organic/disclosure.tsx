/**
 * Expandable proof. Section E counts what was built and hides the list
 * behind it — the count answers the question, the list proves it.
 *
 * Built on <details> rather than useState for three reasons: it is
 * server-component safe, it is keyboard accessible without any work, and
 * browsers expand every <details> when printing. The client report gets
 * forwarded as a PDF to someone who was not in the meeting, and that PDF
 * has to carry the evidence, not a row of collapsed triangles.
 */
import { cn } from "@/lib/utils";

export function Disclosure({
  summary, count, note, items, columns = 2, emptyNote,
}: {
  summary: string;
  count: number;
  note?: string;
  items: string[];
  columns?: 1 | 2 | 3;
  /** Shown instead of the list when the count is real but we hold no detail. */
  emptyNote?: string;
}) {
  const hasList = items.length > 0;

  return (
    <details className="group border-b border-o-hairline last:border-0 py-4 print:open">
      <summary className={cn(
        "flex items-baseline gap-4 list-none",
        (hasList || emptyNote) ? "cursor-pointer" : "cursor-default"
      )}>
        <span className="o-display o-num text-[length:var(--text-o-figure-md)] font-semibold text-o-ink tabular-nums w-14 shrink-0">
          {count}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[length:var(--text-o-body)] text-o-ink">{summary}</span>
          {note && (
            <span className="block mt-0.5 text-[length:var(--text-o-label)] text-o-ink-3 leading-relaxed">
              {note}
            </span>
          )}
        </span>
        {(hasList || emptyNote) && (
          <span className="shrink-0 text-[length:var(--text-o-label)] text-o-ink-3 group-open:hidden print:hidden">
            show
          </span>
        )}
      </summary>

      {hasList ? (
        <ul className={cn(
          "mt-3 ml-[4.5rem] gap-x-8 gap-y-1",
          columns === 1 ? "" : columns === 2 ? "sm:columns-2" : "sm:columns-3"
        )}>
          {items.map((it, i) => (
            <li key={`${it}-${i}`}
                className="text-[length:var(--text-o-body)] text-o-ink-2 leading-relaxed break-inside-avoid">
              {it}
            </li>
          ))}
        </ul>
      ) : emptyNote ? (
        <p className="mt-3 ml-[4.5rem] text-[length:var(--text-o-body)] text-o-ink-3">{emptyNote}</p>
      ) : null}
    </details>
  );
}
