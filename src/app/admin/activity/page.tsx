"use client";

/**
 * Admin → Activity. For the head of media buying: pick a store and see
 * everything that was created or updated in that store's Pinterest ad
 * account in a given window. Pinterest doesn't expose a per-field audit
 * log, so we surface the entity-level timestamps — what was touched, when,
 * and its current values. Real before/after diffs are phase 2 (snapshots).
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useOrg } from "@/hooks/use-org";
import {
  Activity,
  ChevronDown,
  Layers,
  Megaphone,
  Image as ImageIcon,
  Sparkles,
  Plus,
  Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Store {
  id: string;
  name: string;
  slug: string;
  ad_account_id: string | null;
}

interface ActivityItem {
  id: string;
  type: "campaign" | "ad_group" | "ad";
  name: string;
  status: string | null;
  created_time: number | null;
  updated_time: number | null;
  action: "created" | "updated";
  action_time: number;
  extra?: Record<string, unknown>;
  parent?: { campaign_id?: string; ad_group_id?: string };
}

interface ActivityResponse {
  ok: true;
  ad_account_id: string;
  ad_account_name: string;
  currency: string;
  start_date: string;
  end_date: string;
  totals: {
    created: number;
    updated: number;
    by_type: { campaign: number; ad_group: number; ad: number };
    total: number;
  };
  items: ActivityItem[];
}

type Period = "1d" | "7d" | "30d" | "custom";

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

const TYPE_META: Record<ActivityItem["type"], { label: string; icon: typeof Layers }> = {
  campaign: { label: "Campaign", icon: Megaphone },
  ad_group: { label: "Ad group", icon: Layers },
  ad: { label: "Ad", icon: ImageIcon },
};

function microsToCurrency(v: unknown, currency: string): string | null {
  if (typeof v !== "number" || v <= 0) return null;
  const amount = v / 1_000_000;
  try {
    return amount.toLocaleString(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    });
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function dollarsToCurrency(v: unknown, currency: string): string | null {
  if (typeof v !== "number" || v <= 0) return null;
  try {
    return v.toLocaleString(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    });
  } catch {
    return `${v.toFixed(2)} ${currency}`;
  }
}

function statusBadge(status: string | null): string {
  const s = (status || "").toUpperCase();
  if (s === "ACTIVE") return "bg-green-100 text-green-700";
  if (s === "PAUSED") return "bg-yellow-100 text-yellow-700";
  if (s === "ARCHIVED") return "bg-zinc-200 text-zinc-600";
  return "bg-muted text-muted-foreground";
}

function formatTime(unixSec: number) {
  return new Date(unixSec * 1000).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDayHeader(dayKey: string) {
  // dayKey is YYYY-MM-DD in local time of the user.
  const today = new Date();
  const yest = new Date();
  yest.setDate(yest.getDate() - 1);
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const yestKey = `${yest.getFullYear()}-${String(yest.getMonth() + 1).padStart(2, "0")}-${String(yest.getDate()).padStart(2, "0")}`;
  if (dayKey === todayKey) return "Today";
  if (dayKey === yestKey) return "Yesterday";
  const d = new Date(dayKey + "T12:00:00");
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export default function AdminActivityPage() {
  const { isAgencyAdmin, loading: authLoading } = useOrg();
  const router = useRouter();

  const [stores, setStores] = useState<Store[] | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("7d");
  const [customStart, setCustomStart] = useState<string>(isoDaysAgo(7));
  const [customEnd, setCustomEnd] = useState<string>(todayIso());
  const [data, setData] = useState<ActivityResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!isAgencyAdmin) {
      router.push("/overview");
      return;
    }
    (async () => {
      const res = await fetch("/api/admin/activity/stores");
      const json = await res.json();
      if (json.ok) {
        setStores(json.stores);
        if (json.stores.length > 0 && !selectedStoreId) {
          setSelectedStoreId(json.stores[0].id);
        }
      }
    })();
  }, [authLoading, isAgencyAdmin, router, selectedStoreId]);

  const { startDate, endDate } = useMemo(() => {
    if (period === "1d") return { startDate: isoDaysAgo(0), endDate: todayIso() };
    if (period === "7d") return { startDate: isoDaysAgo(7), endDate: todayIso() };
    if (period === "30d") return { startDate: isoDaysAgo(30), endDate: todayIso() };
    return { startDate: customStart, endDate: customEnd };
  }, [period, customStart, customEnd]);

  useEffect(() => {
    if (!selectedStoreId) return;
    setLoading(true);
    setError(null);
    setData(null);
    fetch("/api/admin/activity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        org_id: selectedStoreId,
        start_date: startDate,
        end_date: endDate,
      }),
    })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error || "Failed to load");
        setData(json);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [selectedStoreId, startDate, endDate]);

  // Group items by day (local time).
  const grouped = useMemo(() => {
    if (!data) return [] as Array<{ day: string; items: ActivityItem[] }>;
    const map = new Map<string, ActivityItem[]>();
    for (const it of data.items) {
      const d = new Date(it.action_time * 1000);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    }
    return Array.from(map.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([day, items]) => ({ day, items }));
  }, [data]);

  if (authLoading) {
    return <div className="h-8 w-48 bg-muted animate-pulse rounded" />;
  }

  const selectedStore = stores?.find((s) => s.id === selectedStoreId) || null;
  const currency = data?.currency || "USD";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary" /> Ad Account Activity
          </h1>
          <p className="text-muted-foreground mt-1 text-sm max-w-2xl">
            See what each media buyer touched in a store&apos;s Pinterest ad account.
            Items appear when a campaign, ad group, or ad was created or updated
            in the selected window. Pinterest does not expose the previous values,
            so this view shows what changed and when, not from-what-to-what.
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Store selector */}
        <div className="relative">
          <select
            value={selectedStoreId || ""}
            onChange={(e) => setSelectedStoreId(e.target.value)}
            disabled={!stores}
            className="appearance-none bg-card border border-border rounded-lg pl-3 pr-9 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/50 min-w-[220px]"
          >
            {!stores && <option>Loading stores…</option>}
            {stores?.length === 0 && <option>No stores connected</option>}
            {stores?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" />
        </div>

        {/* Period */}
        <div className="flex bg-card border border-border rounded-lg p-0.5">
          {(["1d", "7d", "30d", "custom"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                period === p
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {p === "1d" ? "Today" : p === "custom" ? "Custom" : `Last ${p}`}
            </button>
          ))}
        </div>

        {period === "custom" && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customStart}
              max={customEnd}
              onChange={(e) => setCustomStart(e.target.value)}
              className="bg-card border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <span className="text-muted-foreground text-sm">→</span>
            <input
              type="date"
              value={customEnd}
              min={customStart}
              max={todayIso()}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="bg-card border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
        )}
      </div>

      {/* Header stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Total actions" value={data?.totals.total} loading={loading} accent="text-primary" />
        <StatCard label="Created" value={data?.totals.created} loading={loading} icon={Plus} accent="text-green-600" />
        <StatCard label="Updated" value={data?.totals.updated} loading={loading} icon={Pencil} accent="text-blue-600" />
        <StatCard label="Campaigns" value={data?.totals.by_type.campaign} loading={loading} icon={Megaphone} />
        <StatCard label="Ads + ad groups" value={data ? data.totals.by_type.ad + data.totals.by_type.ad_group : undefined} loading={loading} icon={Sparkles} />
      </div>

      {/* Feed */}
      <div className="bg-card border border-border rounded-xl">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <div className="text-sm font-medium">
            Activity feed
            {selectedStore && (
              <span className="text-muted-foreground font-normal">
                {" "}· {selectedStore.name}
                {data?.ad_account_name && ` · ${data.ad_account_name}`}
              </span>
            )}
          </div>
          {data && (
            <div className="text-xs text-muted-foreground">
              {data.start_date} → {data.end_date}
            </div>
          )}
        </div>

        {error && (
          <div className="p-6 text-sm text-red-600">{error}</div>
        )}

        {loading && !data && (
          <div className="p-5 space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-14 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        )}

        {!loading && data && data.items.length === 0 && (
          <div className="p-12 text-center text-muted-foreground text-sm">
            No activity in this window. Try widening the date range.
          </div>
        )}

        {data && data.items.length > 0 && (
          <div className="divide-y divide-border">
            {grouped.map((group) => (
              <div key={group.day}>
                <div className="px-5 py-2 bg-muted/40 text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center justify-between">
                  <span>{formatDayHeader(group.day)}</span>
                  <span className="font-normal normal-case">{group.items.length} action{group.items.length === 1 ? "" : "s"}</span>
                </div>
                <ul>
                  {group.items.map((it) => (
                    <ActivityRow key={`${it.type}:${it.id}:${it.action_time}`} item={it} currency={currency} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  loading,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number | undefined;
  loading: boolean;
  icon?: typeof Plus;
  accent?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        {Icon && <Icon className={cn("w-3.5 h-3.5", accent || "text-muted-foreground")} />}
      </div>
      <div className={cn("mt-1 text-2xl font-semibold tabular-nums", accent)}>
        {loading || value === undefined ? <span className="inline-block h-6 w-10 bg-muted animate-pulse rounded" /> : value.toLocaleString()}
      </div>
    </div>
  );
}

function ActivityRow({ item, currency }: { item: ActivityItem; currency: string }) {
  const meta = TYPE_META[item.type];
  const Icon = meta.icon;
  const ActionIcon = item.action === "created" ? Plus : Pencil;
  const actionColor = item.action === "created" ? "text-green-600 bg-green-50" : "text-blue-600 bg-blue-50";

  const extras: string[] = [];
  if (item.extra) {
    if (item.type === "campaign") {
      const daily = dollarsToCurrency(item.extra.daily_spend_cap, currency);
      const lifetime = dollarsToCurrency(item.extra.lifetime_spend_cap, currency);
      if (daily) extras.push(`Daily cap ${daily}`);
      if (lifetime) extras.push(`Lifetime cap ${lifetime}`);
      if (item.extra.objective_type) extras.push(String(item.extra.objective_type));
    }
    if (item.type === "ad_group") {
      const budget = microsToCurrency(item.extra.budget_in_micro_currency, currency);
      const bid = microsToCurrency(item.extra.bid_in_micro_currency, currency);
      if (budget) extras.push(`Budget ${budget}`);
      if (bid) extras.push(`Bid ${bid}`);
    }
    if (item.type === "ad") {
      if (item.extra.creative_type) extras.push(String(item.extra.creative_type));
    }
  }

  return (
    <li className="px-5 py-3 flex items-start gap-3 hover:bg-muted/30 transition-colors">
      <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn("text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded inline-flex items-center gap-1", actionColor)}>
            <ActionIcon className="w-3 h-3" />
            {item.action}
          </span>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
            {meta.label}
          </span>
          {item.status && (
            <span className={cn("text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded font-medium", statusBadge(item.status))}>
              {item.status}
            </span>
          )}
        </div>
        <div className="text-sm font-medium mt-1 truncate">{item.name}</div>
        {extras.length > 0 && (
          <div className="text-xs text-muted-foreground mt-0.5 truncate">
            {extras.join(" · ")}
          </div>
        )}
      </div>
      <div className="text-xs text-muted-foreground tabular-nums whitespace-nowrap pt-1">
        {formatTime(item.action_time)}
      </div>
    </li>
  );
}
