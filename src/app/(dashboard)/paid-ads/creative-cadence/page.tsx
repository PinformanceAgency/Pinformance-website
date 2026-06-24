"use client";

/**
 * Creative Cadence — when to refresh creatives.
 *
 * Two signals stacked into one view:
 *   - How fast are new ads being added per campaign (cadence)
 *   - How worn-out are the existing creatives (Pinterest's FREQUENCY metric)
 *
 * Both 7d and 30d windows are shown side-by-side so you can spot acute
 * fatigue (7d spiking) versus chronic (30d high).
 *
 * Fatigue thresholds (driven by frequency_30d):
 *   < 2.5  fresh
 *   2.5–4  aging — consider a refresh
 *   > 4    fatigued — refresh now
 */

import { useEffect, useState } from "react";
import {
  Sparkles,
  Plus,
  Clock,
  Eye,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CampaignRow {
  id: string;
  name: string;
  status: string | null;
  ads_total: number;
  ads_added_7d: number;
  ads_added_30d: number;
  last_ad_created_at: number | null;
  days_since_last_ad: number | null;
  avg_interval_days: number | null;
  frequency_7d: number | null;
  frequency_30d: number | null;
  ctr_7d: number | null;
  ctr_30d: number | null;
  impressions_7d: number;
  impressions_30d: number;
  fatigue: "fresh" | "aging" | "fatigued" | "no_data";
}

interface Response {
  ok: true;
  ad_account_name: string;
  currency: string;
  totals: {
    ads_added_7d: number;
    ads_added_30d: number;
    frequency_7d: number | null;
    frequency_30d: number | null;
    avg_days_between_ads: number | null;
    campaigns_total: number;
    campaigns_fatigued: number;
    campaigns_aging: number;
  };
  campaigns: CampaignRow[];
  diag?: {
    total_ads_fetched: number;
    ads_with_campaign_id_direct: number;
    ads_with_ad_group_id: number;
    ads_attributed_to_campaign: number;
    ad_groups_fetched: number;
    campaigns_fetched: number;
    sample_ad_keys: string[];
  };
}

const FATIGUE_META = {
  fresh: { label: "Fresh", color: "bg-green-100 text-green-700 border-green-200" },
  aging: { label: "Aging", color: "bg-amber-100 text-amber-700 border-amber-200" },
  fatigued: { label: "Fatigued", color: "bg-red-100 text-red-700 border-red-200" },
  no_data: { label: "No data", color: "bg-zinc-100 text-zinc-500 border-zinc-200" },
} as const;

function fmtFreq(v: number | null): string {
  return v == null ? "—" : v.toFixed(2);
}
function fmtPct(v: number | null): string {
  return v == null ? "—" : `${v.toFixed(2)}%`;
}
function fmtDays(v: number | null): string {
  if (v == null) return "—";
  if (v < 1 / 24) return "<1h";
  if (v < 1) return `${Math.round(v * 24)}h`;
  return `${v}d`;
}
function statusBadge(status: string | null) {
  const s = (status || "").toUpperCase();
  if (s === "ACTIVE") return "bg-green-100 text-green-700";
  if (s === "PAUSED") return "bg-yellow-100 text-yellow-700";
  if (s === "ARCHIVED") return "bg-zinc-200 text-zinc-600";
  return "bg-muted text-muted-foreground";
}

function trendArrow(seven: number | null, thirty: number | null) {
  if (seven == null || thirty == null) return Minus;
  const diff = seven - thirty;
  if (Math.abs(diff) < 0.05) return Minus;
  return diff > 0 ? TrendingUp : TrendingDown;
}

export default function CreativeCadencePage() {
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"recent" | "impressions" | "fatigue" | "days_since">(
    "recent"
  );
  const [statusFilter, setStatusFilter] = useState<"active" | "all">("active");

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch("/api/pinterest/creative-cadence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok || !j.ok) throw new Error(j.error || "Failed to load");
        setData(j);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filteredBase = data
    ? data.campaigns.filter((c) =>
        statusFilter === "active" ? (c.status || "").toUpperCase() === "ACTIVE" : true
      )
    : [];
  const sorted = data
    ? [...filteredBase].sort((a, b) => {
        if (sortBy === "recent") {
          if (b.ads_added_30d !== a.ads_added_30d) return b.ads_added_30d - a.ads_added_30d;
          // tiebreak: most recent last_add first
          return (b.last_ad_created_at ?? 0) - (a.last_ad_created_at ?? 0);
        }
        if (sortBy === "impressions") return b.impressions_30d - a.impressions_30d;
        if (sortBy === "fatigue") {
          const order = { fatigued: 0, aging: 1, fresh: 2, no_data: 3 };
          return order[a.fatigue] - order[b.fatigue];
        }
        return (b.days_since_last_ad ?? -1) - (a.days_since_last_ad ?? -1);
      })
    : [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" /> Creative Cadence
        </h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
          When to add new creatives and which campaigns are wearing out. Cadence
          comes from Pinterest&apos;s <code>created_time</code> on each ad;
          fatigue uses the <code>FREQUENCY</code> metric (impressions per unique
          user). Both 7-day and 30-day windows are shown so you can spot acute
          vs chronic fatigue.
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm p-3">
          {error}
        </div>
      )}

      {data?.diag && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs p-3 font-mono">
          <div className="font-sans font-semibold text-sm mb-1">
            Pinterest API diagnostics
          </div>
          <div>Total ads fetched: <b>{data.diag.total_ads_fetched}</b></div>
          <div>Ads with campaign_id directly: <b>{data.diag.ads_with_campaign_id_direct}</b></div>
          <div>Ads with ad_group_id: <b>{data.diag.ads_with_ad_group_id}</b></div>
          <div>Ads attributed to a campaign (direct + lookup): <b>{data.diag.ads_attributed_to_campaign}</b></div>
          <div>Ad groups fetched: <b>{data.diag.ad_groups_fetched}</b> · Campaigns: <b>{data.diag.campaigns_fetched}</b></div>
          <div className="mt-1 text-amber-700">Ad object keys: {data.diag.sample_ad_keys.join(", ")}</div>
        </div>
      )}

      {/* Account KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <Kpi label="Ads added · 7d" value={data?.totals.ads_added_7d} loading={loading} icon={Plus} accent="text-green-600" />
        <Kpi label="Ads added · 30d" value={data?.totals.ads_added_30d} loading={loading} icon={Plus} accent="text-green-600" />
        <Kpi
          label="Avg time between ads"
          value={data?.totals.avg_days_between_ads}
          loading={loading}
          icon={Clock}
          accent="text-foreground"
          format={fmtDays}
        />
        <Kpi
          label="Account frequency · 7d"
          value={data?.totals.frequency_7d}
          loading={loading}
          icon={Eye}
          accent={freqAccent(data?.totals.frequency_7d ?? null)}
          decimals={2}
        />
        <Kpi
          label="Account frequency · 30d"
          value={data?.totals.frequency_30d}
          loading={loading}
          icon={Eye}
          accent={freqAccent(data?.totals.frequency_30d ?? null)}
          decimals={2}
        />
        <Kpi
          label="Fatigued campaigns"
          value={data ? data.totals.campaigns_fatigued + data.totals.campaigns_aging : undefined}
          loading={loading}
          icon={AlertTriangle}
          accent={
            (data?.totals.campaigns_fatigued ?? 0) > 0
              ? "text-red-600"
              : (data?.totals.campaigns_aging ?? 0) > 0
              ? "text-amber-600"
              : "text-muted-foreground"
          }
          suffix={
            data
              ? ` / ${data.totals.campaigns_total}`
              : undefined
          }
        />
      </div>

      <div className="text-xs text-muted-foreground flex items-center gap-4">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-500" /> Fresh &lt; 2.5
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-500" /> Aging 2.5 – 4
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-500" /> Fatigued &gt; 4
        </span>
      </div>

      {/* Campaign table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-wrap gap-2">
          <div className="text-sm font-medium">
            Campaigns
            {data && (
              <span className="text-muted-foreground font-normal">
                {" "}· {data.ad_account_name}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-muted/50 rounded-md p-0.5 text-xs">
              {([
                ["active", "Active only"],
                ["all", "All"],
              ] as const).map(([k, l]) => (
                <button
                  key={k}
                  onClick={() => setStatusFilter(k)}
                  className={cn(
                    "px-2.5 py-1 rounded font-medium transition-colors",
                    statusFilter === k
                      ? "bg-card shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {l}
                  {data && k === "active" && (
                    <span className="ml-1 text-muted-foreground">
                      ({data.campaigns.filter((c) => (c.status || "").toUpperCase() === "ACTIVE").length})
                    </span>
                  )}
                  {data && k === "all" && (
                    <span className="ml-1 text-muted-foreground">({data.campaigns.length})</span>
                  )}
                </button>
              ))}
            </div>
            <div className="flex bg-muted/50 rounded-md p-0.5 text-xs">
              {([
                ["recent", "Recent activity"],
                ["impressions", "By impressions"],
                ["fatigue", "By fatigue"],
                ["days_since", "By stale"],
              ] as const).map(([k, l]) => (
                <button
                  key={k}
                  onClick={() => setSortBy(k)}
                  className={cn(
                    "px-2.5 py-1 rounded font-medium transition-colors",
                    sortBy === k
                      ? "bg-card shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <th className="text-left px-4 py-2 font-medium">Campaign</th>
                <th className="text-right px-3 py-2 font-medium">Ads</th>
                <th className="text-right px-3 py-2 font-medium">+7d</th>
                <th className="text-right px-3 py-2 font-medium">+30d</th>
                <th className="text-right px-3 py-2 font-medium">Last add</th>
                <th className="text-right px-3 py-2 font-medium">Avg interval</th>
                <th className="text-right px-3 py-2 font-medium">Freq 7d</th>
                <th className="text-right px-3 py-2 font-medium">Freq 30d</th>
                <th className="text-right px-3 py-2 font-medium">CTR 7d / 30d</th>
                <th className="text-left px-3 py-2 font-medium">Fatigue</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={10} className="p-5">
                    <div className="space-y-2">
                      {[...Array(6)].map((_, i) => (
                        <div key={i} className="h-9 bg-muted animate-pulse rounded" />
                      ))}
                    </div>
                  </td>
                </tr>
              )}
              {!loading && sorted.length === 0 && (
                <tr>
                  <td colSpan={10} className="text-center text-muted-foreground p-10">
                    No campaigns found in this ad account.
                  </td>
                </tr>
              )}
              {!loading &&
                sorted.map((c) => {
                  const TrendIcon = trendArrow(c.frequency_7d, c.frequency_30d);
                  const fatigueMeta = FATIGUE_META[c.fatigue];
                  return (
                    <tr
                      key={c.id}
                      className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-2.5 max-w-[280px]">
                        <div className="font-medium truncate" title={c.name}>{c.name}</div>
                        {c.status && (
                          <span
                            className={cn(
                              "text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded font-medium mt-0.5 inline-block",
                              statusBadge(c.status)
                            )}
                          >
                            {c.status}
                          </span>
                        )}
                      </td>
                      <td className="text-right px-3 py-2.5 tabular-nums">{c.ads_total}</td>
                      <td className="text-right px-3 py-2.5 tabular-nums">
                        <span className={c.ads_added_7d > 0 ? "text-green-600 font-medium" : "text-muted-foreground"}>
                          {c.ads_added_7d}
                        </span>
                      </td>
                      <td className="text-right px-3 py-2.5 tabular-nums">{c.ads_added_30d}</td>
                      <td className="text-right px-3 py-2.5 tabular-nums">
                        <span
                          className={cn(
                            c.days_since_last_ad == null
                              ? "text-muted-foreground"
                              : c.days_since_last_ad > 14
                              ? "text-red-600 font-medium"
                              : c.days_since_last_ad > 7
                              ? "text-amber-600"
                              : "text-foreground"
                          )}
                        >
                          {fmtDays(c.days_since_last_ad)}
                        </span>
                      </td>
                      <td className="text-right px-3 py-2.5 tabular-nums text-muted-foreground">
                        {fmtDays(c.avg_interval_days)}
                      </td>
                      <td className={cn("text-right px-3 py-2.5 tabular-nums", freqAccent(c.frequency_7d))}>
                        {fmtFreq(c.frequency_7d)}
                      </td>
                      <td className={cn("text-right px-3 py-2.5 tabular-nums", freqAccent(c.frequency_30d))}>
                        <span className="inline-flex items-center gap-1 justify-end">
                          {fmtFreq(c.frequency_30d)}
                          <TrendIcon className="w-3 h-3 opacity-60" />
                        </span>
                      </td>
                      <td className="text-right px-3 py-2.5 tabular-nums text-muted-foreground">
                        {fmtPct(c.ctr_7d)} / {fmtPct(c.ctr_30d)}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={cn(
                            "text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full font-medium border",
                            fatigueMeta.color
                          )}
                        >
                          {fatigueMeta.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function freqAccent(v: number | null): string {
  if (v == null) return "text-muted-foreground";
  if (v < 2.5) return "text-green-600";
  if (v <= 4) return "text-amber-600";
  return "text-red-600 font-semibold";
}

function Kpi({
  label,
  value,
  loading,
  icon: Icon,
  accent,
  decimals,
  suffix,
  format,
}: {
  label: string;
  value: number | null | undefined;
  loading: boolean;
  icon: typeof Plus;
  accent: string;
  decimals?: number;
  suffix?: string;
  format?: (v: number | null) => string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <Icon className={cn("w-3.5 h-3.5", accent)} />
      </div>
      <div className={cn("mt-1 text-2xl font-semibold tabular-nums", accent)}>
        {loading || value === undefined ? (
          <span className="inline-block h-6 w-10 bg-muted animate-pulse rounded" />
        ) : value == null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <>
            {format ? format(value) : decimals != null ? value.toFixed(decimals) : value.toLocaleString()}
            {suffix && <span className="text-base text-muted-foreground font-normal">{suffix}</span>}
          </>
        )}
      </div>
    </div>
  );
}
