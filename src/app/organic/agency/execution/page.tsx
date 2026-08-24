/**
 * AGENCY · Execution — the project manager's screen.
 *
 * Are we delivering what we sold? "Waiting on client" gets its own panel
 * at the top because in most agencies it is the largest single cause of
 * delay and nobody measures it.
 */
import Link from "next/link";
import { loadExecution } from "@/lib/organic/agency";
import { Band, Panel, Empty } from "@/components/organic/primitives";
import { Table, TH, TD, Pill, Metric, Toolbar } from "@/components/organic/internal";
import { DATA_COLORS } from "@/components/organic/charts";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const WAITING_LABEL: Record<string, string> = {
  CLIENT: "the client", ACCESS: "access or credentials", ASSETS: "assets from the brand",
  INTERNAL: "us", THIRD_PARTY: "a third party",
};

export default async function ExecutionPage() {
  const e = await loadExecution();
  const totalWaiting = e.waiting.reduce((n, w) => n + w.tasks, 0);
  const maxWaiting = Math.max(1, ...e.waiting.map((w) => w.tasks));
  const overNorm = e.onboarding.filter((o) => o.over_norm).length;

  return (
    <div>
      <Toolbar>
        <Metric label="Pins published 30d" value={e.pins_30d.published} />
        <Metric label="Committed 30d" value={e.pins_30d.committed} />
        <Metric label="Failed 30d" value={e.pins_30d.failed} tone={e.pins_30d.failed ? "bad" : "good"} />
        <Metric label="Blocked tasks" value={e.blocked_total} tone={e.blocked_total ? "warn" : "good"} />
        <Metric label="Onboardings over norm" value={overNorm} tone={overNorm ? "bad" : "good"} />
      </Toolbar>

      {/* ---- waiting on ------------------------------------------- */}
      <Band title="What we are waiting on"
            sub="Blocked delivery by cause. Set by a manager on the task — nothing here is inferred.">
        <Panel className="px-5 py-5">
          {e.waiting_uncaptured ? (
            <div className="max-w-[44rem]">
              <p className="text-[length:var(--text-o-body)] text-o-ink leading-relaxed">
                Nobody has recorded a cause yet, so this is empty — not because
                delivery is unblocked.
                {e.blocked_total > 0 && (
                  <> There {e.blocked_total === 1 ? "is" : "are"} currently{" "}
                    <span className="text-o-ink font-medium">{e.blocked_total} blocked task
                    {e.blocked_total === 1 ? "" : "s"}</span> across the book, but their
                    reasons are SOP preconditions — which task is in the way, not who we
                    are waiting on.</>
                )}
              </p>
              <p className="mt-2.5 text-[length:var(--text-o-label)] text-o-ink-3 leading-relaxed">
                Set <span className="o-num">waiting_on</span> and{" "}
                <span className="o-num">waiting_since</span> on a task to have it counted
                here. Deliberately manual: an inferred &ldquo;waiting on client&rdquo; would end up
                quoted back to a client in a review, and it needs to be true.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {e.waiting.map((w) => (
                <div key={w.waiting_on}>
                  <div className="flex items-baseline justify-between gap-3 mb-1.5">
                    <span className="text-[length:var(--text-o-body)] text-o-ink">
                      Waiting on {WAITING_LABEL[w.waiting_on] ?? w.waiting_on.toLowerCase()}
                    </span>
                    <span className="text-[length:var(--text-o-label)] text-o-ink-3">
                      {w.tasks} task{w.tasks === 1 ? "" : "s"} · {w.stores} store{w.stores === 1 ? "" : "s"}
                      {w.oldest_days != null && <> · oldest {w.oldest_days}d</>}
                      {w.median_days != null && <> · median {w.median_days}d</>}
                    </span>
                  </div>
                  <div className="h-[11px] rounded-[2px] bg-o-sunk overflow-hidden">
                    <div className="h-full rounded-[2px]"
                         style={{
                           width: `${(w.tasks / maxWaiting) * 100}%`,
                           background: w.waiting_on === "CLIENT" ? DATA_COLORS.clay : DATA_COLORS.slate,
                         }} />
                  </div>
                </div>
              ))}
              <p className="pt-1 text-[length:var(--text-o-label)] text-o-ink-3">
                {totalWaiting} task{totalWaiting === 1 ? "" : "s"} with a recorded cause.
              </p>
            </div>
          )}
        </Panel>
      </Band>

      {/* ---- onboardings in flight -------------------------------- */}
      <Band title="Onboardings in progress"
            sub="Days elapsed against the one-month norm from the SOP.">
        {e.onboarding.length === 0 ? (
          <Panel className="px-5 py-4">
            <p className="text-[length:var(--text-o-body)] text-o-ink-3">
              No store is mid-onboarding.
            </p>
          </Panel>
        ) : (
          <Table>
            <thead>
              <tr>
                <TH>Store</TH><TH>Started</TH><TH align="right">Days</TH>
                <TH align="right">Phase 1–3</TH><TH align="right">Blocked</TH><TH>Against norm</TH>
              </tr>
            </thead>
            <tbody>
              {e.onboarding.map((o) => (
                <tr key={o.org_id} className="hover:bg-o-sunk/50">
                  <TD>
                    <Link href={`/client/${o.org_id}`} className="text-o-ink hover:underline underline-offset-2">
                      {o.name}
                    </Link>
                  </TD>
                  <TD muted={!o.started}>{o.started ?? "no date recorded"}</TD>
                  <TD align="right">
                    {o.days_elapsed == null
                      ? <span className="text-o-ink-3" title="No onboarding date recorded">—</span>
                      : <span className={cn(o.over_norm && "text-o-neg font-semibold")}>{o.days_elapsed}</span>}
                  </TD>
                  <TD align="right">{o.pct_done}%</TD>
                  <TD align="right">
                    <span className={cn(o.blocked_tasks > 0 && "text-o-clay")}>{o.blocked_tasks}</span>
                  </TD>
                  <TD>
                    {o.days_elapsed == null ? <span className="text-o-ink-3">—</span>
                      : o.over_norm ? <Pill tone="bad">over</Pill>
                      : <Pill tone="good">within</Pill>}
                  </TD>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Band>

      {/* ---- cycles behind ---------------------------------------- */}
      <Band title="Cycles behind schedule"
            sub="A waterfall open more than 20 days has stalled somewhere.">
        {e.cycles_behind.length === 0 ? (
          <Panel className="px-5 py-4">
            <p className="text-[length:var(--text-o-body)] text-o-ink-3">
              No cycle is running late.
            </p>
          </Panel>
        ) : (
          <Table>
            <thead>
              <tr><TH>Store</TH><TH>URL</TH><TH>Status</TH><TH align="right">Days open</TH></tr>
            </thead>
            <tbody>
              {e.cycles_behind.map((c, i) => (
                <tr key={`${c.org_name}-${i}`} className="hover:bg-o-sunk/50">
                  <TD>{c.org_name}</TD>
                  <TD muted={!c.url_name}>{c.url_name ?? "—"}</TD>
                  <TD><Pill tone="warn">{c.status.toLowerCase()}</Pill></TD>
                  <TD align="right"><span className="text-o-neg font-semibold">{c.days_open}</span></TD>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Band>

      {/* ---- throughput ------------------------------------------- */}
      <Band title="Team throughput"
            sub="Tasks completed per person per week, last eight weeks.">
        {e.throughput.length === 0 ? (
          <Empty
            headline="No completed tasks in the last eight weeks."
            body="Throughput is counted from tasks marked done, so it fills in as delivery starts. It measures completion rather than hours, because hours recorded and work shipped are different questions."
          />
        ) : (
          <Table>
            <thead>
              <tr><TH>Week of</TH><TH>Person</TH><TH align="right">Tasks done</TH><TH align="right">Hours</TH></tr>
            </thead>
            <tbody>
              {e.throughput.map((t, i) => (
                <tr key={`${t.person}-${t.week}-${i}`} className="hover:bg-o-sunk/50">
                  <TD muted>{t.week}</TD>
                  <TD>{t.person}</TD>
                  <TD align="right">{t.tasks_done}</TD>
                  <TD align="right">
                    {t.minutes > 0
                      ? Math.round((t.minutes / 60) * 10) / 10
                      : <span className="text-o-ink-3" title="No time recorded on these tasks">—</span>}
                  </TD>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Band>
    </div>
  );
}
