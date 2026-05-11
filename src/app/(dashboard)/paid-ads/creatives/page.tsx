"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Sparkles,
  TrendingUp,
  Rocket,
  ArrowUpDown,
  AlertCircle,
  ImageIcon,
  Settings as SettingsIcon,
  Check,
  ChevronDown,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useOrg } from "@/hooks/use-org";
import {
  DateRangePicker,
  SinceDatePicker,
  presetToRange,
  type DateRange,
} from "@/components/shared/date-range-picker";

type RecentLimit = 5 | 10 | 15;
type KpiKey = "roas" | "cpa" | "revenue" | "spend" | "checkouts";
type ConversionWindow =
  | "30/1"
  | "30/7"
  | "7/7"
  | "7/1"
  | "1/1"
  | "30/30";

const CONVERSION_WINDOWS: { key: ConversionWindow; click: number; view: number; label: string }[] = [
  { key: "30/1", click: 30, view: 1, label: "30-day click / 1-day view" },
  { key: "30/7", click: 30, view: 7, label: "30-day click / 7-day view" },
  { key: "30/30", click: 30, view: 30, label: "30-day click / 30-day view" },
  { key: "7/7", click: 7, view: 7, label: "7-day click / 7-day view" },
  { key: "7/1", click: 7, view: 1, label: "7-day click / 1-day view" },
  { key: "1/1", click: 1, view: 1, label: "1-day click / 1-day view" },
];

const CONVERSION_SETTINGS_KEY = "paid-ads:conversion-window";

const KPI_OPTIONS: { key: KpiKey; label: string; direction: "asc" | "desc" }[] = [
  { key: "roas", label: "ROAS (high → low)", direction: "desc" },
  { key: "cpa", label: "CPA (low → high)", direction: "asc" },
  { key: "revenue", label: "Revenue (high → low)", direction: "desc" },
  { key: "spend", label: "Spend (high → low)", direction: "desc" },
  { key: "checkouts", label: "Checkouts (high → low)", direction: "desc" },
];

function sortByKpi(rows: AdRow[], kpi: KpiKey): AdRow[] {
  const option = KPI_OPTIONS.find((o) => o.key === kpi)!;
  const getVal = (r: AdRow): number => {
    switch (kpi) {
      case "roas":
        return r.roas ?? -Infinity;
      case "cpa":
        // null/0 CPA = no data → push to bottom (treat as +Infinity for asc).
        return r.cpa != null && r.cpa > 0 ? r.cpa : Number.POSITIVE_INFINITY;
      case "revenue":
        return r.revenue ?? -Infinity;
      case "spend":
        return r.spend ?? -Infinity;
      case "checkouts":
        return r.purchases ?? -Infinity;
    }
  };
  return [...rows].sort((a, b) => {
    const av = getVal(a);
    const bv = getVal(b);
    return option.direction === "desc" ? bv - av : av - bv;
  });
}

interface AdRow {
  ad_id: string;
  ad_name: string;
  pin_id: string | null;
  ad_group_id: string | null;
  campaign_id: string | null;
  status: string | null;
  created_at: string | null;
  image_url: string | null;
  spend: number | null;
  revenue: number | null;
  purchases: number | null;
  impressions: number | null;
  clicks: number | null;
  ctr: number | null;
  cpm: number | null;
  cpc: number | null;
  roas: number | null;
  cpa: number | null;
}

interface ApiResponse {
  ads: AdRow[];
  ads_connected: boolean;
  ad_account_id?: string;
  ad_account_name?: string;
  currency?: string;
  reason?: string;
  error?: string;
  start_date?: string;
  end_date?: string;
}

