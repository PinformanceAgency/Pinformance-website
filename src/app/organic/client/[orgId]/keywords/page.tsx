import { loadKeywords } from "@/lib/organic/workspace";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function KeywordsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const rows = await loadKeywords(orgId);

  const withVol = rows.filter((r) => r.volume != null);
  const stale = rows.filter((r) => r.volume_stale);
  const unused = rows.filter((r) => r.volume != null && (r.volume ?? 0) > 0 && r.used_on_urls === 0);

  return (
    <div className="space-y-6">
      {/* Metrics */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <MetricCard label="Total keywords" value={rows.length} />
        <MetricCard label="With cached volume" value={withVol.length} />
        <MetricCard label="Cache stale (>180d)" value={stale.length} tone={stale.length > 0 ? "warn" : "ok"} />
        <MetricCard label="Unused with volume" value={unused.length} tone={unused.length > 0 ? "warn" : "ok"} hint="Missed opportunity" />
      </section>

      {/* Keyword table */}
      <section>
        <h2 className="text-sm font-semibold text-foreground mb-2">Keyword bank</h2>
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 px-3 font-medium">Term</th>
                  <th className="py-2 px-3 font-medium">Type</th>
                  <th className="py-2 px-3 font-medium">Cluster</th>
                  <th className="py-2 px-3 font-medium">Season</th>
                  <th className="py-2 px-3 font-medium text-right">Volume</th>
                  <th className="py-2 px-3 font-medium">Cache age</th>
                  <th className="py-2 px-3 font-medium text-center">Used?</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((k) => (
                  <tr key={k.id} className={cn("border-t border-border", k.client_forbidden && "opacity-50")}>
                    <td className="py-1.5 px-3">
                      <span className="text-foreground">{k.term}</span>
                      {k.client_forbidden && <span className="ml-1 text-[10px] text-red-600">(forbidden)</span>}
                    </td>
                    <td className="py-1.5 px-3 text-[10px] text-muted-foreground uppercase">{k.type}</td>
                    <td className="py-1.5 px-3 text-xs text-muted-foreground">{k.cluster_name ?? "—"}</td>
                    <td className="py-1.5 px-3 text-[10px]">
                      {k.seasonal_type ? <span className={cn("px-1 py-0.5 rounded border", seasonCls(k.seasonal_type))}>{k.seasonal_type}</span> : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="py-1.5 px-3 text-right tabular-nums">
                      {k.volume != null ? (
                        <span className={cn("font-semibold", (k.volume ?? 0) > 5000 ? "text-emerald-700" : "text-foreground")}>{k.volume.toLocaleString()}</span>
                      ) : (
                        <span className="text-muted-foreground">not looked up</span>
                      )}
                    </td>
                    <td className="py-1.5 px-3 text-[11px] tabular-nums">
                      {k.volume_days_old != null ? (
                        <span className={cn(k.volume_stale ? "text-amber-700 font-medium" : "text-muted-foreground")}>
                          {k.volume_days_old}d {k.volume_stale && "· stale"}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="py-1.5 px-3 text-center">
                      {k.used_on_urls > 0 ? (
                        <span className="text-emerald-700 text-xs font-medium tabular-nums">✓ {k.used_on_urls}</span>
                      ) : (k.volume ?? 0) > 0 ? (
                        <span className="text-red-600 text-xs font-medium">missed</span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
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

function MetricCard({ label, value, tone = "ok", hint }: { label: string; value: number; tone?: "ok" | "warn" | "bad"; hint?: string }) {
  const cls = tone === "warn" ? "text-amber-700" : tone === "bad" ? "text-red-600" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{label}</div>
      <div className={cn("mt-1 text-2xl font-semibold tabular-nums", cls)}>{value.toLocaleString()}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}

function seasonCls(t: string): string {
  if (t === "EVERGREEN") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (t === "SEASONAL") return "border-purple-200 bg-purple-50 text-purple-700";
  if (t === "MICRO_TREND") return "border-red-200 bg-red-50 text-red-700";
  return "border-neutral-200 bg-neutral-100 text-neutral-600";
}
