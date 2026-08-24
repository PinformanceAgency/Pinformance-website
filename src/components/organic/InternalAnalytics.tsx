/**
 * STAGE 3d · the internal half of store analytics.
 *
 * Everything on this surface is deliberately not on the client report:
 * what the store costs, whether what we plan actually ships, how much of
 * our own AI output survives review, and what this store gave the rest of
 * the portfolio.
 */
import type { StoreCost, CycleEfficiency, DraftEditStat, CacheContribution } from "@/lib/organic/internal-analytics";
import { Band, Panel, Label, Figure } from "./primitives";
import { Table, TH, TD, Pill, Metric, Toolbar } from "./internal";
import { cn } from "@/lib/utils";

const money = (v: number, ccy: string) =>
  `${ccy === "EUR" ? "€" : ccy === "GBP" ? "£" : ccy === "USD" ? "$" : ccy + " "}${
    Math.round(v).toLocaleString("en-US")}`;

const hoursOf = (min: number) => Math.round((min / 60) * 10) / 10;

export function InternalAnalytics({
  cost, cycles, drafts, cache,
}: {
  cost: StoreCost;
  cycles: CycleEfficiency[];
  drafts: DraftEditStat[];
  cache: CacheContribution;
}) {
  return (
    <div>
      {/* ---- cost and margin --------------------------------------- */}
      <Band title="Cost and margin"
            sub="Hours logged against what the store pays. Internal only.">
        <Panel className="px-6 py-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-7">
            <div>
              <Label>Hours logged</Label>
              <div className="mt-1.5">
                <Figure value={cost.minutes_logged > 0 ? hoursOf(cost.minutes_logged) : null} size="md"
                        reason="No time has been recorded against this store's tasks" />
              </div>
              <p className="mt-1 text-[length:var(--text-o-label)] text-o-ink-3">
                {cost.tasks_timed} of {cost.tasks_total} tasks timed
              </p>
            </div>

            <div>
              <Label>Monthly retainer</Label>
              <div className="mt-1.5">
                <Figure
                  value={cost.monthly_retainer != null
                    ? money(cost.monthly_retainer, cost.retainer_currency) : null}
                  size="md"
                  reason="No retainer recorded for this store — set it in store settings" />
              </div>
              {cost.months_active != null && (
                <p className="mt-1 text-[length:var(--text-o-label)] text-o-ink-3">
                  month {cost.months_active}
                </p>
              )}
            </div>

            <div>
              <Label>Delivery cost</Label>
              <div className="mt-1.5">
                <Figure
                  value={cost.cost_to_date != null
                    ? money(cost.cost_to_date, cost.retainer_currency) : null}
                  size="md"
                  reason="Needs both logged hours and an hourly cost rate" />
              </div>
            </div>

            <div>
              <Label>Margin to date</Label>
              <div className="mt-1.5">
                <span className={cn(
                  cost.margin_to_date != null && cost.margin_to_date < 0 && "text-o-neg"
                )}>
                  <Figure
                    value={cost.margin_to_date != null
                      ? money(cost.margin_to_date, cost.retainer_currency) : null}
                    size="md"
                    reason="Needs retainer, onboarding date and an hourly cost rate" />
                </span>
              </div>
              {cost.hours_per_1k_month != null && (
                <p className="mt-1 text-[length:var(--text-o-label)] text-o-ink-3">
                  {cost.hours_per_1k_month}h per {money(1000, cost.retainer_currency)}/month
                </p>
              )}
            </div>
          </div>

          {cost.monthly_retainer == null && (
            <p className="mt-5 pt-4 border-t border-o-hairline text-[length:var(--text-o-label)] text-o-ink-3">
              Margin cannot be computed without a retainer. It is left blank rather than
              shown as zero — a store nobody has priced is not a store on nothing.
            </p>
          )}
        </Panel>
      </Band>

      {/* ---- cycle efficiency -------------------------------------- */}
      <Band title="Cycle efficiency"
            sub="Pins published against pins attempted. Cancelled pins are excluded — pulling one is a decision, not a failure.">
        {cycles.length === 0 ? (
          <Panel className="px-5 py-4">
            <p className="text-[length:var(--text-o-body)] text-o-ink-3">
              No waterfalls have run yet.
            </p>
          </Panel>
        ) : (
          <Table>
            <thead>
              <tr>
                <TH>URL</TH><TH>Started</TH><TH>Status</TH>
                <TH align="right">Published</TH><TH align="right">Planned</TH>
                <TH align="right">Failed</TH><TH align="right">Cancelled</TH>
                <TH align="right">Efficiency</TH>
              </tr>
            </thead>
            <tbody>
              {cycles.map((c) => (
                <tr key={c.waterfall_id} className="hover:bg-o-sunk/50">
                  <TD>{c.url_name ?? <span className="text-o-ink-3">(url removed)</span>}</TD>
                  <TD muted>{c.start_date ?? "—"}</TD>
                  <TD><Pill tone={c.status === "COMPLETED" ? "good" : c.status === "ABANDONED" ? "bad" : "neutral"}>
                    {c.status.toLowerCase()}
                  </Pill></TD>
                  <TD align="right">{c.published}</TD>
                  <TD align="right">{c.planned}</TD>
                  <TD align="right">
                    <span className={cn(c.failed > 0 && "text-o-neg font-semibold")}>{c.failed}</span>
                  </TD>
                  <TD align="right" muted>{c.cancelled}</TD>
                  <TD align="right">
                    {c.efficiency_pct == null
                      ? <span className="text-o-ink-3" title="No pins generated for this cycle yet">—</span>
                      : <span className={cn(
                          c.efficiency_pct >= 90 ? "text-o-pos font-semibold"
                          : c.efficiency_pct < 60 ? "text-o-neg font-semibold" : "")}>
                          {c.efficiency_pct}%
                        </span>}
                  </TD>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Band>

      {/* ---- AI draft edit distance -------------------------------- */}
      <Band title="AI draft survival"
            sub="How much of each generated draft reaches the client unchanged. A surface that is routinely rewritten is a prompt problem, not a manager problem.">
        {drafts.length === 0 ? (
          <Panel className="px-5 py-4">
            <p className="text-[length:var(--text-o-body)] text-o-ink-3">
              No AI drafts have been generated for this store yet.
            </p>
          </Panel>
        ) : (
          <Table>
            <thead>
              <tr>
                <TH>Surface</TH><TH align="right">Drafts</TH><TH align="right">Approved</TH>
                <TH align="right">Kept</TH><TH align="right">Untouched</TH><TH align="right">Rewritten</TH>
              </tr>
            </thead>
            <tbody>
              {drafts.map((d) => (
                <tr key={d.kind} className="hover:bg-o-sunk/50">
                  <TD>{d.kind.toLowerCase().replace(/_/g, " ")}</TD>
                  <TD align="right">{d.drafts}</TD>
                  <TD align="right">{d.approved}</TD>
                  <TD align="right">
                    {d.kept_pct == null
                      ? <span className="text-o-ink-3" title="Nothing of this kind approved yet">—</span>
                      : <span className={cn(
                          d.kept_pct >= 80 ? "text-o-pos font-semibold"
                          : d.kept_pct < 50 ? "text-o-neg font-semibold" : "")}>
                          {d.kept_pct}%
                        </span>}
                  </TD>
                  <TD align="right" muted>{d.untouched}</TD>
                  <TD align="right">
                    <span className={cn(d.rewritten > 0 && "text-o-neg font-semibold")}>{d.rewritten}</span>
                  </TD>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Band>

      {/* ---- cache contribution ------------------------------------ */}
      <Band title="Cache contribution"
            sub="Volume lookups this store paid for, and what the rest of the portfolio got from them.">
        <Toolbar>
          <Metric label="Looked up here" value={cache.looked_up} />
          <Metric label="Reused by other stores" value={cache.reused_by_others}
                  tone={cache.reused_by_others > 0 ? "good" : undefined} />
          <Metric label="Received from others" value={cache.received} />
          <Metric label="Net given"
                  value={cache.net > 0 ? `+${cache.net}` : String(cache.net)}
                  tone={cache.net > 0 ? "good" : cache.net < 0 ? "warn" : undefined} />
        </Toolbar>
        {cache.top_shared.length > 0 && (
          <Table>
            <thead>
              <tr><TH>Term</TH><TH align="right">Volume</TH><TH align="right">Stores reusing</TH></tr>
            </thead>
            <tbody>
              {cache.top_shared.map((t) => (
                <tr key={t.term} className="hover:bg-o-sunk/50">
                  <TD>{t.term}</TD>
                  <TD align="right">{t.volume?.toLocaleString("en-US") ?? "—"}</TD>
                  <TD align="right">{t.orgs}</TD>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Band>
    </div>
  );
}
