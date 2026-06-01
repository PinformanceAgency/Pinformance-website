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
  FileText,
  X,
  Loader2,
  Video as VideoIcon,
  Images as ImagesIcon,
  BookOpen as StoryIcon,
  Filter,
  Layers,
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

interface MinKpiFilters {
  /** Minimum spend in account currency. null = no constraint. */
  spend: number | null;
  /** Minimum revenue. */
  revenue: number | null;
  /** Minimum checkouts (conversions count). */
  checkouts: number | null;
  /** Minimum ROAS (e.g. 1.5 = at least 1.5x). */
  roas: number | null;
  /** MAX CPA — ads with CPA above this are excluded. Lower is better. */
  cpaMax: number | null;
}
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
  creative_type: string | null;
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
  /** When merged across campaigns: number of source ads collapsed into this row. */
  _merged_count?: number;
}

/**
 * Collapse rows that share the same Pinterest pin (same creative used in
 * multiple campaigns / ad groups) into a single row whose metrics are the
 * sum of the source rows. Derived metrics (ROAS, CPA, CTR, CPM, CPC) are
 * recomputed from the sums so they reflect the merged totals rather than
 * an average of averages. Ads without a pin_id can't be safely merged
 * (no shared key) and are kept as-is.
 *
 * `created_at` is set to the LATEST of the merged set so that "Recently
 * launched" still surfaces a pin when it was re-deployed in a new
 * campaign, even if the original ad is months old.
 */
function dedupByPin(rows: AdRow[]): AdRow[] {
  const groups = new Map<string, AdRow[]>();
  for (const r of rows) {
    const key = r.pin_id ? `pin:${r.pin_id}` : `ad:${r.ad_id}`;
    const arr = groups.get(key);
    if (arr) arr.push(r);
    else groups.set(key, [r]);
  }
  const out: AdRow[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      out.push(group[0]);
      continue;
    }
    const sums = group.reduce(
      (acc, a) => {
        acc.spend += a.spend ?? 0;
        acc.revenue += a.revenue ?? 0;
        acc.purchases += a.purchases ?? 0;
        acc.impressions += a.impressions ?? 0;
        acc.clicks += a.clicks ?? 0;
        return acc;
      },
      { spend: 0, revenue: 0, purchases: 0, impressions: 0, clicks: 0 }
    );
    const latest = group.reduce<string | null>((acc, a) => {
      if (!a.created_at) return acc;
      if (!acc || a.created_at > acc) return a.created_at;
      return acc;
    }, null);
    // Representative row = highest-spend instance (most relevant ad_id/name/image).
    const rep = [...group].sort((a, b) => (b.spend ?? 0) - (a.spend ?? 0))[0];
    out.push({
      ...rep,
      created_at: latest,
      spend: sums.spend,
      revenue: sums.revenue,
      purchases: sums.purchases,
      impressions: sums.impressions,
      clicks: sums.clicks,
      ctr: sums.impressions > 0 ? (sums.clicks / sums.impressions) * 100 : null,
      cpm: sums.impressions > 0 ? (sums.spend / sums.impressions) * 1000 : null,
      cpc: sums.clicks > 0 ? sums.spend / sums.clicks : null,
      roas: sums.spend > 0 ? sums.revenue / sums.spend : null,
      cpa: sums.purchases > 0 ? sums.spend / sums.purchases : null,
      _merged_count: group.length,
    });
  }
  return out;
}

function FallbackThumb({ creativeType }: { creativeType: string | null }) {
  const ct = (creativeType || "").toUpperCase();
  if (ct.includes("VIDEO")) {
    return <VideoIcon className="w-4 h-4 text-muted-foreground" />;
  }
  if (ct === "CAROUSEL" || ct === "COLLECTION" || ct === "SHOPPING") {
    return <ImagesIcon className="w-4 h-4 text-muted-foreground" />;
  }
  if (ct === "IDEA" || ct === "SHOWCASE") {
    return <StoryIcon className="w-4 h-4 text-muted-foreground" />;
  }
  return <ImageIcon className="w-4 h-4 text-muted-foreground" />;
}

