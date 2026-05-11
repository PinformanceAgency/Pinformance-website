"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Sparkles,
  TrendingUp,
  Rocket,
  ArrowUpDown,
  AlertCircle,
  ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useOrg } from "@/hooks/use-org";

type TimeFrame = "7" | "14" | "30";
type RecentLimit = 5 | 10 | 15;
type SortDir = "asc" | "desc";

interface PinRow {
  id: string;
  title: string;
  image_url: string | null;
  posted_at: string | null;
  created_at: string;
  spend: number | null;
  revenue: number | null;
  purchases: number | null;
}

interface DisplayRow extends PinRow {
  roas: number | null;
  cpa: number | null;
}

interface ApiResponse {
  pins: PinRow[];
  ads_connected: boolean;
  reason?: string;
  error?: string;
  currency?: string;
}

function computeMetrics(row: PinRow): { roas: number | null; cpa: number | null } {
  if (row.spend == null || row.revenue == null) return { roas: null, cpa: null };
  const roas = row.spend > 0 ? row.revenue / row.spend : 0;
  const cpa = row.purchases && row.purchases > 0 ? row.spend / row.purchases : null;
  return { roas, cpa };
}

const fmtCurrency = (n: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
const fmtNum = (n: number) => new Intl.NumberFormat("en-US").format(n);
const fmtRoas = (n: number) => `${n.toFixed(2)}x`;
const dash = "—";

export default function PaidAdsCreativesPage() {
  const { org } = useOrg();
  const [timeFrame, setTimeFrame] = useState<TimeFrame>("30");
  const [recentLimit, setRecentLimit] = useState<RecentLimit>(10);
  const [recentSort, setRecentSort] = useState<SortDir>("desc");
  const [pins, setPins] = useState<PinRow[]>([]);
  const [pinsLoading, setPinsLoading] = useState(true);
  const [adsConnected, setAdsConnected] = useState(false);
  const [connectionReason, setConnectionReason] = useState<string | undefined>();
  const [currency, setCurrency] = useState("USD");

  useEffect(() => {
    if (!org) return;
    let cancelled = false;

    async function load() {
      setPinsLoading(true);
      try {
        const res = await fetch(`/api/pinterest/ads-performance?days=${timeFrame}`);
        const json = (await res.json()) as ApiResponse;
        if (cancelled) return;
        setPins(json.pins || []);
        setAdsConnected(!!json.ads_connected);
        setConnectionReason(json.reason);
        if (json.currency) setCurrency(json.currency);
      } catch {
        if (!cancelled) {
          setPins([]);
          setAdsConnected(false);
          setConnectionReason("fetch_failed");
        }
      } finally {
        if (!cancelled) setPinsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [org, timeFrame]);

  const hasAdsData = useMemo(() => pins.some((p) => p.spend != null && p.spend > 0), [pins]);

  const topPins: DisplayRow[] = useMemo(() => {
    const withMetrics = pins.map((p) => ({ ...p, ...computeMetrics(p) }));
    // Sort by ROAS desc when we have it, otherwise fall back to most recent.
    return [...withMetrics]
      .sort((a, b) => {
        const ar = a.roas ?? -Infinity;
        const br = b.roas ?? -Infinity;
        if (ar === br) {
          return (b.posted_at || b.created_at).localeCompare(a.posted_at || a.created_at);
        }
        return br - ar;
      })
      .slice(0, 10);
  }, [pins]);

  const recentPins: DisplayRow[] = useMemo(() => {
    const withMetrics = pins.map((p) => ({ ...p, ...computeMetrics(p) }));
    return [...withMetrics]
      .sort((a, b) => {
        // If no ad data, sort by launched date desc as fallback.
        if (a.spend == null && b.spend == null) {
          return (b.posted_at || b.created_at).localeCompare(a.posted_at || a.created_at);
        }
        const av = a.spend ?? 0;
        const bv = b.spend ?? 0;
        return recentSort === "desc" ? bv - av : av - bv;
      })
      .slice(0, recentLimit);
  }, [pins, recentLimit, recentSort]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Paid Ads — Creatives</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Track performance of pins running in paid Pinterest campaigns.
          </p>
        </div>
      </div>

      {!hasAdsData && !pinsLoading && (
        <ConnectionBanner adsConnected={adsConnected} reason={connectionReason} />
      )}

      {/* Top performing pins */}
      <section className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Top performing pins</h2>
            <span className="text-xs text-muted-foreground">
              {hasAdsData ? "sorted by ROAS (high → low)" : "ROAS data not available yet"}
            </span>
          </div>
          <TimeFrameToggle value={timeFrame} onChange={setTimeFrame} />
        </div>
        <PinPerformanceTable pins={topPins} loading={pinsLoading} currency={currency} />
      </section>

      {/* Recently launched */}
      <section className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Rocket className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Recently launched</h2>
            <span className="text-xs text-muted-foreground">
              {hasAdsData ? "by spend" : "by launch date (spend data pending)"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <LimitToggle value={recentLimit} onChange={setRecentLimit} />
            <SortToggle value={recentSort} onChange={setRecentSort} disabled={!hasAdsData} />
          </div>
        </div>
        <PinPerformanceTable pins={recentPins} loading={pinsLoading} currency={currency} />
      </section>
    </div>
  );
}

function ConnectionBanner({
  adsConnected,
  reason,
}: {
  adsConnected: boolean;
  reason?: string;
}) {
  let title = "Ads reporting not connected yet";
  let body: React.ReactNode = (
    <>
      Connect your ad account in{" "}
      <Link href="/integrations" className="text-primary hover:underline">
        Integrations
      </Link>{" "}
      to populate spend, ROAS, CPA, revenue and purchases.
    </>
  );

  if (adsConnected && reason === "no_promoted_pins") {
    title = "No promoted pins in this period";
    body = (
      <>
        Your ad account is connected, but no pins in the selected timeframe are running in
        a paid campaign. Once pins are promoted, their performance will appear here.
      </>
    );
  } else if (adsConnected) {
    title = "No paid performance data yet";
    body = (
      <>
        Pinterest returned no spend for these pins in the selected period. Try a longer
        timeframe, or promote pins via the Pinterest Ads Manager.
      </>
    );
  } else if (reason === "no_ad_account") {
    title = "Pinterest account has no ad accounts";
    body = (
      <>
        Your Pinterest connection works, but the account has no ad accounts attached. Set
        one up in Pinterest Ads Manager, then refresh this page.
      </>
    );
  } else if (reason === "fetch_failed") {
    title = "Could not load ads data";
    body = (
      <>
        Pinterest returned an error when fetching ad analytics. This usually means the
        connected token does not include the <code className="px-1 rounded bg-muted text-xs">ads:read</code> scope. Reconnect Pinterest from{" "}
        <Link href="/integrations" className="text-primary hover:underline">
          Integrations
        </Link>
        .
      </>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
      <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <div className="font-medium text-foreground">{title}</div>
        <p className="text-muted-foreground mt-1 leading-relaxed">{body}</p>
      </div>
    </div>
  );
}

function TimeFrameToggle({
  value,
  onChange,
}: {
  value: TimeFrame;
  onChange: (v: TimeFrame) => void;
}) {
  const opts: { key: TimeFrame; label: string }[] = [
    { key: "7", label: "Last 7 days" },
    { key: "14", label: "Last 14 days" },
    { key: "30", label: "Last 30 days" },
  ];
  return (
    <div className="inline-flex bg-muted rounded-lg p-1">
      {opts.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={cn(
            "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
            value === o.key
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function LimitToggle({
  value,
  onChange,
}: {
  value: RecentLimit;
  onChange: (v: RecentLimit) => void;
}) {
  const opts: RecentLimit[] = [5, 10, 15];
  return (
    <div className="inline-flex bg-muted rounded-lg p-1">
      {opts.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={cn(
            "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
            value === o
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {o} pins
        </button>
      ))}
    </div>
  );
}

function SortToggle({
  value,
  onChange,
  disabled,
}: {
  value: SortDir;
  onChange: (v: SortDir) => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={() => onChange(value === "desc" ? "asc" : "desc")}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-card text-foreground hover:bg-muted transition-colors",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      <ArrowUpDown className="w-3.5 h-3.5" />
      Spend {value === "desc" ? "high → low" : "low → high"}
    </button>
  );
}

function PinPerformanceTable({
  pins,
  loading,
  currency,
}: {
  pins: DisplayRow[];
  loading: boolean;
  currency: string;
}) {
  if (loading) {
    return <div className="h-48 bg-muted animate-pulse rounded-xl" />;
  }
  if (pins.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
        No pins found for this period.
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="text-left font-medium px-4 py-3">Pin</th>
              <th className="text-right font-medium px-4 py-3">ROAS</th>
              <th className="text-right font-medium px-4 py-3">CPA</th>
              <th className="text-right font-medium px-4 py-3">Revenue</th>
              <th className="text-right font-medium px-4 py-3">Spend</th>
              <th className="text-right font-medium px-4 py-3">Purchases</th>
            </tr>
          </thead>
          <tbody>
            {pins.map((p) => {
              const launchedDate = p.posted_at || p.created_at;
              return (
                <tr key={p.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-muted flex-shrink-0 overflow-hidden flex items-center justify-center">
                        {p.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.image_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <ImageIcon className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium truncate">{p.title}</div>
                        <div className="text-[11px] text-muted-foreground">
                          Launched {new Date(launchedDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td
                    className={cn(
                      "px-4 py-3 text-right font-medium tabular-nums",
                      p.roas == null
                        ? "text-muted-foreground"
                        : p.roas >= 3
                          ? "text-emerald-600 dark:text-emerald-400"
                          : p.roas >= 1.5
                            ? "text-foreground"
                            : "text-amber-600 dark:text-amber-400"
                    )}
                  >
                    {p.roas == null ? dash : fmtRoas(p.roas)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">
                    {p.cpa == null ? dash : fmtCurrency(p.cpa, currency)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">
                    {p.revenue == null ? dash : fmtCurrency(p.revenue, currency)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">
                    {p.spend == null ? dash : fmtCurrency(p.spend, currency)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">
                    {p.purchases == null ? dash : fmtNum(p.purchases)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
