"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AdsCandidate, AnalyticsFetch, BaselineRow, DeltaRow, FeedbackAggregate } from "@/lib/organic/phase5";
import { PROVENANCE_LABEL, PROVENANCE_REASON, type ProvenanceState } from "@/lib/organic/provenance";

export function AnalyticsPanel({
  orgId, from, to, pinterest, baseline, deltas,
  byReason, byKeyword, byBreadth, adsCandidates,
}: {
  orgId: string;
  from: string;
  to: string;
  pinterest: AnalyticsFetch;
  baseline: BaselineRow | null;
  deltas: DeltaRow[];
  byReason: FeedbackAggregate[];
  byKeyword: FeedbackAggregate[];
  byBreadth: FeedbackAggregate[];
  adsCandidates: AdsCandidate[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);

  return (
    <div className="space-y-6">
      {/* Date range */}
      <div className="flex items-center gap-2 text-xs bg-white rounded-md border border-neutral-200 px-3 py-2">
        <span className="text-neutral-500">Range:</span>
        <input type="date" value={f} onChange={(e) => setF(e.target.value)}
          className="rounded-md border border-neutral-300 px-2 py-1 text-xs" />
        <span>→</span>
        <input type="date" value={t} onChange={(e) => setT(e.target.value)}
          className="rounded-md border border-neutral-300 px-2 py-1 text-xs" />
        <button type="button" onClick={() => startTransition(() => router.push(`?from=${f}&to=${t}`))}
          className="ml-2 px-3 py-1 rounded-md bg-neutral-900 text-white font-semibold hover:bg-neutral-800">
          Apply
        </button>
      </div>

      {/* Pinterest fetch status */}
      {!pinterest.ok && (
        <div className="rounded-md border border-border bg-muted px-3 py-2 text-xs text-foreground">
          Pinterest fetch failed: <span className="font-mono">{pinterest.reason}</span>. Feedback loop below still runs on stored pin_performance rows.
        </div>
      )}

      {/* KPI deltas — the "movement, not absolute numbers" view */}
      {/* Hard metrics — results. These carry the retainer, so they sit
          first and separate. Impressions are not results and must not
          share this table. */}
      <Section title="Results vs P1.2.13 baseline">
        {baseline == null && (
          <div className="mb-2 rounded-md border border-border bg-muted px-3 py-2 text-[11px] text-foreground">
            No phase-1 baseline captured, so nothing here can be compared against a starting point. Comparisons are suppressed rather than invented — complete P1.2.13 to enable them.
          </div>
        )}
        <DeltaTable rows={deltas.filter((d) => d.tier === "hard")} />
      </Section>

      {/* Soft metrics — distribution and reach. Real, but not results.
          Collapsed and lower-contrast by design. */}
      <details className="group">
        <summary className="cursor-pointer text-sm font-semibold text-neutral-600 hover:text-neutral-900 mb-2">
          Distribution &amp; reach
          <span className="ml-2 text-[11px] font-normal text-neutral-400">
            impressions, engagement, save rate — not results
          </span>
        </summary>
        <div className="opacity-80">
          <DeltaTable rows={deltas.filter((d) => d.tier === "soft")} />
        </div>
      </details>

      {/* Feedback loop — the part that matters */}
      <Section title="Feedback loop — what actually drove clicks + saves">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <AggregateCard title="By reason" rows={byReason} />
          <AggregateCard title="By keyword (top 25)" rows={byKeyword} />
          <AggregateCard title="By board breadth" rows={byBreadth} />
        </div>
      </Section>

      {/* Ads candidates */}
      <Section title="Organic winners eligible for ads">
        <div className="mb-2 rounded-md border border-border bg-muted px-3 py-2 text-[11px] text-foreground">
          <strong>Never boost an organic pin.</strong> Recreate the winner as a NEW asset inside Ads Manager. Boosting blends organic and paid data on the same pin, which then corrupts every downstream feedback loop and the ads-candidates report itself.
        </div>
        {adsCandidates.length === 0 ? (
          <div className="text-xs text-neutral-500">No pins yet cross the (saves + outbound_clicks) ≥ 5 threshold.</div>
        ) : (
          <div className="rounded-md border border-border bg-card overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-[11px] uppercase tracking-wide text-neutral-500">
                  <th className="py-1.5 px-3 font-medium">Pin</th>
                  <th className="py-1.5 px-3 font-medium">Board</th>
                  <th className="py-1.5 px-3 font-medium">URL</th>
                  <th className="py-1.5 px-3 font-medium text-right">Impr</th>
                  <th className="py-1.5 px-3 font-medium text-right">Saves</th>
                  <th className="py-1.5 px-3 font-medium text-right">Clicks</th>
                  <th className="py-1.5 px-3 font-medium text-right">Score</th>
                  <th className="py-1.5 px-3 font-medium text-right">In ads?</th>
                  <th className="py-1.5 px-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {adsCandidates.map((c) => (
                  <PromoteRow key={c.pin_id} orgId={orgId} c={c} onDone={() => startTransition(() => router.refresh())} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Pinterest raw for debugging / power users */}
      {pinterest.ok && pinterest.totals && (
        <details className="text-[11px] text-neutral-500">
          <summary className="cursor-pointer">Raw Pinterest totals</summary>
          <pre className="mt-2 bg-neutral-50 border border-neutral-200 rounded px-3 py-2 text-[10px] overflow-x-auto">
{JSON.stringify(pinterest.totals, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}

/** One table of figures, each carrying its provenance. A value that could
 *  not be measured renders as an em dash with the reason on hover — never
 *  as zero, because zero is a measurement and missing is not. */
function DeltaTable({ rows }: { rows: DeltaRow[] }) {
  if (rows.length === 0) return <div className="text-xs text-neutral-500">Nothing to show.</div>;
  return (
    <div className="rounded-md border border-border bg-card overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-[11px] uppercase tracking-wide text-neutral-500">
            <th className="py-1.5 px-3 font-medium">KPI</th>
            <th className="py-1.5 px-3 font-medium text-right">Baseline</th>
            <th className="py-1.5 px-3 font-medium text-right">Current</th>
            <th className="py-1.5 px-3 font-medium text-right">Δ</th>
            <th className="py-1.5 px-3 font-medium text-right">Δ %</th>
            <th className="py-1.5 px-3 font-medium">Source</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => {
            const missing = d.current == null;
            const hasDelta = d.delta != null && d.delta_pct != null;
            const why = PROVENANCE_REASON[(d.delta_suppressed_because ?? d.state) as ProvenanceState];
            return (
              <tr key={d.name} className="border-b border-neutral-100 last:border-b-0">
                <td className="py-1 px-3">{d.name}</td>
                <td className="py-1 px-3 text-right tabular-nums text-neutral-500">{fmt(d.baseline)}</td>
                <td className={`py-1 px-3 text-right tabular-nums ${missing ? "text-neutral-400" : ""}`} title={missing ? why : undefined}>
                  {fmt(d.current)}
                </td>
                <td className={`py-1 px-3 text-right tabular-nums font-medium ${hasDelta ? deltaColor(d.delta) : "text-neutral-300"}`}>
                  {hasDelta ? fmtSigned(d.delta) : "—"}
                </td>
                <td className={`py-1 px-3 text-right tabular-nums ${hasDelta ? deltaColor(d.delta_pct) : "text-neutral-300"}`}
                    title={!hasDelta ? why : undefined}>
                  {hasDelta ? `${d.delta_pct}%` : "—"}
                </td>
                <td className="py-1 px-3 text-[10px] text-neutral-400 uppercase tracking-wide" title={why}>
                  {d.state === "LIVE" ? "" : PROVENANCE_LABEL[d.state as ProvenanceState]}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-neutral-800 mb-2">{title}</h2>
      {children}
    </section>
  );
}

function AggregateCard({ title, rows }: { title: string; rows: FeedbackAggregate[] }) {
  return (
    <div className="rounded-md border border-border bg-card overflow-hidden">
      <div className="px-3 py-2 border-b border-neutral-100 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{title}</div>
      {rows.length === 0 ? (
        <div className="p-3 text-xs text-neutral-500">No pin_performance rows yet.</div>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase text-neutral-400">
              <th className="py-1 px-2 font-medium">Key</th>
              <th className="py-1 px-2 font-medium text-right">Pins</th>
              <th className="py-1 px-2 font-medium text-right">Saves</th>
              <th className="py-1 px-2 font-medium text-right">Clicks</th>
              <th className="py-1 px-2 font-medium text-right">CTR/1k</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-neutral-100">
                <td className="py-1 px-2 truncate max-w-[140px]">{r.label}</td>
                <td className="py-1 px-2 text-right tabular-nums text-neutral-500">{r.pin_count}</td>
                <td className="py-1 px-2 text-right tabular-nums">{r.saves}</td>
                <td className="py-1 px-2 text-right tabular-nums font-medium">{r.outbound_clicks}</td>
                <td className="py-1 px-2 text-right tabular-nums text-neutral-500">{r.ctr_per_1000}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function PromoteRow({ orgId, c, onDone }: { orgId: string; c: AdsCandidate; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function promote() {
    setErr(null); setBusy(true);
    try {
      const r = await fetch(`/api/organic/analytics/${orgId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "promote_pin", pin_id: c.pin_id }),
      });
      const text = await r.text();
      if (!r.ok) throw new Error(text.slice(0, 140));
      onDone();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }
  return (
    <tr className="border-b border-neutral-100 last:border-b-0">
      <td className="py-1 px-3">
        <div className="text-neutral-800">D{c.design_number}/{c.copy_variant}</div>
        <div className="text-[10px] text-neutral-400 font-mono">{c.pin_id.slice(0, 8)}</div>
      </td>
      <td className="py-1 px-3 text-neutral-600 truncate max-w-[160px]">{c.board_name ?? "—"}</td>
      <td className="py-1 px-3 text-neutral-600 truncate max-w-[200px]">{c.url_name ?? "—"}</td>
      <td className="py-1 px-3 text-right tabular-nums text-neutral-500">{c.impressions}</td>
      <td className="py-1 px-3 text-right tabular-nums">{c.saves}</td>
      <td className="py-1 px-3 text-right tabular-nums font-medium">{c.outbound_clicks}</td>
      <td className="py-1 px-3 text-right tabular-nums font-semibold text-foreground">{c.score}</td>
      <td className="py-1 px-3 text-right text-neutral-500">{c.in_ads_candidates ? "✓ yes" : "—"}</td>
      <td className="py-1 px-3 text-right">
        {c.in_ads_candidates ? (
          <span className="text-[10px] text-neutral-400">handed over</span>
        ) : (
          <>
            <button type="button" onClick={promote} disabled={busy}
              title="Marks this pin for the paid team — they will recreate it as a NEW asset in Ads Manager. Never boost."
              className="text-[11px] px-2 py-0.5 rounded border border-foreground/30 text-foreground hover:bg-muted disabled:opacity-50">
              {busy ? "…" : "Send to Ads Manager"}
            </button>
            {err && <div className="text-[10px] text-red-600 mt-0.5">{err}</div>}
          </>
        )}
      </td>
    </tr>
  );
}

// Locale is pinned deliberately. A bare toLocaleString() formats with the
// Node process locale on the server and the viewer's locale in the
// browser, which is both a hydration mismatch and a way for two people to
// read different numbers off the same screen.
function fmt(v: number | null): string {
  if (v == null) return "—";
  return v.toLocaleString("en-US");
}
function fmtSigned(v: number | null): string {
  if (v == null) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toLocaleString("en-US")}`;
}
function deltaColor(v: number | null): string {
  if (v == null) return "text-neutral-400";
  if (v > 0) return "text-foreground";
  if (v < 0) return "text-red-600";
  return "text-neutral-500";
}