interface AccountTotals {
  spend: number | null;
  revenue: number | null;
  purchases: number | null;
  impressions: number | null;
  clicks: number | null;
  roas: number | null;
  cpa: number | null;
}

interface AdAccountChoice {
  id: string;
  name: string;
  currency?: string;
}

interface Diagnostics {
  total_ads_fetched?: number;
  pages_fetched?: number;
  ads_with_spend?: number;
  ads_with_analytics?: number;
  image_lookups_attempted?: number;
  image_lookups_failed?: number;
}

interface ApiResponse {
  ads: AdRow[];
  account_totals?: AccountTotals | null;
  ads_connected: boolean;
  ad_account_id?: string;
  ad_account_name?: string;
  available_ad_accounts?: AdAccountChoice[];
  currency?: string;
  reason?: string;
  error?: string;
  start_date?: string;
  end_date?: string;
  diagnostics?: Diagnostics;
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
  const [reportOpen, setReportOpen] = useState(false);
  const [ads, setAds] = useState<AdRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [adsConnected, setAdsConnected] = useState(false);
  const [connectionReason, setConnectionReason] = useState<string | undefined>();
  const [connectionError, setConnectionError] = useState<string | undefined>();
  const [currency, setCurrency] = useState("USD");
  const [adAccountName, setAdAccountName] = useState<string | undefined>();
  const [adAccountId, setAdAccountId] = useState<string | undefined>();
  const [availableAdAccounts, setAvailableAdAccounts] = useState<AdAccountChoice[]>([]);
  const [savingAdAccount, setSavingAdAccount] = useState(false);
  const [accountTotals, setAccountTotals] = useState<AccountTotals | null>(null);
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [conversionWindow, setConversionWindow] = useState<ConversionWindow>("30/1");
  // Minimum KPI thresholds — used to filter out noisy small-spend outliers
  // before ranking. null/undefined = no constraint. CPA is a MAX (lower
  // is better); the other four are MINs.
  const [minFilters, setMinFilters] = useState<MinKpiFilters>({
    spend: null,
    revenue: null,
    checkouts: null,
    roas: null,
    cpaMax: null,
  });
  // When ON, ads sharing the same pin_id across campaigns are collapsed
  // into a single row with summed metrics. Default OFF — show each
  // campaign placement separately, since that's the raw Pinterest view.
  const [mergeDupes, setMergeDupes] = useState(false);

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

