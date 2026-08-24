/**
 * AGENCY · Method intelligence.
 *
 * What only an agency running fifty accounts can know. It is also the
 * screen most likely to be misread, because a pattern drawn from two
 * stores looks exactly like a pattern drawn from forty until you check.
 *
 * So every panel here states its sample and refuses to present a finding
 * the sample cannot carry. What it shows instead is the collection
 * progress — how far off the threshold it is — which is genuinely useful
 * and cannot be mistaken for a conclusion.
 */
import {
  loadBoardArchetypes, loadUrlReasons, loadPinTargets,
  loadSeasonalWindows, loadCacheHealth, MIN_STORES, MIN_OBSERVATIONS,
} from "@/lib/organic/method";
import { Band, Panel, Label, Figure } from "@/components/organic/primitives";
import { Table, TH, TD, Metric, Toolbar } from "@/components/organic/internal";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Shown in place of any aggregate whose sample is too thin. */
function NotYet({
  what, stores, observations, unit,
}: {
  what: string;
  stores: number;
  observations: number;
  unit: string;
}) {
  const pctStores = Math.min(100, Math.round((stores / MIN_STORES) * 100));
  const pctObs = Math.min(100, Math.round((observations / MIN_OBSERVATIONS) * 100));
  return (
    <Panel className="px-6 py-6">
      <div className="max-w-[46rem]">
        <p className="text-[length:var(--text-o-body)] text-o-ink leading-relaxed">
          Not enough data to say anything about {what} yet.
        </p>
        <div className="mt-4 grid sm:grid-cols-2 gap-5">
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <Label>Stores</Label>
              <span className="o-num text-[length:var(--text-o-label)] text-o-ink-3">
                {stores} of {MIN_STORES}
              </span>
            </div>
            <div className="h-[6px] rounded-full bg-o-sunk overflow-hidden">
              <div className="h-full rounded-full bg-o-teal" style={{ width: `${pctStores}%` }} />
            </div>
          </div>
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <Label>{unit}</Label>
              <span className="o-num text-[length:var(--text-o-label)] text-o-ink-3">
                {observations} of {MIN_OBSERVATIONS}
              </span>
            </div>
            <div className="h-[6px] rounded-full bg-o-sunk overflow-hidden">
              <div className="h-full rounded-full bg-o-teal" style={{ width: `${pctObs}%` }} />
            </div>
          </div>
        </div>
        <p className="mt-4 text-[length:var(--text-o-label)] text-o-ink-3 leading-relaxed">
          A pattern drawn from one or two stores looks identical to one drawn from
          forty, right up until somebody acts on it. The numbers are being collected;
          they are withheld until they mean something.
        </p>
      </div>
    </Panel>
  );
}

