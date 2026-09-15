/**
 * THE PUBLISHING CALENDAR — the month, with the artwork on it.
 *
 * The question it answers is the one the app could not: on which day does
 * which creative go out, onto which board, and will it actually go out.
 * Everything else here serves the second half of that — a month somebody
 * has read once and found sound should not have to be read again, so the
 * analysis states what stands between this store and a finished month
 * rather than leaving it to be spotted cell by cell.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadClientHeader } from "@/lib/organic/queries";
import { loadPublishCalendar } from "@/lib/organic/calendar";
import { Band, Panel, Empty, AccentLink } from "@/components/organic/primitives";
import { Metric, Toolbar, Pill } from "@/components/organic/internal";
import { PublishCalendarView } from "@/components/organic/PublishCalendarView";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function CalendarPage({
  params, searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { orgId } = await params;
  const { month } = await searchParams;
  const [header, cal] = await Promise.all([
    loadClientHeader(orgId),
    loadPublishCalendar(orgId, month),
  ]);
  if (!header) notFound();

  const blocking = cal.issues.filter((i) => i.severity === "blocking");
  const watching = cal.issues.filter((i) => i.severity === "watch");
  const hasAnyPins = cal.months_with_pins.length > 0;

  return (
    <div>
      <header className="mb-8">
        <span className="o-eyebrow">Store</span>
        <h1 className="o-h1 mt-2 text-o-ink">Publishing calendar</h1>
        <p className="mt-2 max-w-2xl text-[length:var(--text-o-body)] leading-relaxed text-o-ink-2">
          Every pin this store has a date for, on the day it goes out, with the creative and the
          board it lands on. A date on its own is not a queue — what is drawn here is what the
          publishing cron will actually do.
        </p>
      </header>

      {!hasAnyPins ? (
        <Empty
          headline="No pin has a date yet."
          body="A cycle plans sixteen pins across several weeks; until one has been generated there is nothing to put on a calendar."
          action={<AccentLink href={`/client/${orgId}/phase/4`}>Open phase 4</AccentLink>}
        />
      ) : (
        <>
          <Toolbar>
            <Metric label={`Pins in ${cal.month_label}`} value={cal.totals.pins}
                    hint={cal.totals.days_with_pins > 0 ? `across ${cal.totals.days_with_pins} days` : undefined} />
            <Metric label="Live" value={cal.totals.published} tone={cal.totals.published > 0 ? "good" : undefined} />
            <Metric label="Will publish" value={cal.totals.will_publish} />
            <Metric label="Blocked" value={cal.totals.blocked}
                    tone={cal.totals.blocked > 0 ? "bad" : "good"} />
            <Metric label="Daily cap" value={`${cal.daily_target}/day`}
                    hint="what the cron will hand out" />
            <Metric label="Next pin out" value={cal.next_publish ?? null}
                    hint={cal.last_published ? `last went out ${cal.last_published.slice(0, 10)}` : "nothing has gone out yet"} />
          </Toolbar>

          {/* ---- the one fact that overrides the whole grid ---------- */}
          {cal.standstill && (
            <div className="o-section">
              <Panel className="border-l-[3px] border-l-o-neg px-6 py-5">
                <div className="flex flex-wrap items-baseline gap-3">
                  <Pill tone="bad">nothing is queued</Pill>
                  <span className="o-h3 text-o-ink">This store is not publishing.</span>
                </div>
                <p className="mt-2 max-w-3xl text-[length:var(--text-o-body)] leading-relaxed text-o-ink-2">
                  {cal.standstill}
                </p>
                <div className="mt-4">
                  <AccentLink href={`/client/${orgId}/phase/4`}>Open the cycle · P4.3.2</AccentLink>
                </div>
              </Panel>
            </div>
          )}

          {/* ---- the month read as a whole --------------------------- */}
          <Band
            title="Is this month sound?"
            sub="Grouped by cause, not by pin. An empty list here means the month runs by itself."
            right={
              <span className="o-num text-[length:var(--text-o-body)] text-o-ink-2">
                {blocking.length > 0
                  ? `${blocking.length} blocking`
                  : watching.length > 0 ? `${watching.length} to watch` : "clear"}
              </span>
            }
          >
            {cal.issues.length === 0 ? (
              <Panel className="border-l-[3px] border-l-o-pos px-6 py-5">
                <p className="text-[length:var(--text-o-body)] text-o-ink">
                  Nothing stands in the way of {cal.month_label}.
                </p>
                <p className="mt-1 max-w-3xl text-[length:var(--text-o-body)] leading-relaxed text-o-ink-2">
                  Every pin with a date this month is queued, carries its artwork and its copy, and
                  points at a board that exists on Pinterest. No day is planned above the {cal.daily_target}/day
                  cap. This month does not need checking again unless the plan changes.
                </p>
              </Panel>
            ) : (
              <Panel>
                <ul className="divide-y divide-o-hairline">
                  {[...blocking, ...watching].map((i) => (
                    <li key={i.kind} className="px-5 py-4">
                      <div className="flex items-start justify-between gap-5">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2.5">
                            <span aria-hidden className={cn(
                              "mt-[3px] h-3.5 w-1 shrink-0 self-start rounded-full",
                              i.severity === "blocking" ? "bg-o-neg" : "bg-o-clay"
                            )} />
                            <span className="text-[length:var(--text-o-body)] font-medium text-o-ink">
                              {i.headline}
                            </span>
                          </div>
                          <p className="ml-[14px] mt-1 max-w-3xl text-[length:var(--text-o-body)] leading-relaxed text-o-ink-2">
                            {i.detail}
                          </p>
                        </div>
                        {i.fix_href && (
                          <div className="shrink-0 text-right">
                            <AccentLink href={`/client/${orgId}/${i.fix_href}`}>Fix</AccentLink>
                            {i.fix_task && (
                              <div className="o-num mt-0.5 text-[length:var(--text-o-label)] text-o-ink-3">
                                {i.fix_task}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
          </Band>

          {/* ---- the grid -------------------------------------------- */}
          <Band
            title={cal.month_label}
            sub={`Every other day is normal: ${header.spacing_hours ?? 48}-hour spacing on the same URL is the method's rule, so sixteen pins occupy a month.`}
            right={
              cal.months_with_pins.length > 1 ? (
                <div className="flex flex-wrap gap-2">
                  {cal.months_with_pins.map((m) => (
                    <Link key={m} href={`/client/${orgId}/calendar?month=${m}`}
                          className={cn(
                            "o-num rounded-md px-2 py-1 text-[length:var(--text-o-label)]",
                            m === cal.month
                              ? "bg-o-accent/[0.08] text-o-accent ring-1 ring-inset ring-o-accent/25"
                              : "text-o-ink-3 hover:bg-o-sunk hover:text-o-ink-2"
                          )}>
                      {m}
                    </Link>
                  ))}
                </div>
              ) : undefined
            }
          >
            <PublishCalendarView cal={cal} />
          </Band>
        </>
      )}
    </div>
  );
}
