/**
 * AGENCY · Capacity and margin.
 *
 * The brief calls this the most valuable screen in the system, and nearly
 * free because time_spent_min is already mandatory on every task. That
 * "already mandatory" is doing a lot of work, so the coverage figure sits
 * at the top: every number below it is only as good as the share of tasks
 * that carry a time entry, and saying so is the difference between a
 * margin figure and a guess.
 */
import Link from "next/link";
import { loadPortfolio, loadMargin } from "@/lib/organic/agency";
import { Band, Panel, Label, Figure, Empty } from "@/components/organic/primitives";
import { Table, TH, TD, Metric, Toolbar } from "@/components/organic/internal";
import { BarList } from "@/components/organic/charts";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const hours = (min: number) => Math.round((min / 60) * 10) / 10;
const money = (v: number, ccy: string) =>
  `${ccy === "EUR" ? "€" : ccy === "GBP" ? "£" : ccy === "USD" ? "$" : ccy + " "}${
    Math.round(v).toLocaleString("en-US")}`;

export default async function MarginPage() {
  const [rows, m] = await Promise.all([loadPortfolio(), loadMargin()]);

  const coverage = m.tasks_total > 0 ? Math.round((m.tasks_timed / m.tasks_total) * 100) : null;
  const priced = rows.filter((r) => r.monthly_retainer != null);

  // Per-store margin, only where every input exists. A partially-known row
  // is left partial rather than filled with assumptions — the whole point
  // of this screen is deciding which stores are underpriced, and a guessed
  // input would make that decision on invented evidence.
  const perStore = rows.map((r) => {
    const h = r.minutes_logged / 60;
    const cost = r.hourly_cost != null ? h * r.hourly_cost : null;
    const months = r.tenure_months != null ? Math.max(1, r.tenure_months) : null;
    const revenue = r.monthly_retainer != null && months != null ? r.monthly_retainer * months : null;
    return {
      ...r,
      hours: h,
      cost,
      margin: revenue != null && cost != null ? revenue - cost : null,
      hours_per_1k: r.monthly_retainer != null && r.monthly_retainer > 0 && months != null
        ? Math.round((h / months / (r.monthly_retainer / 1000)) * 10) / 10
        : null,
    };
  }).sort((a, b) => (a.margin ?? Infinity) - (b.margin ?? Infinity));

  return (
    <div>
      <Toolbar>
        <Metric label="Hours logged" value={m.minutes_total > 0 ? hours(m.minutes_total) : null} />
        <Metric label="Time coverage" value={coverage != null ? `${coverage}%` : null}
                tone={coverage == null ? undefined : coverage >= 80 ? "good" : coverage >= 40 ? "warn" : "bad"} />
        <Metric label="Stores priced" value={`${priced.length}/${rows.length}`}
                tone={priced.length === rows.length ? "good" : "warn"} />
        <Metric label="Retainer known" value={m.retainer_known_total > 0
          ? money(m.retainer_known_total, m.currency) : null} />
      </Toolbar>

      {coverage != null && coverage < 40 && (
        <Panel inset className="px-5 py-4 mb-8">
          <p className="text-[length:var(--text-o-body)] text-o-ink leading-relaxed max-w-[46rem]">
            Only {coverage}% of tasks carry a time entry, so every hours figure below is a
            floor rather than a total. Margin is not computed for a store until its
            retainer, onboarding date and hourly cost all exist — the gaps are shown as
            dashes rather than filled in.
          </p>
        </Panel>
      )}

      {/* ---- where the hours go ------------------------------------ */}
      <div className="grid md:grid-cols-2 gap-5 mb-9">
        <Panel className="px-5 py-5">
          <Label>Hours by phase</Label>
          <p className="mt-1 mb-4 text-[length:var(--text-o-label)] text-o-ink-3 leading-relaxed">
            What onboarding really costs against monthly management — the split that
            lets the Strategy Core be priced separately.
          </p>
          {m.minutes_total === 0 ? (
            <p className="text-[length:var(--text-o-body)] text-o-ink-3">
              No time recorded yet.
            </p>
          ) : (
            <BarList color="teal"
              data={m.by_phase.map((b) => ({
                label: b.label, value: hours(b.minutes),
                note: `${b.tasks} task${b.tasks === 1 ? "" : "s"} timed`,
              }))} />
          )}
        </Panel>

        <Panel className="px-5 py-5">
          <Label>Hours by task type</Label>
          <p className="mt-1 mb-4 text-[length:var(--text-o-label)] text-o-ink-3 leading-relaxed">
            Where the time actually goes, which is what tells you what to automate
            next — evidence rather than intuition.
          </p>
          {m.minutes_total === 0 ? (
            <p className="text-[length:var(--text-o-body)] text-o-ink-3">
              No time recorded yet.
            </p>
          ) : (
            <BarList color="sand"
              data={m.by_task_type.map((b) => ({
                label: b.label.toLowerCase().replace(/_/g, " "), value: hours(b.minutes),
                note: `${b.tasks} task${b.tasks === 1 ? "" : "s"} timed`,
              }))} />
          )}
        </Panel>
      </div>

      {/* ---- per store --------------------------------------------- */}
      <Band title="Margin per store"
            sub="Sorted worst first. A store below the line is either underpriced or badly run, and the difference matters.">
        {rows.length === 0 ? (
          <Empty headline="No stores activated." body="Activate a store to start recording delivery hours against it." />
        ) : (
          <Table>
            <thead>
              <tr>
                <TH>Store</TH><TH align="right">Month</TH><TH align="right">Hours</TH>
                <TH align="right">Retainer</TH><TH align="right">Cost</TH>
                <TH align="right">Margin</TH><TH align="right">h / 1k / mo</TH>
              </tr>
            </thead>
            <tbody>
              {perStore.map((r) => (
                <tr key={r.org_id} className="hover:bg-o-sunk/50">
                  <TD>
                    <Link href={`/client/${r.org_id}`} className="text-o-ink hover:underline underline-offset-2">
                      {r.name}
                    </Link>
                  </TD>
                  <TD align="right" muted>{r.tenure_months ?? "—"}</TD>
                  <TD align="right">
                    {r.hours > 0 ? Math.round(r.hours * 10) / 10
                      : <span className="text-o-ink-3" title="No time recorded">—</span>}
                  </TD>
                  <TD align="right">
                    {r.monthly_retainer != null
                      ? money(r.monthly_retainer, r.retainer_currency)
                      : <span className="text-o-ink-3" title="No retainer recorded — not zero">—</span>}
                  </TD>
                  <TD align="right">
                    {r.cost != null ? money(r.cost, r.retainer_currency)
                      : <span className="text-o-ink-3" title="Needs an hourly cost rate">—</span>}
                  </TD>
                  <TD align="right">
                    {r.margin == null
                      ? <span className="text-o-ink-3" title="Needs retainer, onboarding date and hourly cost">—</span>
                      : <span className={cn(r.margin < 0 ? "text-o-neg font-semibold" : "text-o-pos")}>
                          {money(r.margin, r.retainer_currency)}
                        </span>}
                  </TD>
                  <TD align="right">
                    {r.hours_per_1k == null
                      ? <span className="text-o-ink-3">—</span>
                      : r.hours_per_1k}
                  </TD>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Band>

      {/* ---- capacity ---------------------------------------------- */}
      <Band title="Capacity"
            sub="How many more stores we can take, as a number rather than a feeling.">
        <Panel className="px-6 py-6">
          {m.minutes_total === 0 || priced.length === 0 ? (
            <div className="max-w-[46rem]">
              <p className="text-[length:var(--text-o-body)] text-o-ink leading-relaxed">
                Capacity needs two things this book does not have yet: recorded delivery
                hours, and a retainer on at least one store.
              </p>
              <p className="mt-2 text-[length:var(--text-o-body)] text-o-ink-2 leading-relaxed">
                Once both exist, the forecast is mechanical — mean hours per store per
                month against hours available. Until then it is left blank, because a
                capacity number derived from no measured hours is exactly the kind of
                figure that gets someone to sign a contract we cannot deliver.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-6">
              <div>
                <Label>Mean hours per store / month</Label>
                <div className="mt-1.5">
                  <Figure size="md"
                    value={(() => {
                      const withTime = perStore.filter((r) => r.hours > 0 && r.tenure_months != null);
                      if (!withTime.length) return null;
                      const per = withTime.map((r) => r.hours / Math.max(1, r.tenure_months!));
                      return Math.round((per.reduce((a, b) => a + b, 0) / per.length) * 10) / 10;
                    })()} />
                </div>
              </div>
              <div>
                <Label>Stores with time recorded</Label>
                <div className="mt-1.5">
                  <Figure size="md" value={perStore.filter((r) => r.hours > 0).length} />
                </div>
              </div>
              <div>
                <Label>Stores priced</Label>
                <div className="mt-1.5"><Figure size="md" value={priced.length} /></div>
              </div>
              <div>
                <Label>Retainer under management</Label>
                <div className="mt-1.5">
                  <Figure size="md" value={money(m.retainer_known_total, m.currency)} />
                </div>
                {m.retainer_unknown_stores > 0 && (
                  <p className="mt-1 text-[length:var(--text-o-label)] text-o-ink-3">
                    {m.retainer_unknown_stores} store{m.retainer_unknown_stores === 1 ? "" : "s"} unpriced,
                    excluded rather than counted as zero
                  </p>
                )}
              </div>
            </div>
          )}
        </Panel>
      </Band>
    </div>
  );
}
