/**
 * AGENCY · This week — organic per brand, one week at a time.
 *
 * Reach comes from Pinterest by itself (own image + video pins). Organic
 * revenue is copied from Conversion Insights per store on step 5, so a store
 * without it says "not entered" rather than showing a zero: nobody measured
 * zero. See lib/organic/weekly.ts.
 */
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addWeeks, loadAgencyWeekly, type WeekRow } from "@/lib/organic/weekly";
import { Band, Panel } from "@/components/organic/primitives";
import { Table, TH, TD, Pill, Metric, Toolbar } from "@/components/organic/internal";
import { cn } from "@/lib/utils";
import { TopPinCell } from "../../TopPinCell";

export const dynamic = "force-dynamic";

const nf = (v: number | null) =>
  v === null ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: 0 });

function money(v: number | null, currency: string | null): string {
  if (v === null) return "—";
  const sym = currency === "EUR" ? "€" : currency === "USD" ? "$" : currency === "GBP" ? "£" : currency ? `${currency} ` : "";
  return `${sym}${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function weekLabel(start: string): string {
  const d = new Date(start + "T00:00:00Z");
  const end = new Date(d.getTime() + 6 * 86_400_000);
  const f = (x: Date) => x.toLocaleDateString("en-US", { day: "numeric", month: "short", timeZone: "UTC" });
  return `${f(d)} – ${f(end)}`;
}

/** Week-on-week change. Null when either side was not measured: a change
 *  against an absent week is an unknown, not a percentage. */
function Delta({ now, prev }: { now: number | null; prev: number | null }) {
  if (now === null || prev === null || prev === 0) return null;
  const pct = ((now - prev) / prev) * 100;
  if (Math.abs(pct) < 0.5) return <span className="ml-1.5 text-o-ink-3">±0%</span>;
  return (
    <span className={cn("ml-1.5 tabular-nums", pct > 0 ? "text-emerald-700" : "text-o-accent")}>
      {pct > 0 ? "+" : ""}{pct.toFixed(0)}%
    </span>
  );
}

const entered = (w: WeekRow) => w.revenue_organic !== null;

export default async function AgencyWeeklyPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week } = await searchParams;
  const data = await loadAgencyWeekly(week);
  const measured = data.stores.filter((s) => s.week.impressions !== null);
  const withRevenue = data.stores.filter((s) => entered(s.week));
  const missing = data.stores.filter((s) => !entered(s.week));
  // Stores with revenue first (highest first), then by reach.
  const rows = [...data.stores].sort(
    (a, b) =>
      (b.week.revenue_organic ?? -1) - (a.week.revenue_organic ?? -1) ||
      (b.week.impressions ?? -1) - (a.week.impressions ?? -1),
  );

  return (
    <div>
      <Toolbar>
        <div className="flex items-center gap-2">
          <Link href={`/agency/weekly?week=${addWeeks(data.week_start, -1)}`} className="o-btn o-btn-ghost" aria-label="Previous week">
            <ChevronLeft className="w-4 h-4" />
          </Link>
          <span className="font-medium text-o-ink tabular-nums">{weekLabel(data.week_start)}</span>
          {data.latest ? (
            <span className="o-btn o-btn-ghost opacity-30" aria-hidden><ChevronRight className="w-4 h-4" /></span>
          ) : (
            <Link href={`/agency/weekly?week=${addWeeks(data.week_start, 1)}`} className="o-btn o-btn-ghost" aria-label="Next week">
              <ChevronRight className="w-4 h-4" />
            </Link>
          )}
        </div>
      </Toolbar>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
        <Metric label="Stores measured" value={`${measured.length} / ${data.stores.length}`} hint="reach from Pinterest" />
        <Metric label="Revenue entered" value={`${withRevenue.length} / ${data.stores.length}`}
          tone={missing.length > 0 ? "warn" : "good"} hint="from Conversion Insights" />
        <Metric label="Still to enter" value={missing.length} tone={missing.length > 0 ? "warn" : undefined}
          hint="open the store's step 5" />
      </div>

      <Band
        title="Organic per brand"
        sub="Own image and video pins only — product pins run on paid and are left out. Posts are own pins created that week, board-warming saves not counted. Followers are counted daily from 28 Sep 2026; Pinterest keeps no history. Revenue is Conversion Insights' organic column, with each brand's own conversion window."
      >
        <Table>
          <thead>
            <tr>
              <TH>Store</TH>
              <TH align="right">Impressions</TH>
              <TH align="right">Saves</TH>
              <TH align="right">Outbound clicks</TH>
              <TH align="right">Followers</TH>
              <TH align="right">Posts</TH>
              <TH>Top post</TH>
              <TH align="right">Organic revenue</TH>
              <TH align="right">Checkouts</TH>
              <TH>Window</TH>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.org_id}>
                <TD>
                  <Link href={`/client/${s.org_id}/phase/5`} className="font-medium text-o-ink hover:underline">
                    {s.name}
                  </Link>
                  {s.week.is_partial && <span className="ml-2"><Pill tone="warn">still coming in</Pill></span>}
                </TD>
                <TD align="right">{nf(s.week.impressions)}<Delta now={s.week.impressions} prev={s.previous.impressions} /></TD>
                <TD align="right">{nf(s.week.pin_saves)}<Delta now={s.week.pin_saves} prev={s.previous.pin_saves} /></TD>
                <TD align="right">{nf(s.week.outbound_clicks)}<Delta now={s.week.outbound_clicks} prev={s.previous.outbound_clicks} /></TD>
                <TD align="right">{nf(s.week.followers)}<Delta now={s.week.followers} prev={s.previous.followers} /></TD>
                <TD align="right">{nf(s.week.posts_published)}<Delta now={s.week.posts_published} prev={s.previous.posts_published} /></TD>
                <TD><TopPinCell pin={s.week.top_pin} /></TD>
                <TD align="right">
                  {entered(s.week) ? (
                    <>
                      <span className="font-medium text-o-ink">{money(s.week.revenue_organic, s.currency)}</span>
                      <Delta now={s.week.revenue_organic} prev={s.previous.revenue_organic} />
                    </>
                  ) : (
                    <Link href={`/client/${s.org_id}/phase/5`} className="text-o-accent hover:underline">
                      not entered
                    </Link>
                  )}
                </TD>
                <TD align="right">{nf(s.week.checkouts)}</TD>
                <TD muted>{s.window.click}/{s.window.view}{s.window.is_default ? " (default)" : ""}</TD>
              </tr>
            ))}
          </tbody>
        </Table>
      </Band>

      {data.stores.length > measured.length && (
        <Panel inset className="mt-4 p-4 text-[length:var(--text-o-body)] text-o-ink-2">
          No reach for {data.stores.filter((s) => s.week.impressions === null).map((s) => s.name).join(", ")} —
          no Pinterest connection, or the account did not exist yet that week.
        </Panel>
      )}
    </div>
  );
}
