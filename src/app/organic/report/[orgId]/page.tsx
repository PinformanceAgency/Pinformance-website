/**
 * STAGE 2 · THE CLIENT REPORT
 *
 * The only surface a client ever sees, and the one that has to carry a
 * €2–5k retainer. It is deliberately not under /client/[orgId] — that
 * route carries the internal workspace chrome, and a shareable document
 * must never inherit the tool's furniture by accident.
 *
 * It reads top to bottom as a monthly narrative and answers four
 * questions in the order a client actually asks them:
 *
 *   Is this working?           A · B · leading indicators
 *   Why believe the numbers?   C · D
 *   What did you do?           E · F
 *   What happens next?         G · H
 *
 * Everything obeys the Stage-0 contract: a figure that could not be
 * measured renders as an em dash with its reason, and a comparison
 * against an absent baseline is never computed.
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import { loadClientHeader } from "@/lib/organic/queries";
import * as R from "@/lib/organic/report";
import { PROVENANCE_LABEL, PROVENANCE_REASON } from "@/lib/organic/provenance";
import { Band, Panel, Label, Figure, Movement, Empty } from "@/components/organic/primitives";
import { TrendLine, ColumnSeries, PairedBars, BarList } from "@/components/organic/charts";
import { Disclosure } from "@/components/organic/disclosure";

export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ */

const MONTH_LABEL = (m: string) =>
  new Date(m + "T00:00:00Z").toLocaleDateString("en-GB", {
    month: "long", year: "numeric", timeZone: "UTC",
  });

const firstOfThisMonth = () => {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
};

const fmtDuration = (s: number) => `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, "0")}s`;
const fmtPct = (v: number) => `${v.toFixed(1)}%`;

/* ------------------------------------------------------------------ */

