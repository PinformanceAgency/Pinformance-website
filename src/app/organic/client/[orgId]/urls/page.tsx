import { loadUrls } from "@/lib/organic/workspace";
import { computeUrlRequirement, assessViability, loadProposals } from "@/lib/organic/expansion";
import { ExpansionPanel } from "./ExpansionPanel";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function UrlsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const [urls, requirement, assessment, proposals] = await Promise.all([
    loadUrls(orgId),
    computeUrlRequirement(orgId),
    assessViability(orgId),
    loadProposals(orgId),
  ]);

  const selectable = urls.filter((u) => u.is_selectable && !u.active_waterfall_status).length;
  const running = urls.filter((u) => u.active_waterfall_status).length;
  const inCooldown = urls.filter((u) => !u.cooldown_clear).length;

  return (
    <div className="space-y-6">
      <ExpansionPanel
        orgId={orgId}
        requirement={requirement}
        assessment={{ buildable_pages: assessment.buildable_pages, existing_plus_buildable: assessment.existing_plus_buildable, verdict_suggested: assessment.verdict_suggested, reasoning: assessment.reasoning }}
        proposals={proposals as Parameters<typeof ExpansionPanel>[0]["proposals"]}
      />

      <section className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <MetricCard label="Total URLs" value={urls.length} />
        <MetricCard label="Selectable now" value={selectable} tone={selectable > 0 ? "primary" : "muted"} hint="Ready to pick" />
        <MetricCard label="Running cycles" value={running} />
        <MetricCard label="In cooldown" value={inCooldown} tone="muted" />
      </section>

      <section>
        <h2 className="text-sm font-semibold text-foreground mb-2">URLs</h2>
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 px-3 font-medium">URL</th>
                  <th className="py-2 px-3 font-medium">Reason</th>
                  <th className="py-2 px-3 font-medium">Funnel</th>
                  <th className="py-2 px-3 font-medium text-right">Boards</th>
                  <th className="py-2 px-3 font-medium text-right">Runs</th>
                  <th className="py-2 px-3 font-medium">Cooldown / next available</th>
                  <th className="py-2 px-3 font-medium text-right">Performance</th>
                  <th className="py-2 px-3 font-medium">State</th>
                </tr>
              </thead>
              <tbody>
                {urls.map((u) => (
                  <tr key={u.id} className="border-t border-border">
                    <td className="py-1.5 px-3">
                      <div className="text-foreground font-medium truncate max-w-[240px]" title={u.name}>{u.name}</div>
                      <a href={u.url} target="_blank" rel="noreferrer" className="text-[10px] text-primary hover:underline truncate block max-w-[240px]">{u.url}</a>
                    </td>
                    <td className="py-1.5 px-3"><ReasonPill reason={u.reason} /></td>
                    <td className="py-1.5 px-3 text-[10px] text-muted-foreground">
                      {u.funnel_stage ?? "—"}{u.is_seasonal && <span className="ml-1 text-purple-700 font-medium">SEASONAL</span>}
                    </td>
                    <td className="py-1.5 px-3 text-right tabular-nums text-xs">
                      <span className={cn(u.assigned_boards < 5 ? "text-red-600 font-semibold" : "text-foreground")}>{u.assigned_boards}</span>
                    </td>
                    <td className="py-1.5 px-3 text-right tabular-nums text-xs text-muted-foreground">{u.waterfalls_run}</td>
                    <td className="py-1.5 px-3 text-xs tabular-nums">
                      {u.cooldown_until ? (
                        <span className={cn(u.cooldown_clear ? "text-emerald-700" : "text-amber-700")}>
                          {u.cooldown_clear ? "clear" : `until ${u.cooldown_until}`}
                        </span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="py-1.5 px-3 text-right text-[11px] tabular-nums text-muted-foreground">
                      {u.total_impressions > 0 ? (
                        <>
                          <div>{u.total_impressions.toLocaleString()} impr</div>
                          <div>{u.total_saves} sv / {u.total_outbound_clicks} clk</div>
                        </>
                      ) : "—"}
                    </td>
                    <td className="py-1.5 px-3">
                      {u.active_waterfall_status ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-700 font-semibold">
                          {u.active_waterfall_status}
                        </span>
                      ) : u.is_selectable ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded border border-emerald-200 bg-emerald-50 text-emerald-700 font-semibold">READY</span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">
                          {!u.topic_covered ? "topic uncov" : u.assigned_boards < 5 ? "<5 boards" : !u.cooldown_clear ? "cooldown" : "—"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

function MetricCard({ label, value, tone = "ok", hint }: { label: string; value: number; tone?: "ok" | "warn" | "muted" | "primary"; hint?: string }) {
  const cls =
    tone === "warn" ? "text-amber-700" :
    tone === "muted" ? "text-muted-foreground" :
    tone === "primary" ? "text-primary" :
    "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{label}</div>
      <div className={cn("mt-1 text-2xl font-semibold tabular-nums", cls)}>{value.toLocaleString()}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}

function ReasonPill({ reason }: { reason: string }) {
  const cls =
    reason === "BEST_PERFORMER" ? "border-emerald-200 bg-emerald-50 text-emerald-700" :
    reason === "SEASONAL"       ? "border-purple-200 bg-purple-50 text-purple-700" :
    reason === "NEW"            ? "border-blue-200 bg-blue-50 text-blue-700" :
    reason === "CLIENT_REQUEST" ? "border-amber-200 bg-amber-50 text-amber-700" :
    reason === "AB_TEST"        ? "border-pink-200 bg-pink-50 text-pink-700" :
    reason === "STOCK_PUSH"     ? "border-orange-200 bg-orange-50 text-orange-700" :
    "border-neutral-200 bg-neutral-100 text-neutral-600";
  return <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-semibold uppercase tracking-wide", cls)}>{reason}</span>;
}
