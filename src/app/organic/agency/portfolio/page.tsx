/**
 * AGENCY · Portfolio.
 *
 * Every store, grouped by cohort. The grouping is the point: comparing a
 * month-two store against a month-fourteen store produces a ranking that
 * is worse than useless, because it drives attention to the wrong
 * accounts.
 */
import Link from "next/link";
import { loadPortfolio } from "@/lib/organic/agency";
import { Band, Panel, Empty } from "@/components/organic/primitives";
import { Table, TH, TD, Pill, Metric, Toolbar, CohortScatter, Histogram } from "@/components/organic/internal";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "good" | "warn" | "bad" | "neutral"> = {
  ACTIVE: "good", ONBOARDING: "warn", PROSPECT: "neutral",
  PAUSED: "warn", CHURNED: "bad",
};

export default async function PortfolioPage() {
  const rows = await loadPortfolio();

  const active = rows.filter((r) => r.engagement_status === "ACTIVE").length;
  const onboarding = rows.filter((r) => r.engagement_status === "ONBOARDING").length;
  const measured = rows.filter((r) => r.vs_baseline_pct != null);
  const belowBaseline = measured.filter((r) => (r.vs_baseline_pct ?? 0) < 0).length;

  // Cohorts in a fixed order so the page does not reshuffle as stores age.
  const ORDER = ["Month 1–2", "Month 3–5", "Month 6–11", "Month 12+"];
  const byCohort = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = r.cohort ?? "No onboarding date";
    byCohort.set(key, [...(byCohort.get(key) ?? []), r]);
  }
  const cohorts = [...ORDER, "No onboarding date"]
    .filter((c) => byCohort.has(c))
    .map((c) => [c, byCohort.get(c)!] as const);

  return (
    <div>
      <Toolbar>
        <Metric label="Stores" value={rows.length} />
        <Metric label="Active" value={active} tone={active ? "good" : undefined} />
        <Metric label="Onboarding" value={onboarding} tone={onboarding ? "warn" : undefined} />
        <Metric label="Below baseline" value={measured.length ? belowBaseline : null}
                tone={belowBaseline ? "bad" : "good"} />
      </Toolbar>

      <Band title="Tenure against performance"
            sub="Where a store sits relative to others of the same age. Outliers below the trend are the ones to open first.">
        <Panel className="px-5 py-5">
          <CohortScatter
            points={rows.map((r) => ({
              label: r.name,
              x: r.tenure_months ?? 0,
              y: r.vs_baseline_pct,
            }))}
          />
        </Panel>
      </Band>

      <Band title="Distribution"
            sub="Whether the book is broadly healthy or carried by a handful of accounts.">
        <Panel className="px-5 py-5">
          {measured.length === 0 ? (
            <p className="text-[length:var(--text-o-body)] text-o-ink-3">
              No store has both a phase-1 baseline and measured performance yet, so
              there is no distribution to show. This fills in as baselines are
              captured during onboarding.
            </p>
          ) : (
            <Histogram
              buckets={[
                { label: "worse", count: measured.filter((r) => r.vs_baseline_pct! < 0).length, tone: "bad" },
                { label: "flat",  count: measured.filter((r) => r.vs_baseline_pct! >= 0 && r.vs_baseline_pct! < 25).length },
                { label: "+25%",  count: measured.filter((r) => r.vs_baseline_pct! >= 25 && r.vs_baseline_pct! < 100).length, tone: "good" },
                { label: "+100%", count: measured.filter((r) => r.vs_baseline_pct! >= 100).length, tone: "good" },
              ]}
            />
          )}
        </Panel>
      </Band>

      {cohorts.map(([cohort, list]) => (
        <Band key={cohort} title={cohort}
              sub={`${list.length} store${list.length === 1 ? "" : "s"}.`}>
          <Table>
            <thead>
              <tr>
                <TH>Store</TH><TH>Status</TH><TH>Class</TH>
                <TH align="right">Boards</TH><TH align="right">Topics</TH>
                <TH align="right">Pins 30d</TH><TH align="right">Queued</TH>
                <TH align="right">vs baseline</TH><TH align="right">MoM</TH>
                <TH align="right">Blocked</TH>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.org_id} className="hover:bg-o-sunk/50">
                  <TD>
                    <Link href={`/client/${r.org_id}`} className="text-o-ink hover:underline underline-offset-2">
                      {r.name}
                    </Link>
                    {r.niche && (
                      <span className="block text-[length:var(--text-o-label)] text-o-ink-3">{r.niche}</span>
                    )}
                  </TD>
                  <TD>
                    <Pill tone={STATUS_TONE[r.engagement_status ?? ""] ?? "neutral"}>
                      {(r.engagement_status ?? "—").toLowerCase()}
                    </Pill>
                  </TD>
                  <TD muted>{r.account_class?.toLowerCase() ?? "—"}</TD>
                  <TD align="right">{r.boards_live}</TD>
                  <TD align="right">
                    <span className={cn(r.topics_total > 0 && r.topics_covered < r.topics_total && "text-o-clay")}>
                      {r.topics_covered}/{r.topics_total}
                    </span>
                  </TD>
                  <TD align="right">{r.pins_published_30d}</TD>
                  <TD align="right">
                    <span className={cn(r.engagement_status === "ACTIVE" && r.pins_scheduled_ahead === 0 && "text-o-neg font-semibold")}>
                      {r.pins_scheduled_ahead}
                    </span>
                  </TD>
                  <TD align="right">
                    {r.vs_baseline_pct == null
                      ? <span className="text-o-ink-3" title="No phase-1 baseline captured">—</span>
                      : <span className={r.vs_baseline_pct < 0 ? "text-o-neg font-semibold" : "text-o-pos"}>
                          {r.vs_baseline_pct > 0 ? "+" : ""}{r.vs_baseline_pct}%
                        </span>}
                  </TD>
                  <TD align="right">
                    {r.mom_pct == null
                      ? <span className="text-o-ink-3" title="Needs two measured months">—</span>
                      : <span className={r.mom_pct < 0 ? "text-o-neg" : "text-o-pos"}>
                          {r.mom_pct > 0 ? "+" : ""}{r.mom_pct}%
                        </span>}
                  </TD>
                  <TD align="right">
                    <span className={cn(r.blocked_tasks > 0 && "text-o-clay")}>{r.blocked_tasks}</span>
                  </TD>
                </tr>
              ))}
            </tbody>
          </Table>
        </Band>
      ))}

      {rows.length === 0 && (
        <Empty
          headline="No stores are activated yet."
          body="A store appears here once it is activated on the client list, which creates its phase 1–3 task bank."
        />
      )}
    </div>
  );
}