export default async function MethodPage() {
  const [arch, reasons, targets, seasonal, cache] = await Promise.all([
    loadBoardArchetypes(), loadUrlReasons(), loadPinTargets(),
    loadSeasonalWindows(), loadCacheHealth(),
  ]);

  const ready = [arch, reasons, targets, seasonal].filter((f) => !f.insufficient).length;

  return (
    <div>
      <Toolbar>
        <Metric label="Findings ready" value={`${ready}/4`}
                tone={ready === 4 ? "good" : ready === 0 ? "warn" : undefined} />
        <Metric label="Cached terms" value={cache.terms} />
        <Metric label="Shared across stores" value={cache.shared_terms}
                tone={cache.shared_terms > 0 ? "good" : undefined} />
        <Metric label="Stale (180d+)" value={cache.stale} tone={cache.stale ? "warn" : "good"} />
      </Toolbar>

      <Panel inset className="px-5 py-4 mb-9">
        <p className="text-[length:var(--text-o-body)] text-o-ink-2 leading-relaxed max-w-[48rem]">
          This is the compounding asset — the part of the method that is measured on
          our own book rather than borrowed. It needs at least{" "}
          <span className="text-o-ink">{MIN_STORES} stores</span> and{" "}
          <span className="text-o-ink">{MIN_OBSERVATIONS} observations</span> before any
          panel will state a conclusion.
        </p>
      </Panel>

      {/* ---- board archetypes -------------------------------------- */}
      <Band title="Board archetypes"
            sub="Which kinds of board earn their pins, across every client.">
        {arch.insufficient ? (
          <NotYet what="board archetypes" stores={arch.stores} observations={arch.observations} unit="Published pins" />
        ) : (
          <Table>
            <thead>
              <tr>
                <TH>Archetype</TH><TH align="right">Stores</TH><TH align="right">Boards</TH>
                <TH align="right">Pins</TH><TH align="right">Clicks / pin</TH><TH align="right">Saves / pin</TH>
              </tr>
            </thead>
            <tbody>
              {arch.rows.map((a) => (
                <tr key={a.archetype} className="hover:bg-o-sunk/50">
                  <TD>{a.archetype.toLowerCase().replace(/_/g, " ")}</TD>
                  <TD align="right">{a.stores}</TD>
                  <TD align="right">{a.boards}</TD>
                  <TD align="right">{a.pins}</TD>
                  <TD align="right">{a.clicks_per_pin ?? "—"}</TD>
                  <TD align="right">{a.saves_per_pin ?? "—"}</TD>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Band>

      {/* ---- URL reasons ------------------------------------------- */}
      <Band title="URL reasons"
            sub="Which justification for picking a page actually produces return, aggregated across the book.">
        {reasons.insufficient ? (
          <NotYet what="URL reasons" stores={reasons.stores} observations={reasons.observations} unit="Published pins" />
        ) : (
          <Table>
            <thead>
              <tr>
                <TH>Reason</TH><TH align="right">Stores</TH><TH align="right">URLs</TH>
                <TH align="right">Cycles</TH><TH align="right">Pins</TH>
                <TH align="right">Clicks / pin</TH>
              </tr>
            </thead>
            <tbody>
              {reasons.rows.map((r) => (
                <tr key={r.reason} className="hover:bg-o-sunk/50">
                  <TD>{r.reason.toLowerCase().replace(/_/g, " ")}</TD>
                  <TD align="right">{r.stores}</TD>
                  <TD align="right">{r.urls}</TD>
                  <TD align="right">{r.waterfalls}</TD>
                  <TD align="right">{r.pins}</TD>
                  <TD align="right">{r.clicks_per_pin ?? "—"}</TD>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Band>

      {/* ---- pin targets ------------------------------------------- */}
      <Band title="Daily pin target by account class"
            sub="What we set against what actually shipped. A target nobody hits is a number, not a plan.">
        {targets.insufficient ? (
          <NotYet what="pin targets" stores={targets.stores} observations={Math.round(targets.observations)} unit="Pins per day" />
        ) : (
          <Table>
            <thead>
              <tr>
                <TH>Account class</TH><TH align="right">Stores</TH>
                <TH align="right">Target / day</TH><TH align="right">Published / day</TH>
                <TH align="right">Clicks / pin</TH>
              </tr>
            </thead>
            <tbody>
              {targets.rows.map((t) => {
                const gap = t.mean_target != null && t.mean_published_per_day != null
                  ? t.mean_published_per_day - t.mean_target : null;
                return (
                  <tr key={t.account_class} className="hover:bg-o-sunk/50">
                    <TD>{t.account_class.toLowerCase()}</TD>
                    <TD align="right">{t.stores}</TD>
                    <TD align="right">{t.mean_target ?? "—"}</TD>
                    <TD align="right">
                      <span className={cn(gap != null && gap < -0.5 && "text-o-neg font-semibold")}>
                        {t.mean_published_per_day ?? "—"}
                      </span>
                    </TD>
                    <TD align="right">{t.clicks_per_pin ?? "—"}</TD>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Band>

      {/* ---- seasonal ---------------------------------------------- */}
      <Band title="Seasonal windows"
            sub="The theoretical six-to-ten weeks against the lead time we actually gave each term.">
        {seasonal.insufficient ? (
          <NotYet what="seasonal windows" stores={seasonal.stores} observations={seasonal.observations} unit="Published pins" />
        ) : (
          <Table>
            <thead>
              <tr>
                <TH>Term</TH><TH align="right">Stores</TH>
                <TH align="right">Planned lead</TH><TH align="right">Actual lead</TH>
                <TH align="right">Pins</TH><TH align="right">Clicks</TH>
              </tr>
            </thead>
            <tbody>
              {seasonal.rows.map((s) => (
                <tr key={s.term} className="hover:bg-o-sunk/50">
                  <TD>{s.term}</TD>
                  <TD align="right">{s.stores}</TD>
                  <TD align="right">{s.planned_lead_days != null ? `${s.planned_lead_days}d` : "—"}</TD>
                  <TD align="right">{s.actual_lead_days != null ? `${s.actual_lead_days}d` : "—"}</TD>
                  <TD align="right">{s.pins}</TD>
                  <TD align="right">{s.clicks.toLocaleString("en-US")}</TD>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Band>

      {/* ---- cache health ------------------------------------------ */}
      <Band title="Shared keyword cache"
            sub="Volume decays. A term looked up eighteen months ago is a guess wearing a number's clothes.">
        <Panel className="px-6 py-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-x-6 gap-y-6">
            <div>
              <Label>Terms cached</Label>
              <div className="mt-1.5"><Figure size="md" value={cache.terms} /></div>
            </div>
            <div>
              <Label>Fresh (under 90d)</Label>
              <div className="mt-1.5"><Figure size="md" value={cache.fresh} /></div>
            </div>
            <div>
              <Label>Ageing (90–180d)</Label>
              <div className="mt-1.5"><Figure size="md" value={cache.ageing} /></div>
            </div>
            <div>
              <Label>Stale (180d+)</Label>
              <div className="mt-1.5">
                <span className={cn(cache.stale > 0 && "text-o-neg")}>
                  <Figure size="md" value={cache.stale} />
                </span>
              </div>
            </div>
            <div>
              <Label>Median age</Label>
              <div className="mt-1.5">
                <Figure size="md" value={cache.median_age_days} suffix="d"
                        reason="No lookups cached yet" />
              </div>
            </div>
          </div>

          {cache.most_shared.length > 0 ? (
            <div className="mt-7 pt-6 border-t border-o-hairline">
              <Label>Held by the most stores</Label>
              <div className="mt-3">
                <Table>
                  <thead>
                    <tr><TH>Term</TH><TH align="right">Volume</TH><TH align="right">Stores</TH><TH align="right">Age</TH></tr>
                  </thead>
                  <tbody>
                    {cache.most_shared.map((t) => (
                      <tr key={t.term}>
                        <TD>{t.term}</TD>
                        <TD align="right">{t.volume?.toLocaleString("en-US") ?? "—"}</TD>
                        <TD align="right">{t.stores}</TD>
                        <TD align="right">
                          <span className={cn(t.age_days != null && t.age_days > 180 && "text-o-neg")}>
                            {t.age_days != null ? `${t.age_days}d` : "—"}
                          </span>
                        </TD>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </div>
          ) : (
            <p className="mt-6 pt-5 border-t border-o-hairline text-[length:var(--text-o-body)] text-o-ink-3 leading-relaxed max-w-[44rem]">
              No term is yet held by more than one store, so the cache is not saving
              anyone a lookup. That changes as soon as a second store researches an
              overlapping niche — and it is the point at which this table starts paying
              for itself.
            </p>
          )}
        </Panel>
      </Band>
    </div>
  );
}
