/**
 * LIBRARY · Keywords — the bank, and the waste inside it.
 *
 * The scatter leads because it exposes the biggest silent loss in the
 * system: validated high-volume terms that nobody ever put on a pin. That
 * research was paid for in hours and returns nothing while it sits in the
 * bank, and it is invisible in a sorted table.
 */
import { loadKeywords } from "@/lib/organic/workspace";
import { Band, Panel, Empty } from "@/components/organic/primitives";
import { Table, TH, TD, Pill, Metric, Toolbar, VolumeUsageScatter } from "@/components/organic/internal";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function KeywordsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const rows = await loadKeywords(orgId);

  const withVol = rows.filter((r) => r.volume != null);
  const stale = rows.filter((r) => r.volume_stale);
  const unused = withVol.filter((r) => (r.volume ?? 0) > 0 && r.used_on_urls === 0);

  return (
    <div>
      <Toolbar>
        <Metric label="In the bank" value={rows.length} />
        <Metric label="Volume validated" value={withVol.length} />
        <Metric label="Cache stale" value={stale.length} tone={stale.length ? "warn" : "good"} />
        <Metric label="Validated, never used" value={unused.length} tone={unused.length ? "bad" : "good"} />
      </Toolbar>

      {withVol.length > 0 && (
        <Band title="Volume against deployment"
              sub="Every point is a term. The shaded corner is reach we researched and never used.">
          <Panel className="px-5 py-5">
            <VolumeUsageScatter
              points={withVol.map((r) => ({ label: r.term, x: r.used_on_urls, y: r.volume }))}
            />
          </Panel>
        </Band>
      )}

      <Band title="Keyword bank" sub={`${rows.length} term${rows.length === 1 ? "" : "s"}.`}>
        {rows.length === 0 ? (
          <Empty
            headline="The keyword bank is empty."
            body="Terms are harvested in phase 3 from Pinterest autocomplete, competitor annotations and the taxonomy, then each is checked for real search volume before it can be used on a pin."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <TH>Term</TH>
                <TH>Type</TH>
                <TH>Cluster</TH>
                <TH>Season</TH>
                <TH align="right">Volume</TH>
                <TH>Cache age</TH>
                <TH align="right">On URLs</TH>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const wasted = r.volume != null && r.volume > 0 && r.used_on_urls === 0;
                return (
                  <tr key={r.id} className="hover:bg-o-sunk/50">
                    <TD>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="text-o-ink truncate max-w-[16rem]" title={r.term}>{r.term}</span>
                        {r.client_forbidden && <Pill tone="bad">forbidden</Pill>}
                        {r.parent_interest && <Pill tone="neutral">interest</Pill>}
                      </span>
                    </TD>
                    <TD muted>{r.type.toLowerCase()}</TD>
                    <TD muted={!r.cluster_name}>{r.cluster_name ?? "—"}</TD>
                    <TD muted={!r.seasonal_type}>{r.seasonal_type?.toLowerCase() ?? "—"}</TD>
                    <TD align="right">
                      {r.volume == null
                        ? <span className="text-o-ink-3" title="Volume has not been looked up yet">—</span>
                        : r.volume.toLocaleString("en-US")}
                    </TD>
                    <TD>
                      {r.volume_days_old == null ? <span className="text-o-ink-3">—</span>
                        : r.volume_stale
                          ? <Pill tone="warn">{r.volume_days_old}d</Pill>
                          : <span className="text-o-ink-3">{r.volume_days_old}d</span>}
                    </TD>
                    <TD align="right">
                      <span className={cn(wasted && "text-o-neg font-semibold")}>{r.used_on_urls}</span>
                    </TD>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Band>
    </div>
  );
}