  async function switchAdAccount(newId: string) {
    setSavingAdAccount(true);
    try {
      const res = await fetch("/api/pinterest/ad-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ad_account_id: newId }),
      });
      if (!res.ok) throw new Error(await res.text());
      setRefreshKey((k) => k + 1);
    } finally {
      setSavingAdAccount(false);
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
        setAccountTotals(json.account_totals ?? null);
        setDiagnostics(json.diagnostics ?? null);
        setAdsConnected(!!json.ads_connected);
        setConnectionReason(json.reason);
        setConnectionError(json.error);
        if (json.currency) setCurrency(json.currency);
        if (json.ad_account_name) setAdAccountName(json.ad_account_name);
        setAdAccountId(json.ad_account_id);
        setAvailableAdAccounts(json.available_ad_accounts || []);
        setLastRefreshed(new Date());
      } catch (e) {
        if (!cancelled) {
          setAds([]);
          setAccountTotals(null);
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

  // Apply the user-set minimum KPI thresholds. An empty / 0 / null
  // threshold means "no constraint". CPA is a MAX (lower-is-better);
  // the others are MINs.
  const passesMinFilters = (a: AdRow): boolean => {
    if (minFilters.spend != null && (a.spend ?? 0) < minFilters.spend) return false;
    if (minFilters.revenue != null && (a.revenue ?? 0) < minFilters.revenue) return false;
    if (minFilters.checkouts != null && (a.purchases ?? 0) < minFilters.checkouts) return false;
    if (minFilters.roas != null && (a.roas ?? 0) < minFilters.roas) return false;
    if (minFilters.cpaMax != null) {
      // CPA: lower is better. Ads with no CPA (no conversions) are dropped
      // when a max-CPA constraint is active, since they can't satisfy it.
      if (a.cpa == null || a.cpa <= 0 || a.cpa > minFilters.cpaMax) return false;
    }
    return true;
  };

  const topPerformers = useMemo(() => {
    const base = mergeDupes ? dedupByPin(adsWithSpend) : adsWithSpend;
    return sortByKpi(base.filter(passesMinFilters), topKpi).slice(0, 10);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adsWithSpend, topKpi, minFilters, mergeDupes]);

  // Recently launched: ads created on or after the chosen "since" date,
  // then ranked by the selected KPI, then trimmed to the limit.
  // When merging is ON we dedup BEFORE the date filter so a pin gets
  // included if ANY of its placements was launched in window — the
  // merged created_at is the latest of the group (see dedupByPin).
  const recent = useMemo(() => {
    const sinceCutoff = recentSince + "T00:00:00Z";
    const base = mergeDupes ? dedupByPin(ads) : ads;
    const launchedSince = base.filter(
      (a) => a.created_at && a.created_at >= sinceCutoff
    );
    return sortByKpi(launchedSince.filter(passesMinFilters), recentKpi).slice(0, recentLimit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ads, recentLimit, recentKpi, recentSince, minFilters, mergeDupes]);

  // Headline KPI bar: prefer Pinterest's account-level totals (what
  // Campaign Manager shows), fall back to summed ad-level if missing.
  const totals = useMemo(() => {
    if (accountTotals && accountTotals.spend != null) {
      const spend = accountTotals.spend ?? 0;
      const revenue = accountTotals.revenue ?? 0;
      const purchases = accountTotals.purchases ?? 0;
      const impressions = accountTotals.impressions ?? 0;
      const clicks = accountTotals.clicks ?? 0;
      return {
        spend,
        revenue,
        purchases,
        impressions,
        clicks,
        roas: accountTotals.roas ?? (spend > 0 ? revenue / spend : 0),
        cpa: accountTotals.cpa ?? (purchases > 0 ? spend / purchases : 0),
        ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
        source: "account" as const,
      };
    }
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
      source: "ads_sum" as const,
    };
  }, [accountTotals, adsWithSpend]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Paid Ads — Creatives</h1>
            <div className="text-sm text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
              <span>Performance per ad in</span>
              {availableAdAccounts.length > 1 ? (
                <select
                  value={adAccountId || ""}
                  onChange={(e) => switchAdAccount(e.target.value)}
                  disabled={savingAdAccount || loading}
                  className="text-xs font-medium rounded-md border border-border bg-card px-2 py-0.5 text-foreground hover:bg-muted disabled:opacity-50"
                >
                  {availableAdAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.id})
                    </option>
                  ))}
                </select>
              ) : (
                <strong className="text-foreground">{adAccountName || "Pinterest Ads"}</strong>
              )}
              <span>(Pinterest Ads).</span>
            </div>
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
          <button
            onClick={() => setReportOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <FileText className="w-3.5 h-3.5" />
            Create report
          </button>
        </div>
      </div>

      {reportOpen && (
        <CreateReportModal
          defaults={{
            dateRange,
            conversionWindow,
            topKpi,
            recentKpi,
            recentSince,
            minFilters,
            deduplicateByPin: mergeDupes,
          }}
          currency={currency}
          onClose={() => setReportOpen(false)}
        />
      )}

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
        {diagnostics?.total_ads_fetched != null && (
          <>
            <span>·</span>
            <span>
              <strong className="text-foreground">{diagnostics.total_ads_fetched}</strong> ads fetched
              {diagnostics.ads_with_spend != null && (
                <>
                  {" "}
                  (<strong className="text-foreground">{diagnostics.ads_with_spend}</strong> with spend)
                </>
              )}
            </span>
          </>
        )}
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

      {/* Min-KPI filters — apply to BOTH Top performers and Recently
          launched so admins can hide noisy small-spend outliers. */}
      <MinKpiFiltersControl
        value={minFilters}
        onChange={setMinFilters}
        currency={currency}
        mergeDupes={mergeDupes}
        onMergeDupesChange={setMergeDupes}
      />

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

function CreateReportModal({
  defaults,
  currency,
  onClose,
}: {
  defaults: {
    dateRange: DateRange;
    conversionWindow: ConversionWindow;
    topKpi: KpiKey;
    recentKpi: KpiKey;
    recentSince: string;
    minFilters: MinKpiFilters;
    deduplicateByPin: boolean;
  };
  currency: string;
  onClose: () => void;
}) {
  const [dateRange, setDateRange] = useState<DateRange>(defaults.dateRange);
  const [conversionWindow, setConversionWindow] = useState<ConversionWindow>(
    defaults.conversionWindow
  );
  const [topN, setTopN] = useState<number>(5);
  const [topKpi, setTopKpi] = useState<KpiKey>(defaults.topKpi);
  const [recentN, setRecentN] = useState<number>(5);
  const [recentKpi, setRecentKpi] = useState<KpiKey>(defaults.recentKpi);
  const [recentSince, setRecentSince] = useState<string>(defaults.recentSince);
  // Carry the dashboard's min-KPI filters over into the report so the
  // ranked lists exclude the same noise the admin already filtered out.
  // Editable here so the report can have different (usually stricter)
  // thresholds than the dashboard if needed.
  const [minFilters, setMinFilters] = useState<MinKpiFilters>(defaults.minFilters);
  // Carry the dashboard's deduplicate toggle into the report.
  const [deduplicateByPin, setDeduplicateByPin] = useState<boolean>(defaults.deduplicateByPin);
  const [manualNotes, setManualNotes] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Default filename — user can override. Stays in sync with date range
  // until the user manually edits it.
  const [reportName, setReportName] = useState<string>(
    `Pinterest Weekly Report — ${defaults.dateRange.start} to ${defaults.dateRange.end}`
  );
  const [reportNameTouched, setReportNameTouched] = useState(false);

  useEffect(() => {
    if (reportNameTouched) return;
    setReportName(
      `Pinterest Weekly Report — ${dateRange.start} to ${dateRange.end}`
    );
  }, [dateRange.start, dateRange.end, reportNameTouched]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !generating) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, generating]);

  async function generate() {
    setError(null);
    setGenerating(true);
    try {
      const cw = CONVERSION_WINDOWS.find((w) => w.key === conversionWindow)!;
      const res = await fetch("/api/pinterest/ads-performance/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start_date: dateRange.start,
          end_date: dateRange.end,
          click_window: cw.click,
          view_window: cw.view,
          top_n: topN,
          top_kpi: topKpi,
          recent_n: recentN,
          recent_kpi: recentKpi,
          recent_since: recentSince,
          manual_notes: manualNotes,
          report_name: reportName.trim(),
          // Minimum-KPI thresholds (null = no constraint).
          min_spend: minFilters.spend,
          min_revenue: minFilters.revenue,
          min_checkouts: minFilters.checkouts,
          min_roas: minFilters.roas,
          max_cpa: minFilters.cpaMax,
          // Deduplicate creatives that appear in multiple campaigns.
          deduplicate_by_pin: deduplicateByPin,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] || "Pinterest-Report.docx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={() => !generating && onClose()}
    >
      <div
        className="bg-card border border-border rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold">Create weekly report</h2>
              <p className="text-xs text-muted-foreground">
                Generate a .docx report with Pinterest Ads data.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={generating}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-muted text-muted-foreground disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Report name */}
          <div>
            <div className="text-xs font-medium text-foreground mb-1.5">
              Report name
            </div>
            <input
              type="text"
              value={reportName}
              onChange={(e) => {
                setReportName(e.target.value);
                setReportNameTouched(true);
              }}
              placeholder="Pinterest Weekly Report"
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <div className="text-[11px] text-muted-foreground mt-1">
              Used as the downloaded file name (.docx extension added
              automatically). Auto-updates with the date range until you edit
              it manually.
            </div>
          </div>

          {/* Date range + conversion settings */}
          <div className="flex items-center gap-2 flex-wrap border-t border-border pt-4">
            <div className="text-xs font-medium text-foreground w-full mb-1">Period</div>
            <DateRangePicker value={dateRange} onChange={setDateRange} align="left" />
            <ConversionSettings
              value={conversionWindow}
              onChange={setConversionWindow}
            />
          </div>

          {/* Top performing ads */}
          <div className="border-t border-border pt-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />
              <div className="text-sm font-medium">Top performing ads</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <NumberPicker label="Count" value={topN} options={[3, 5, 10, 15, 20]} onChange={setTopN} />
              <KpiSelect label="Rank by" value={topKpi} onChange={setTopKpi} />
            </div>
          </div>

          {/* Recently launched ads */}
          <div className="border-t border-border pt-4">
            <div className="flex items-center gap-2 mb-3">
              <Rocket className="w-3.5 h-3.5 text-muted-foreground" />
              <div className="text-sm font-medium">Recently launched ads</div>
              <span className="text-[11px] text-muted-foreground">— set count to 0 to omit this section</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <NumberPicker label="Count" value={recentN} options={[0, 3, 5, 10, 15, 20]} onChange={setRecentN} />
              <div className={recentN === 0 ? "opacity-40 pointer-events-none" : ""}>
                <KpiSelect label="Rank by" value={recentKpi} onChange={setRecentKpi} />
              </div>
            </div>
            <div className={cn("mt-3", recentN === 0 && "opacity-40 pointer-events-none")}>
              <div className="text-[11px] text-muted-foreground mb-1.5">Launched since</div>
              <SinceDatePicker value={recentSince} onChange={setRecentSince} align="left" />
            </div>
          </div>

          {/* Minimum-KPI filters + deduplication for the report's ranked lists */}
          <div className="border-t border-border pt-4">
            <div className="flex items-center gap-2 mb-2">
              <Filter className="w-3.5 h-3.5 text-muted-foreground" />
              <div className="text-sm font-medium">Minimum filters</div>
              <span className="text-[11px] text-muted-foreground">
                — applies to Top performers + Recently launched in the report
              </span>
            </div>
            <MinKpiFiltersControl
              value={minFilters}
              onChange={setMinFilters}
              currency={currency}
            />
            {/* Deduplication toggle — same creative used in multiple campaigns */}
            <div className="flex items-center gap-2.5 mt-3 pt-3 border-t border-border/50">
              <Layers className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <span className="text-xs text-muted-foreground">
                Group same creative across campaigns
              </span>
              <button
                role="switch"
                aria-checked={deduplicateByPin}
                onClick={() => setDeduplicateByPin((v) => !v)}
                className={cn(
                  "relative inline-flex h-4 w-8 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none",
                  deduplicateByPin ? "bg-primary" : "bg-muted-foreground/30"
                )}
              >
                <span
                  className={cn(
                    "inline-block h-3 w-3 rounded-full bg-white shadow transition-transform",
                    deduplicateByPin ? "translate-x-4" : "translate-x-0.5"
                  )}
                />
              </button>
              {deduplicateByPin && (
                <span className="text-xs text-primary font-medium">
                  Aan — metrics worden opgeteld per creative
                </span>
              )}
            </div>
          </div>

          {/* Manual notes */}
          <div className="border-t border-border pt-4">
            <div className="text-sm font-medium mb-2">Notes (added to the end of the report)</div>
            <textarea
              value={manualNotes}
              onChange={(e) => setManualNotes(e.target.value)}
              placeholder="Anything Pinterest doesn't capture — context, observations, next-week plans, learnings from creative tests, etc."
              rows={5}
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground resize-y focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-700 dark:text-red-400">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-5 border-t border-border">
          <button
            onClick={onClose}
            disabled={generating}
            className="px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-card hover:bg-muted transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={generate}
            disabled={generating}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {generating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {generating ? "Generating…" : "Generate report"}
          </button>
        </div>
      </div>
    </div>
  );
}