const fmtCurrency = (n: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
const fmtNum = (n: number) => new Intl.NumberFormat("en-US").format(n);
const fmtRoas = (n: number) => `${n.toFixed(2)}x`;
const dash = "—";

export default function PaidAdsCreativesPage() {
  const { org } = useOrg();
  // Default to "Last 7 days" since Pinterest reports have ~1 day delay; today
  // would be incomplete.
  const [dateRange, setDateRange] = useState<DateRange>(() => presetToRange(7));
  const [recentLimit, setRecentLimit] = useState<RecentLimit>(10);
  const [topKpi, setTopKpi] = useState<KpiKey>("roas");
  const [recentKpi, setRecentKpi] = useState<KpiKey>("spend");
  // Default: ads launched in the last 14 days.
  const [recentSince, setRecentSince] = useState<string>(() => presetToRange(14).start);
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [ads, setAds] = useState<AdRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [adsConnected, setAdsConnected] = useState(false);
  const [connectionReason, setConnectionReason] = useState<string | undefined>();
  const [connectionError, setConnectionError] = useState<string | undefined>();
  const [currency, setCurrency] = useState("USD");
  const [adAccountName, setAdAccountName] = useState<string | undefined>();
  const [conversionWindow, setConversionWindow] = useState<ConversionWindow>("30/1");

  // Restore persisted conversion window on mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(CONVERSION_SETTINGS_KEY);
    if (saved && CONVERSION_WINDOWS.some((w) => w.key === saved)) {
      setConversionWindow(saved as ConversionWindow);
    }
  }, []);

  function updateConversionWindow(w: ConversionWindow) {
    setConversionWindow(w);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(CONVERSION_SETTINGS_KEY, w);
    }
  }

  useEffect(() => {
    if (!org) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const cw = CONVERSION_WINDOWS.find((w) => w.key === conversionWindow)!;
        const qs = new URLSearchParams({
          start_date: dateRange.start,
          end_date: dateRange.end,
          click_window: String(cw.click),
          view_window: String(cw.view),
          report_time: "TIME_OF_CONVERSION",
        });
        const res = await fetch(`/api/pinterest/ads-performance?${qs}`, {
          cache: "no-store",
        });
        const json = (await res.json()) as ApiResponse;
        if (cancelled) return;
        setAds(json.ads || []);
        setAdsConnected(!!json.ads_connected);
        setConnectionReason(json.reason);
        setConnectionError(json.error);
        if (json.currency) setCurrency(json.currency);
        if (json.ad_account_name) setAdAccountName(json.ad_account_name);
        setLastRefreshed(new Date());
      } catch (e) {
        if (!cancelled) {
          setAds([]);
          setAdsConnected(false);
          setConnectionReason("fetch_failed");
          setConnectionError(e instanceof Error ? e.message : "Unknown");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [org, dateRange, conversionWindow, refreshKey]);

  const adsWithSpend = useMemo(() => ads.filter((a) => a.spend != null && a.spend > 0), [ads]);
  const hasAdsData = adsWithSpend.length > 0;

  const topPerformers = useMemo(() => {
    return sortByKpi(adsWithSpend, topKpi).slice(0, 10);
  }, [adsWithSpend, topKpi]);

  // Recently launched: ads created on or after the chosen "since" date,
  // then ranked by the selected KPI, then trimmed to the limit.
  const recent = useMemo(() => {
    const sinceCutoff = recentSince + "T00:00:00Z";
    const launchedSince = ads.filter(
      (a) => a.created_at && a.created_at >= sinceCutoff
    );
    return sortByKpi(launchedSince, recentKpi).slice(0, recentLimit);
  }, [ads, recentLimit, recentKpi, recentSince]);

  // Aggregate row for headline KPIs.
  const totals = useMemo(() => {
    const t = { spend: 0, revenue: 0, purchases: 0, impressions: 0, clicks: 0 };
    for (const a of adsWithSpend) {
      t.spend += a.spend ?? 0;
      t.revenue += a.revenue ?? 0;
      t.purchases += a.purchases ?? 0;
      t.impressions += a.impressions ?? 0;
      t.clicks += a.clicks ?? 0;
    }
    return {
      ...t,
      roas: t.spend > 0 ? t.revenue / t.spend : 0,
      cpa: t.purchases > 0 ? t.spend / t.purchases : 0,
      ctr: t.impressions > 0 ? (t.clicks / t.impressions) * 100 : 0,
    };
  }, [adsWithSpend]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Paid Ads — Creatives</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {adAccountName
                ? `Performance per ad in ${adAccountName} (Pinterest Ads).`
                : "Performance per ad from Pinterest Ads."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ConversionSettings value={conversionWindow} onChange={updateConversionWindow} />
          <DateRangePicker value={dateRange} onChange={setDateRange} />
          <button
            onClick={() => setRefreshKey((k) => k + 1)}
            disabled={loading}
            title="Refresh from Pinterest"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-border bg-card text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
            Refresh
          </button>
        </div>
      </div>

      {/* Query trace — exact params we sent to Pinterest, for comparison
          against Campaign Manager. */}
      <div className="text-[11px] text-muted-foreground flex items-center gap-3 flex-wrap">
        <span>
          Query: <strong className="text-foreground">{dateRange.start}</strong> →{" "}
          <strong className="text-foreground">{dateRange.end}</strong>
        </span>
        <span>·</span>
        <span>
          Conversion window <strong className="text-foreground">{conversionWindow}</strong>
        </span>
        <span>·</span>
        <span>Date of conversion event</span>
        {lastRefreshed && (
          <>
            <span>·</span>
            <span>Refreshed {lastRefreshed.toLocaleTimeString("en-US")}</span>
          </>
        )}
      </div>

      {hasAdsData && <KpiRow totals={totals} currency={currency} count={adsWithSpend.length} />}

      {!hasAdsData && !loading && (
        <ConnectionBanner
          adsConnected={adsConnected}
          reason={connectionReason}
          errorDetail={connectionError}
        />
      )}

      {/* Top performing ads */}
      <section className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Top performing ads</h2>
            <span className="text-xs text-muted-foreground">
              {KPI_OPTIONS.find((o) => o.key === topKpi)!.label}
            </span>
          </div>
          <KpiPicker value={topKpi} onChange={setTopKpi} />
        </div>
        <AdPerformanceTable ads={topPerformers} loading={loading} currency={currency} />
      </section>

      {/* Recently launched */}
      <section className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Rocket className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Recently launched</h2>
            <span className="text-xs text-muted-foreground">
              {KPI_OPTIONS.find((o) => o.key === recentKpi)!.label}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <SinceDatePicker value={recentSince} onChange={setRecentSince} />
            <LimitToggle value={recentLimit} onChange={setRecentLimit} />
            <KpiPicker value={recentKpi} onChange={setRecentKpi} />
          </div>
        </div>
        <AdPerformanceTable ads={recent} loading={loading} currency={currency} />
      </section>
    </div>
  );
}

function KpiRow({
  totals,
  currency,
  count,
}: {
  totals: {
    spend: number;
    revenue: number;
    purchases: number;
    impressions: number;
    clicks: number;
    roas: number;
    cpa: number;
    ctr: number;
  };
  currency: string;
  count: number;
}) {
  const cards = [
    { label: "Spend", value: fmtCurrency(totals.spend, currency) },
    { label: "Revenue", value: fmtCurrency(totals.revenue, currency) },
    { label: "ROAS", value: fmtRoas(totals.roas) },
    { label: "CPA", value: totals.cpa > 0 ? fmtCurrency(totals.cpa, currency) : dash },
    { label: "Checkouts", value: fmtNum(totals.purchases) },
    { label: "Active ads", value: fmtNum(count) },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map((c) => (
        <div key={c.label} className="bg-card border border-border rounded-xl p-4">
          <div className="text-xs text-muted-foreground">{c.label}</div>
          <div className="text-lg font-semibold mt-1 tabular-nums">{c.value}</div>
        </div>
      ))}
    </div>
  );
}

function ConversionSettings({
  value,
  onChange,
}: {
  value: ConversionWindow;
  onChange: (v: ConversionWindow) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ConversionWindow>(value);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function apply() {
    onChange(draft);
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-card text-foreground hover:bg-muted transition-colors"
      >
        <SettingsIcon className="w-3.5 h-3.5" />
        Conversion settings ({value})
        <ChevronDown className="w-3.5 h-3.5 opacity-60" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-[360px] rounded-xl border border-border bg-card shadow-xl z-30 p-4">
          <div className="font-semibold text-sm">Conversion settings</div>

          <div className="mt-4">
            <div className="text-xs font-medium text-foreground mb-2">Conversion window</div>
            <div className="text-[11px] text-muted-foreground mb-3 leading-relaxed">
              Time period during which a conversion is counted after a click or view.
            </div>
            <div className="space-y-1">
              {CONVERSION_WINDOWS.map((w) => (
                <button
                  key={w.key}
                  onClick={() => setDraft(w.key)}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors text-left",
                    draft === w.key
                      ? "bg-primary/10 text-foreground"
                      : "hover:bg-muted text-foreground"
                  )}
                >
                  <span>
                    <span className="font-medium">{w.key}</span>
                    <span className="text-muted-foreground ml-2 text-xs">{w.label}</span>
                  </span>
                  {draft === w.key && <Check className="w-4 h-4 text-primary" />}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-border">
            <div className="text-xs font-medium text-foreground mb-2">
              Conversion date for daily reporting
            </div>
            <div className="text-[11px] text-muted-foreground mb-2">
              Always reports on <strong className="text-foreground">Date of conversion event</strong>{" "}
              to match Pinterest Campaign Manager.
            </div>
          </div>

          <div className="mt-5 flex items-center justify-end gap-2">
            <button
              onClick={() => setOpen(false)}
              className="px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-card hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={apply}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Apply
            </button>
          </div>
        </div>
      )}
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
          {o} ads
        </button>
      ))}
    </div>
  );
}

