import Link from "next/link";
import { AlertTriangle, AlertCircle, Info, TrendingUp, TrendingDown } from "lucide-react";
import { loadClientHeader } from "@/lib/organic/queries";
import { loadLeaks, type Leak } from "@/lib/organic/workspace";
import { loadCyclesForOrg } from "@/lib/organic/phase4";
import * as P5 from "@/lib/organic/phase5";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function OverviewPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const today = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);

  const [header, leaks, cycles, baseline, pinterest] = await Promise.all([
    loadClientHeader(orgId),
    loadLeaks(orgId),
    loadCyclesForOrg(orgId),
    P5.loadBaseline(orgId),
    P5.fetchOrganicAnalytics(orgId, from, today),
  ]);

  const overallPct = header?.phases.length
    ? Math.round(header.phases.reduce((s, p) => s + p.pct_done, 0) / header.phases.length)
    : 0;
  const onboardingDone = header?.phases.slice(0, 3).every((p) => p.pct_done === 100) ?? false;
  const deltas = P5.computeDeltas(baseline, pinterest.totals);

  return (
    <div className="space-y-6">
      {/* Leak panel */}
      <section>
        <h2 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-primary" />
          Leaks — what needs attention
        </h2>
        {leaks.length === 0 ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            No leaks detected. Everything downstream is in shape.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {leaks.map((l) => <LeakCard key={l.kind} orgId={orgId} leak={l} />)}
          </div>
        )}
      </section>

      {/* Onboarding progress if still running */}
      {!onboardingDone && header && (
        <section>
          <h2 className="text-sm font-semibold text-foreground mb-2">Onboarding progress</h2>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-baseline gap-3 mb-2">
              <span className="text-3xl font-semibold text-foreground tabular-nums">{overallPct}%</span>
              <span className="text-xs text-muted-foreground">across phases 1–3</span>
            </div>
            <div className="space-y-1.5">
              {header.phases.slice(0, 3).map((p) => (
                <div key={p.phase} className="flex items-center gap-3 text-xs">
                  <span className="w-16 text-muted-foreground">Phase {p.phase}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className={cn("h-full", p.pct_done >= 100 ? "bg-emerald-500" : p.pct_done >= 50 ? "bg-blue-500" : "bg-amber-500")}
                      style={{ width: `${Math.min(100, p.pct_done)}%` }} />
                  </div>
                  <span className="tabular-nums text-muted-foreground w-16 text-right">{p.done_tasks}/{p.total_tasks} · {p.pct_done}%</span>
                </div>
              ))}
            </div>
            <Link href={`/client/${orgId}/phase/1`} className="mt-3 inline-block text-xs font-medium text-primary hover:underline">
              Open phase 1 →
            </Link>
          </div>
        </section>
      )}

      {/* Active cycles */}
      <section>
        <h2 className="text-sm font-semibold text-foreground mb-2 flex items-baseline justify-between">
          <span>Active cycles <span className="text-muted-foreground font-normal">({cycles.length})</span></span>
          <Link href={`/client/${orgId}/phase/4`} className="text-xs font-medium text-primary hover:underline">Open phase 4 →</Link>
        </h2>
        {cycles.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card px-4 py-6 text-xs text-muted-foreground text-center">
            No cycles running. Start one from the Cycles tab.
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-1.5 px-3 font-medium">URL</th>
                  <th className="py-1.5 px-3 font-medium">Reason</th>
                  <th className="py-1.5 px-3 font-medium">Waterfall</th>
                  <th className="py-1.5 px-3 font-medium">Progress</th>
                </tr>
              </thead>
              <tbody>
                {cycles.map((c) => (
                  <tr key={c.cycle} className="border-t border-border">
                    <td className="py-1.5 px-3 font-medium text-foreground">{c.url_name}</td>
                    <td className="py-1.5 px-3 text-xs text-muted-foreground">{c.reason}</td>
                    <td className="py-1.5 px-3 text-xs">{c.waterfall ? <span className="text-blue-700">{c.waterfall.status}</span> : <span className="text-muted-foreground">—</span>}</td>
                    <td className="py-1.5 px-3 text-xs tabular-nums text-muted-foreground">{c.progress.done}/{c.progress.total} ({c.progress.pct}%){c.progress.blocked > 0 && <span className="ml-2 text-red-600">{c.progress.blocked} blocked</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* KPIs vs baseline */}
      <section>
        <h2 className="text-sm font-semibold text-foreground mb-2 flex items-baseline justify-between">
          <span>KPIs · last 30 days vs P1.2.13 baseline</span>
          <Link href={`/client/${orgId}/analytics`} className="text-xs font-medium text-primary hover:underline">Full analytics →</Link>
        </h2>
        {!pinterest.ok ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
            Pinterest fetch failed: {pinterest.reason}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {deltas.slice(0, 4).map((d) => <KpiCard key={d.name} d={d} />)}
          </div>
        )}
      </section>
    </div>
  );
}

function LeakCard({ orgId, leak }: { orgId: string; leak: Leak }) {
  const sevCls =
    leak.severity === "high" ? "border-red-300 bg-red-50" :
    leak.severity === "medium" ? "border-amber-300 bg-amber-50" :
    "border-neutral-200 bg-muted/50";
  const sevIcon =
    leak.severity === "high" ? <AlertCircle className="w-4 h-4 text-red-600" /> :
    leak.severity === "medium" ? <AlertTriangle className="w-4 h-4 text-amber-700" /> :
    <Info className="w-4 h-4 text-muted-foreground" />;
  return (
    <div className={cn("rounded-lg border p-3", sevCls)}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          {sevIcon}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-foreground">{leak.label}</div>
            {leak.detail.length > 0 && (
              <ul className="mt-1 text-[11px] text-muted-foreground space-y-0.5">
                {leak.detail.map((d, i) => <li key={i} className="truncate">· {d}</li>)}
              </ul>
            )}
          </div>
        </div>
        <Link href={`/client/${orgId}/${leak.fix_href}`} className="shrink-0 text-[11px] font-medium text-primary hover:underline">
          Fix →
        </Link>
      </div>
    </div>
  );
}

function KpiCard({ d }: { d: import("@/lib/organic/phase5").DeltaRow }) {
  const trend = d.delta == null ? null : d.delta > 0 ? "up" : d.delta < 0 ? "down" : "flat";
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{d.name}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-lg font-semibold text-foreground tabular-nums">{d.current == null ? "—" : d.current.toLocaleString()}</span>
        {trend && (
          <span className={cn("text-xs tabular-nums flex items-center gap-0.5", trend === "up" ? "text-emerald-700" : trend === "down" ? "text-red-600" : "text-muted-foreground")}>
            {trend === "up" ? <TrendingUp className="w-3 h-3" /> : trend === "down" ? <TrendingDown className="w-3 h-3" /> : null}
            {d.delta_pct != null ? `${d.delta_pct > 0 ? "+" : ""}${d.delta_pct}%` : ""}
          </span>
        )}
      </div>
      <div className="mt-0.5 text-[10px] text-muted-foreground tabular-nums">baseline {d.baseline?.toLocaleString() ?? "—"}</div>
    </div>
  );
}