function NumberPicker({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: number;
  options: number[];
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="text-[11px] text-muted-foreground mb-1.5">{label}</div>
      <div className="inline-flex bg-muted rounded-lg p-1">
        {options.map((o) => (
          <button
            key={o}
            onClick={() => onChange(o)}
            className={cn(
              "px-2.5 py-1 text-xs font-medium rounded-md transition-colors",
              value === o
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

function KpiSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: KpiKey;
  onChange: (v: KpiKey) => void;
}) {
  return (
    <div>
      <div className="text-[11px] text-muted-foreground mb-1.5">{label}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as KpiKey)}
        className="w-full px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-card text-foreground hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40"
      >
        {KPI_OPTIONS.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Inline row of 5 numeric inputs that lets the admin set minimum KPI
 * thresholds (or max-CPA). Empty / 0 = no constraint. The active count
 * shows in a pill so users can see at a glance whether filters are on.
 */
function MinKpiFiltersControl({
  value,
  onChange,
  currency,
  mergeDupes,
  onMergeDupesChange,
}: {
  value: MinKpiFilters;
  onChange: (v: MinKpiFilters) => void;
  currency: string;
  /** Optional: when provided, renders a toggle for merging duplicate creatives across campaigns. */
  mergeDupes?: boolean;
  onMergeDupesChange?: (v: boolean) => void;
}) {
  const activeCount =
    (value.spend != null ? 1 : 0) +
    (value.revenue != null ? 1 : 0) +
    (value.checkouts != null ? 1 : 0) +
    (value.roas != null ? 1 : 0) +
    (value.cpaMax != null ? 1 : 0);
  function patch(key: keyof MinKpiFilters, raw: string) {
    const trimmed = raw.trim();
    if (trimmed === "") {
      onChange({ ...value, [key]: null });
      return;
    }
    const n = Number(trimmed);
    if (!isFinite(n) || n < 0) return;
    onChange({ ...value, [key]: n });
  }
  function clearAll() {
    onChange({ spend: null, revenue: null, checkouts: null, roas: null, cpaMax: null });
  }
  const sym = currency === "EUR" ? "€" : currency === "GBP" ? "£" : "$";
  return (
    <section className="bg-card border border-border rounded-xl p-3">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <Filter className="w-3.5 h-3.5" />
          Minimum filters
          {activeCount > 0 && (
            <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-semibold rounded-full bg-primary text-primary-foreground">
              {activeCount}
            </span>
          )}
        </div>
        <MinInput
          label={`Min spend (${sym})`}
          value={value.spend}
          onChange={(v) => patch("spend", v)}
          step="1"
        />
        <MinInput
          label={`Min revenue (${sym})`}
          value={value.revenue}
          onChange={(v) => patch("revenue", v)}
          step="1"
        />
        <MinInput
          label="Min conv."
          value={value.checkouts}
          onChange={(v) => patch("checkouts", v)}
          step="1"
        />
        <MinInput
          label="Min ROAS"
          value={value.roas}
          onChange={(v) => patch("roas", v)}
          step="0.1"
          suffix="x"
        />
        <MinInput
          label={`Max CPA (${sym})`}
          value={value.cpaMax}
          onChange={(v) => patch("cpaMax", v)}
          step="1"
        />
        {activeCount > 0 && (
          <button
            onClick={clearAll}
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            Clear all
          </button>
        )}
        {onMergeDupesChange && (
          <>
            <div className="h-5 w-px bg-border ml-auto" aria-hidden />
            <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
              <button
                type="button"
                role="switch"
                aria-checked={!!mergeDupes}
                onClick={() => onMergeDupesChange(!mergeDupes)}
                className={cn(
                  "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                  mergeDupes ? "bg-primary" : "bg-muted"
                )}
              >
                <span
                  className={cn(
                    "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
                    mergeDupes ? "translate-x-[18px]" : "translate-x-0.5"
                  )}
                />
              </button>
              <span className="text-muted-foreground whitespace-nowrap">
                Merge duplicate creatives
              </span>
            </label>
          </>
        )}
      </div>
    </section>
  );
}

function MinInput({
  label,
  value,
  onChange,
  step,
  suffix,
}: {
  label: string;
  value: number | null;
  onChange: (raw: string) => void;
  step: string;
  suffix?: string;
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs">
      <span className="text-muted-foreground whitespace-nowrap">{label}</span>
      <input
        type="number"
        min="0"
        step={step}
        value={value == null ? "" : String(value)}
        onChange={(e) => onChange(e.target.value)}
        placeholder="—"
        className="w-16 px-2 py-1 text-xs rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
      {suffix && <span className="text-muted-foreground">{suffix}</span>}
    </label>
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
    // Decode the Pinterest error code embedded in errorDetail so we can
    // show a useful message instead of a single catch-all "missing
    // ads:read" — which is misleading whenever Pinterest's actual reason
    // is something else (revoked token, expired account access, etc.).
    const codeMatch = errorDetail?.match(/"code"\s*:\s*(\d+)/);
    const pinterestCode = codeMatch ? parseInt(codeMatch[1], 10) : null;
    title = "Could not load ads data";
    if (pinterestCode === 2) {
      title = "Pinterest authentication failed";
      body = (
        <>
          The access token for this org is no longer valid (Pinterest may have
          revoked it, or the user changed their password / removed the app).
          Go to{" "}
          <Link href="/settings" className="text-primary hover:underline">
            Settings → Disconnect Pinterest
          </Link>{" "}
          first, then reconnect from{" "}
          <Link href="/integrations" className="text-primary hover:underline">
            Integrations
          </Link>
          .
        </>
      );
    } else if (pinterestCode === 3) {
      title = "Pinterest app type not supported";
      body = (
        <>
          Pinterest rejected the API request because the developer app for
          this org is in Trial Access or has a consumer type mismatch.
          Check{" "}
          <a
            href="https://developers.pinterest.com/apps/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            developers.pinterest.com/apps
          </a>{" "}
          and ensure the app has Standard Access for the required scopes.
        </>
      );
    } else {
      body = (
        <>
          Pinterest returned an error. Try reconnecting from{" "}
          <Link href="/integrations" className="text-primary hover:underline">
            Integrations
          </Link>
          . If the problem persists, expand the error detail below and
          contact the developer.
        </>
      );
    }
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
              <tr
                key={a._merged_count && a._merged_count > 1 && a.pin_id ? `pin:${a.pin_id}` : `ad:${a.ad_id}`}
                className="border-t border-border hover:bg-muted/30 transition-colors"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {a.pin_id ? (
                      <a
                        href={`https://www.pinterest.com/pin/${a.pin_id}/`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open pin on Pinterest"
                        className="w-10 h-10 rounded-lg bg-muted flex-shrink-0 overflow-hidden flex items-center justify-center hover:ring-2 hover:ring-primary/50 transition-all"
                      >
                        {a.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={a.image_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <FallbackThumb creativeType={a.creative_type} />
                        )}
                      </a>
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-muted flex-shrink-0 overflow-hidden flex items-center justify-center">
                        {a.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={a.image_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <FallbackThumb creativeType={a.creative_type} />
                        )}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="font-medium truncate" title={a.ad_name}>
                        {a.ad_name}
                      </div>
                      <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
                        <span>ID {a.ad_id}</span>
                        {a.created_at && (
                          <span>
                            · Launched{" "}
                            {new Date(a.created_at).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </span>
                        )}
                        {a._merged_count && a._merged_count > 1 && (
                          <span
                            className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-primary/10 text-primary text-[10px] font-medium"
                            title={`Same pin used in ${a._merged_count} ad placements — metrics are the sum across all of them`}
                          >
                            merged · {a._merged_count} ads
                          </span>
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