function KpiPicker({
  value,
  onChange,
}: {
  value: KpiKey;
  onChange: (v: KpiKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = KPI_OPTIONS.find((o) => o.key === value)!;
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-card text-foreground hover:bg-muted transition-colors"
      >
        <ArrowUpDown className="w-3.5 h-3.5" />
        Sort: {current.label}
        <ChevronDown className="w-3.5 h-3.5 opacity-60" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-[240px] rounded-xl border border-border bg-card shadow-xl z-30 p-1">
          {KPI_OPTIONS.map((o) => (
            <button
              key={o.key}
              onClick={() => {
                onChange(o.key);
                setOpen(false);
              }}
              className={cn(
                "w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors text-left",
                value === o.key
                  ? "bg-primary/10 text-foreground"
                  : "hover:bg-muted text-foreground"
              )}
            >
              <span>{o.label}</span>
              {value === o.key && <Check className="w-4 h-4 text-primary" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ConnectionBanner({
  adsConnected,
  reason,
  errorDetail,
}: {
  adsConnected: boolean;
  reason?: string;
  errorDetail?: string;
}) {
  let title = "Ads reporting not connected yet";
  let body: React.ReactNode = (
    <>
      Connect Pinterest in{" "}
      <Link href="/integrations" className="text-primary hover:underline">
        Integrations
      </Link>{" "}
      to load ad performance.
    </>
  );

  if (adsConnected && reason === "no_ads") {
    title = "No ads found in this ad account";
    body = (
      <>
        Your ad account is connected, but no ads exist yet. Create campaigns in Pinterest Ads
        Manager to start seeing performance here.
      </>
    );
  } else if (adsConnected) {
    title = "No spend in the selected period";
    body = (
      <>
        Ads exist but recorded no spend in the selected timeframe. Try a longer window, or
        check campaign status in Pinterest Ads Manager.
      </>
    );
  } else if (reason === "no_ad_account") {
    title = "No ad accounts on your Pinterest profile";
    body = (
      <>
        Pinterest returned no ad accounts for the connected user. Make sure the user has Ad
        account admin access in Pinterest Business.
      </>
    );
  } else if (reason === "fetch_failed") {
    title = "Could not load ads data";
    body = (
      <>
        Pinterest returned an error. The token may not have the{" "}
        <code className="px-1 rounded bg-muted text-xs">ads:read</code> scope — reconnect from{" "}
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
      <div className="flex-1 min-w-0">
        <div className="font-medium text-foreground">{title}</div>
        <p className="text-muted-foreground mt-1 leading-relaxed">{body}</p>
        {errorDetail && (
          <details className="mt-2 text-xs">
            <summary className="text-muted-foreground cursor-pointer hover:text-foreground">
              Pinterest error detail
            </summary>
            <pre className="mt-2 p-2 bg-muted rounded text-[11px] overflow-x-auto whitespace-pre-wrap break-words">
              {errorDetail}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}

function AdPerformanceTable({
  ads,
  loading,
  currency,
}: {
  ads: AdRow[];
  loading: boolean;
  currency: string;
}) {
  if (loading) {
    return <div className="h-48 bg-muted animate-pulse rounded-xl" />;
  }
  if (ads.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
        No ads to show for this period.
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="text-left font-medium px-4 py-3">Ad</th>
              <th className="text-right font-medium px-4 py-3">ROAS</th>
              <th className="text-right font-medium px-4 py-3">CPA</th>
              <th className="text-right font-medium px-4 py-3">Revenue</th>
              <th className="text-right font-medium px-4 py-3">Spend</th>
              <th className="text-right font-medium px-4 py-3">Checkouts</th>
            </tr>
          </thead>
          <tbody>
            {ads.map((a) => (
              <tr key={a.ad_id} className="border-t border-border hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-muted flex-shrink-0 overflow-hidden flex items-center justify-center">
                      {a.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={a.image_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <ImageIcon className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium truncate" title={a.ad_name}>
                        {a.ad_name}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        ID {a.ad_id}
                        {a.created_at && (
                          <>
                            {" · "}
                            Launched{" "}
                            {new Date(a.created_at).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </td>
                <td
                  className={cn(
                    "px-4 py-3 text-right font-medium tabular-nums",
                    a.roas == null
                      ? "text-muted-foreground"
                      : a.roas >= 3
                        ? "text-emerald-600 dark:text-emerald-400"
                        : a.roas >= 1.5
                          ? "text-foreground"
                          : "text-amber-600 dark:text-amber-400"
                  )}
                >
                  {a.roas == null ? dash : fmtRoas(a.roas)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-foreground">
                  {a.cpa == null ? dash : fmtCurrency(a.cpa, currency)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-foreground">
                  {a.revenue == null ? dash : fmtCurrency(a.revenue, currency)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-foreground">
                  {a.spend == null ? dash : fmtCurrency(a.spend, currency)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-foreground">
                  {a.purchases == null ? dash : fmtNum(a.purchases)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