export default async function ClientReportPage({
  params, searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { orgId } = await params;
  const sp = await searchParams;

  const [header, series] = await Promise.all([
    loadClientHeader(orgId),
    R.loadMonthlySeries(orgId, 12),
  ]);
  if (!header) notFound();

  // The month on show. Explicit choice wins; otherwise the newest month we
  // actually measured; otherwise the calendar month, so a store with no
  // data still renders a dated, deliberate document.
  const month = sp.month
    ? `${sp.month.slice(0, 7)}-01`
    : series.length
      ? series[series.length - 1].month
      : firstOfThisMonth();

  const idx = series.findIndex((s) => s.month === month);
  const current = idx >= 0 ? series[idx] : undefined;
  const previous = idx > 0 ? series[idx - 1] : undefined;
  const monthEnd = new Date(Date.UTC(
    Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0
  )).toISOString().slice(0, 10);

  const [headline, built, assets, worked, next, leading] = await Promise.all([
    R.loadHeadline(orgId, month),
    R.loadWhatWasBuilt(orgId, month),
    R.loadStrategyAssets(orgId),
    R.loadWhatWorked(orgId, month, monthEnd),
    R.loadNextMonth(orgId),
    R.loadLeadingIndicators(orgId),
  ]);

  const hardFigures = R.buildHeadlineFigures(current, previous, null);
  const measuredMonths = series.filter((s) => s.outbound_clicks != null);
  const hasResults = measuredMonths.length > 0;

  return (
    // Full-bleed warm ground. The internal tool sits on a cool neutral; the
    // client surface sits on warm off-white, and that contrast is itself the
    // signal that you have crossed out of the tool and into the document.
    // Negative margins escape the workspace padding applied by the layout.
    <div className="o-report -mx-8 -my-7 min-h-screen bg-o-canvas px-8 py-9 print:m-0 print:p-0">
    <div className="mx-auto max-w-[62rem] pb-24">
      {/* ---- client boundary --------------------------------------- */}
      <div className="print:hidden mb-8 flex items-center justify-between gap-4 rounded-md border border-o-accent/25 bg-o-accent/[0.04] px-4 py-2.5">
        <p className="text-[length:var(--text-o-label)] text-o-ink-2">
          <span className="font-semibold uppercase tracking-[0.08em] text-o-accent">Client-facing</span>
          <span className="mx-2 text-o-hairline-firm">|</span>
          Everything below this line is written for {header.name}. Nothing internal appears on this page.
        </p>
        <Link href={`/client/${orgId}`}
              className="shrink-0 text-[length:var(--text-o-label)] text-o-ink-3 hover:text-o-ink">
          Back to workspace →
        </Link>
      </div>

      {/* ---- masthead ---------------------------------------------- */}
      <header className="mb-12 pb-7 border-b border-o-hairline-firm">
        <Label>Pinterest organic · monthly report</Label>
        <h1 className="o-display mt-2 text-[length:var(--text-o-figure-lg)] font-semibold text-o-ink leading-tight">
          {header.name}
        </h1>
        <p className="mt-1 text-[length:var(--text-o-head)] text-o-ink-2 o-display">
          {MONTH_LABEL(month)}
        </p>
        {series.length > 1 && (
          <nav className="print:hidden mt-4 flex flex-wrap gap-x-4 gap-y-1">
            {series.slice().reverse().map((s) => (
              <Link key={s.month} href={`?month=${s.month.slice(0, 7)}`}
                    className={s.month === month
                      ? "text-[length:var(--text-o-label)] font-medium text-o-ink"
                      : "text-[length:var(--text-o-label)] text-o-ink-3 hover:text-o-ink"}>
                {new Date(s.month + "T00:00:00Z").toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" })}
              </Link>
            ))}
          </nav>
        )}
      </header>

      {/* ================= A · THE HEADLINE ========================== */}
      <Band>
        {headline.approved ? (
          <p className="o-display text-[length:var(--text-o-figure-md)] text-o-ink leading-[1.45] max-w-[46rem]">
            {headline.approved}
          </p>
        ) : headline.generated ? (
          <div>
            <p className="o-display text-[length:var(--text-o-figure-md)] text-o-ink-2 leading-[1.45] max-w-[46rem] italic">
              {headline.generated}
            </p>
            <p className="print:hidden mt-2 text-[length:var(--text-o-label)] text-o-clay">
              Draft — not yet approved. The client sees nothing here until a manager signs it off.
            </p>
          </div>
        ) : (
          <p className="o-display text-[length:var(--text-o-figure-md)] text-o-ink-3 leading-[1.45] max-w-[46rem]">
            {hasResults
              ? "No summary has been written for this month yet."
              : `Pinterest is being built for ${header.name}. The first results month has not closed yet — what follows is the foundation that has been laid.`}
          </p>
        )}

        {/* The hard tier. Nothing else appears at this size. */}
        {current ? (
          <div className="mt-9 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-x-6 gap-y-8">
            {hardFigures.map((h) => (
              <div key={h.label}>
                <Label>{h.label}</Label>
                <div className="mt-2">
                  <Figure
                    value={h.figure.value}
                    size="xl"
                    prefix={h.figure.value != null ? h.currency : undefined}
                    reason={PROVENANCE_REASON[h.figure.state]}
                  />
                </div>
                <div className="mt-1.5 flex items-baseline gap-2">
                  <Movement pct={h.mom_pct} reason="Against the previous month" />
                  {h.figure.value == null && (
                    <span className="text-[length:var(--text-o-label)] text-o-ink-3">
                      {PROVENANCE_LABEL[h.figure.state]}
                    </span>
                  )}
                  {h.figure.value != null && h.mom_pct === null && previous && (
                    <span className="text-[length:var(--text-o-label)] text-o-ink-3">no prior month</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-9">
            <Empty
              headline="This month has not been measured yet."
              body="Results are frozen once a month closes, so the figures a client is shown never move afterwards. Until then this section stays empty rather than showing a partial count that will change."
            />
          </div>
        )}

        {current?.is_partial && (
          <p className="mt-5 text-[length:var(--text-o-label)] text-o-ink-3">
            {MONTH_LABEL(month)} is still in progress. These figures cover the month so far and will settle when it closes.
          </p>
        )}
      </Band>

      {/* ================= B · PERFORMANCE OVER TIME ================= */}
      <Band title="Performance over time"
            sub="Organic compounds. The shape of this line over twelve months is the argument.">
        {measuredMonths.length >= 2 ? (
          <Panel className="px-6 py-6">
            {/* Two series, stacked rather than overlaid. Saves routinely run
                an order of magnitude above outbound clicks, and sharing one
                axis would press the clicks line — the metric that actually
                matters — flat against the floor. Stacked panels share the
                x-range, so the compounding shape reads on both. */}
            <TrendLine
              label="Outbound clicks" color="teal"
              points={series.map((s) => ({ x: s.month, y: s.outbound_clicks }))}
            />
            <div className="mt-6 pt-5 border-t border-o-hairline">
              <TrendLine
                label="Saves" color="sand"
                points={series.map((s) => ({ x: s.month, y: s.pin_saves }))}
              />
            </div>
            <div className="mt-7 pt-6 border-t border-o-hairline">
              <ColumnSeries
                label="Pins published per month — the effort line under the results line"
                points={series.map((s) => ({ x: s.month, y: s.pins_published }))}
              />
            </div>
          </Panel>
        ) : (
          <Empty
            headline="One month is a point, not a line."
            body="This chart begins at the baseline taken during onboarding and runs forward from there. It appears once a second month has closed, because a trend drawn through a single measurement would be a decoration rather than evidence."
          />
        )}
      </Band>

      {/* ============ LEADING · the foundation being built ============ */}
      <Band title="The foundation being built"
            sub="What is in place and working before the traffic arrives. In the first months this is the honest measure of progress.">
        <Panel className="px-6 py-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-7">
            <LeadingStat label="Boards live" value={leading.boards_live}
                         note="Each one a themed surface Pinterest can rank." />
            <LeadingStat label="Topics covered" value={leading.topics_covered}
                         suffix={leading.topics_total ? `of ${leading.topics_total}` : undefined}
                         note="A topic counts as covered at five boards." />
            <LeadingStat label="Keywords validated" value={leading.keywords_validated}
                         note="Checked against real Pinterest search volume." />
            <LeadingStat label="Pins scheduled ahead" value={leading.pins_scheduled_ahead}
                         note="Already designed and queued to publish." />
          </div>
        </Panel>
      </Band>

      {/* ================= C · TRAFFIC QUALITY ======================= */}
      <Band title="Traffic quality"
            sub="Pinterest visitors against your site average. This is where organic wins, and it is not a volume argument.">
        {current?.ga4_connected ? (
          <Panel className="px-6 py-7">
            <PairedBars
              subjectLabel="Pinterest visitors"
              referenceLabel="Site average"
              rows={[
                { label: "Engagement rate", subject: current.ga4_engagement_rate,
                  reference: current.ga4_site_engagement_rate, format: fmtPct },
                { label: "Session duration", subject: current.ga4_session_seconds,
                  reference: current.ga4_site_session_seconds, format: fmtDuration },
                { label: "Pages per session", subject: current.ga4_pages_per_session,
                  reference: current.ga4_site_pages_per_session,
                  format: (v) => v.toFixed(2) },
                { label: "Bounce rate", subject: current.ga4_bounce_rate,
                  reference: current.ga4_site_bounce_rate, format: fmtPct, lowerIsBetter: true },
              ]}
            />
          </Panel>
        ) : (
          <Empty
            headline="Google Analytics is not connected for this store yet."
            body="This comparison shows how Pinterest visitors behave on your site against every other channel — time on page, pages per visit, bounce rate. It is the strongest evidence organic produces, and it needs a GA4 connection to render. We would rather leave it blank than estimate it."
          />
        )}
      </Band>

      {/* ================= D · THE ATTRIBUTION NOTE ================== */}
      <Band title={R.ATTRIBUTION_NOTE.heading}>
        <Panel inset className="px-6 py-7">
          <div className="grid md:grid-cols-[auto_1fr] gap-8 md:gap-10">
            <div className="flex gap-8 md:flex-col md:gap-6 md:border-r md:border-o-hairline md:pr-10">
              <div>
                <Label>Pinterest counted</Label>
                <div className="mt-1.5">
                  <Figure value={current?.outbound_clicks ?? null} size="lg"
                          reason="Outbound clicks reported by Pinterest for this month" />
                </div>
                <p className="mt-0.5 text-[length:var(--text-o-label)] text-o-ink-3">outbound clicks</p>
              </div>
              <div>
                <Label>Google Analytics saw</Label>
                <div className="mt-1.5">
                  <Figure value={current?.ga4_sessions ?? null} size="lg"
                          reason={current?.ga4_connected
                            ? "Sessions GA4 attributed to Pinterest"
                            : "GA4 is not connected for this store"} />
                </div>
                <p className="mt-0.5 text-[length:var(--text-o-label)] text-o-ink-3">sessions from Pinterest</p>
              </div>
            </div>

            <div className="max-w-[38rem]">
              {R.ATTRIBUTION_NOTE.body.map((p, i) => (
                <p key={i} className="text-[length:var(--text-o-body)] text-o-ink-2 leading-relaxed mb-3 last:mb-0">
                  {p}
                </p>
              ))}
              <p className="mt-4 pt-4 border-t border-o-hairline-firm text-[length:var(--text-o-body)] text-o-ink font-medium leading-relaxed">
                {R.ATTRIBUTION_NOTE.rule}
              </p>
            </div>
          </div>
        </Panel>
      </Band>

      {/* ================= E · WHAT WAS BUILT ======================== */}
      <Band title="What was built this month"
            sub="Counted from the work itself, not claimed.">
        {built.some((b) => b.count > 0) ? (
          <Panel className="px-6 py-2">
            {built.map((b) => (
              <Disclosure key={b.label} summary={b.label} count={b.count} note={b.note}
                          items={b.items}
                          columns={b.label.startsWith("Keywords") ? 3 : 2}
                          emptyNote={b.count > 0 && b.items.length === 0
                            ? "Individual items are not itemised for this measure."
                            : undefined} />
            ))}
          </Panel>
        ) : (
          <Empty
            headline="No production work was logged against this month."
            body="Keywords, boards, pins, URLs and competitor analyses appear here as they are completed, each with the list behind it. An empty month here means the work sits in an earlier phase, not that nothing happened."
          />
        )}
      </Band>

      {/* ================= F · STRATEGY ASSETS ======================= */}
      <Band title="Strategy assets"
            sub="Built once, and they keep paying. These are yours.">
        <div className="space-y-5">
          {/* Board architecture */}
          <Panel className="px-6 py-5">
            <Label>Board architecture</Label>
            {assets.boards.length ? (
              <div className="mt-3 -mx-1">
                <table className="w-full text-[length:var(--text-o-body)]">
                  <thead>
                    <tr className="text-o-ink-3 text-left">
                      <th className="font-normal pb-2 px-1">Board</th>
                      <th className="font-normal pb-2 px-1">Topic</th>
                      <th className="font-normal pb-2 px-1">Keyword focus</th>
                      <th className="font-normal pb-2 px-1 text-right">Pins</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assets.boards.map((b, i) => (
                      <tr key={`${b.name}-${i}`} className="border-t border-o-hairline">
                        <td className="py-2 px-1 text-o-ink">{b.name}</td>
                        <td className="py-2 px-1 text-o-ink-2">{b.topic ?? "—"}</td>
                        <td className="py-2 px-1 text-o-ink-2">{b.primary_keyword ?? "—"}</td>
                        <td className="py-2 px-1 text-right o-num text-o-ink-2 tabular-nums">{b.pin_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-2 text-[length:var(--text-o-body)] text-o-ink-3">
                The board structure is designed in phase 3 and appears here once it is live on Pinterest.
              </p>
            )}
            {assets.boards_inherited > 0 && (
              <p className="mt-3 pt-3 border-t border-o-hairline text-[length:var(--text-o-label)] text-o-ink-3">
                {assets.boards_inherited} board{assets.boards_inherited === 1 ? "" : "s"} already existed
                on your account and {assets.boards_inherited === 1 ? "is" : "are"} managed alongside
                these, but {assets.boards_inherited === 1 ? "it is" : "they are"} not counted as
                architecture we built.
              </p>
            )}
          </Panel>

          {/* Keyword bank */}
          <Panel className="px-6 py-5">
            <Label>The keyword bank</Label>
            {assets.keyword_clusters.length ? (
              <div className="mt-4 space-y-5">
                {assets.keyword_clusters.map((c) => (
                  <div key={c.cluster}>
                    <p className="text-[length:var(--text-o-body)] text-o-ink font-medium">
                      {c.cluster}
                      <span className="ml-2 font-normal text-o-ink-3">{c.axis.toLowerCase()}</span>
                    </p>
                    <p className="mt-1 text-[length:var(--text-o-body)] text-o-ink-2 leading-relaxed">
                      {c.terms.slice(0, 24).map((t) =>
                        t.volume != null ? `${t.term} (${t.volume.toLocaleString("en-US")})` : t.term
                      ).join(" · ")}
                      {c.terms.length > 24 && ` · +${c.terms.length - 24} more`}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-[length:var(--text-o-body)] text-o-ink-3">
                Validated search terms, grouped by cluster, with their monthly Pinterest volume. Built during phase 3.
              </p>
            )}
          </Panel>

          {/* Taste graph */}
          <Panel className="px-6 py-5">
            <Label>Taste graph</Label>
            {assets.taste_graph ? (
              <div className="mt-4 grid sm:grid-cols-3 gap-6">
                <TasteColumn title="Content angles" items={assets.taste_graph.content_angles} />
                <TasteColumn title="Visual worlds" items={assets.taste_graph.visual_worlds} />
                <TasteColumn title="Key moments" items={assets.taste_graph.key_moments} />
              </div>
            ) : (
              <p className="mt-2 text-[length:var(--text-o-body)] text-o-ink-3">
                The three angles, three worlds and three moments that define what your brand looks like on Pinterest. Built during phase 2.
              </p>
            )}
          </Panel>

          {/* Content calendar */}
          {assets.seasonal_calendar.length > 0 && (
            <Panel className="px-6 py-5">
              <Label>Content calendar</Label>
              <p className="mt-1 text-[length:var(--text-o-label)] text-o-ink-3">
                Pinterest peaks run 30–45 days ahead of the buying season, so we publish before the search happens.
              </p>
              <ul className="mt-3 space-y-1.5">
                {assets.seasonal_calendar.map((s, i) => (
                  <li key={`${s.term}-${i}`} className="text-[length:var(--text-o-body)] text-o-ink-2">
                    <span className="text-o-ink">{s.term}</span>
                    {s.publish_from && <> — publish from {s.publish_from}</>}
                    {s.peak_start && <>, peaks {s.peak_start}</>}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </Band>

      {/* ================= G · WHAT WORKED =========================== */}
      <Band title="What worked, and why"
            sub="Every decision is tested against the next month's data rather than repeated.">
        {(worked.top_pins.length || worked.by_intent.length || worked.by_breadth.length || worked.by_reason.length) ? (
          <div className="space-y-5">
            {worked.top_pins.length > 0 && (
              <Panel className="px-6 py-5">
                <Label>Top pins this month</Label>
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                  {worked.top_pins.map((p) => (
                    <figure key={p.pin_id}>
                      <div className="aspect-[2/3] rounded-sm bg-o-sunk border border-o-hairline overflow-hidden">
                        {p.image_path && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.image_path} alt={`Design ${p.design}, variant ${p.variant}`}
                               className="w-full h-full object-cover" />
                        )}
                      </div>
                      <figcaption className="mt-1.5">
                        <span className="block o-num text-[length:var(--text-o-body)] font-semibold text-o-ink">
                          {p.clicks.toLocaleString("en-US")}
                        </span>
                        <span className="block text-[length:var(--text-o-label)] text-o-ink-3">
                          clicks · {p.saves.toLocaleString("en-US")} saves
                        </span>
                        {p.board && (
                          <span className="block text-[length:var(--text-o-label)] text-o-ink-3 truncate" title={p.board}>
                            {p.board}
                          </span>
                        )}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </Panel>
            )}

            <div className="grid md:grid-cols-3 gap-5">
              <WorkedPanel title="By design intent" rows={worked.by_intent} color="teal" />
              <WorkedPanel title="By board type" rows={worked.by_breadth} color="slate" />
              <WorkedPanel title="By why the page was chosen" rows={worked.by_reason} color="sand" />
            </div>
          </div>
        ) : (
          <Empty
            headline="No pin performance has come back for this month yet."
            body="Pinterest reports pin-level results on a delay, and a pin needs to be live for roughly two weeks before its numbers mean anything. Once they arrive, this section shows which designs, which board types and which page choices earned their place — and which did not."
          />
        )}
      </Band>

      {/* ================= H · NEXT MONTH ============================ */}
      <Band title="Next month"
            sub="What we are moving on, and what we would do if this were our store.">
        <div className="grid md:grid-cols-2 gap-5">
          <Panel className="px-6 py-5">
            <Label>Queued for production</Label>
            {next.queued_urls.length ? (
              <ul className="mt-3 space-y-2">
                {next.queued_urls.map((u, i) => (
                  <li key={`${u.name}-${i}`} className="text-[length:var(--text-o-body)]">
                    <span className="text-o-ink">{u.name}</span>
                    <span className="text-o-ink-3"> — {u.reason}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[length:var(--text-o-body)] text-o-ink-3">
                The next cycle&rsquo;s pages are selected at the start of the month.
              </p>
            )}
          </Panel>

          <Panel className="px-6 py-5">
            <Label>Rising on Pinterest in your niche</Label>
            {next.rising_trends.length ? (
              <p className="mt-3 text-[length:var(--text-o-body)] text-o-ink-2 leading-relaxed">
                {next.rising_trends.join(" · ")}
              </p>
            ) : (
              <p className="mt-2 text-[length:var(--text-o-body)] text-o-ink-3">
                Checked monthly against Pinterest Trends. Nothing has been flagged for this cycle.
              </p>
            )}
            {next.opening_seasonal.length > 0 && (
              <div className="mt-5 pt-4 border-t border-o-hairline">
                <Label>Seasonal windows opening</Label>
                <ul className="mt-2 space-y-1">
                  {next.opening_seasonal.map((s, i) => (
                    <li key={`${s.term}-${i}`} className="text-[length:var(--text-o-body)] text-o-ink-2">
                      <span className="text-o-ink">{s.term}</span>
                      {s.publish_from && <> — start publishing {s.publish_from}</>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Panel>
        </div>

        {next.notes && (
          <Panel className="mt-5 px-6 py-5">
            <Label>Our recommendation</Label>
            <p className="mt-2.5 text-[length:var(--text-o-body)] text-o-ink-2 leading-relaxed whitespace-pre-line max-w-[46rem]">
              {next.notes}
            </p>
          </Panel>
        )}
      </Band>

      {/* ========== SOFT TIER · distribution & reach, low and quiet === */}
      {current && (
        <details className="mt-14 pt-7 border-t border-o-hairline">
          <summary className="cursor-pointer list-none">
            <Label className="inline">Distribution &amp; reach</Label>
            <span className="ml-3 text-[length:var(--text-o-label)] text-o-ink-3">
              impressions, engagements and saves — context, not outcomes
            </span>
          </summary>
          <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-6">
            <SoftStat label="Impressions" value={current.impressions} />
            <SoftStat label="Engagements" value={current.engagements} />
            <SoftStat label="Saves" value={current.pin_saves} />
            <SoftStat label="Engagement rate" value={current.engagement_rate}
                      render={(v) => fmtPct(v)} />
          </div>
          {(current.other_impressions != null || current.other_saves != null) && (
            <p className="mt-5 text-[length:var(--text-o-label)] text-o-ink-3 leading-relaxed max-w-[42rem]">
              A further {(current.other_impressions ?? 0).toLocaleString("en-US")} impressions and{" "}
              {(current.other_saves ?? 0).toLocaleString("en-US")} saves came from pins your own visitors
              saved from your site. Real reach, but not work we did, so it is kept out of the
              figures above.
            </p>
          )}
        </details>
      )}

      <footer className="mt-14 pt-6 border-t border-o-hairline text-[length:var(--text-o-label)] text-o-ink-3">
        Pinformance Agency · Pinterest organic · {MONTH_LABEL(month)}
        {header.domain && <> · {header.domain}</>}
      </footer>
    </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Local pieces
 * ------------------------------------------------------------------ */

function LeadingStat({ label, value, suffix, note }: {
  label: string; value: number | null; suffix?: string; note: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <Figure value={value} size="md" />
        {suffix && value != null && (
          <span className="text-[length:var(--text-o-label)] text-o-ink-3">{suffix}</span>
        )}
      </div>
      <p className="mt-1 text-[length:var(--text-o-label)] text-o-ink-3 leading-snug">{note}</p>
    </div>
  );
}

function SoftStat({ label, value, render }: {
  label: string; value: number | null; render?: (v: number) => string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <p className="mt-1 o-num text-[length:var(--text-o-body)] text-o-ink-2 tabular-nums">
        {value == null ? "—" : render ? render(value) : value.toLocaleString("en-US")}
      </p>
    </div>
  );
}

function TasteColumn({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-[length:var(--text-o-label)] uppercase tracking-[0.08em] text-o-ink-3 font-medium">
        {title}
      </p>
      <ul className="mt-2 space-y-1">
        {items.length
          ? items.map((it, i) => (
              <li key={`${it}-${i}`} className="text-[length:var(--text-o-body)] text-o-ink-2 leading-relaxed">
                {it}
              </li>
            ))
          : <li className="text-[length:var(--text-o-body)] text-o-ink-3">—</li>}
      </ul>
    </div>
  );
}

function WorkedPanel({ title, rows, color }: {
  title: string;
  rows: Array<{ label: string; clicks: number; saves: number; pins: number }>;
  color: "teal" | "sand" | "slate";
}) {
  if (!rows.length) return null;
  return (
    <Panel className="px-6 py-5">
      <Label>{title}</Label>
      <div className="mt-4">
        <BarList
          color={color}
          data={rows.map((r) => ({
            label: r.label,
            value: r.clicks,
            note: `${r.pins} pin${r.pins === 1 ? "" : "s"} · ${r.saves.toLocaleString("en-US")} saves`,
          }))}
        />
      </div>
    </Panel>
  );
}
