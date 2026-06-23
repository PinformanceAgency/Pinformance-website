"use client";

/**
 * Admin → Activity. For the head of media buying.
 *
 * Two data sources fused into one feed:
 *  - /api/admin/activity          → Pinterest API, gives exact created_time
 *    for every campaign/ad-group/ad created in the window. Reliable
 *    immediately, independent of snapshot history.
 *  - /api/admin/activity/changes  → snapshot-diff engine. Detects status
 *    flips (paused/archived), budget/bid/cap edits, renames, deletions.
 *    Only meaningful for dates AFTER snapshotting started, so we surface
 *    an empty-state when there's no snapshot history yet.
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
  Plus,
  PauseCircle,
  XCircle,
  Edit3,
  DollarSign,
  Tag,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Store {
  id: string;
  name: string;
  slug: string;
  ad_account_id: string | null;
}

interface CreateItem {
  id: string;
  type: "campaign" | "ad_group" | "ad";
  name: string;
  status: string | null;
  action_time: number;
}

interface CreatesResponse {
  ok: true;
  ad_account_name: string;
  currency: string;
  totals: { total: number; by_type: { campaign: number; ad_group: number; ad: number } };
  items: CreateItem[];
}

interface ChangeEvent {
  entity_id: string;
  entity_type: "campaign" | "ad_group" | "ad";
  name: string;
  kind: "created" | "removed" | "status" | "budget" | "bid" | "cap" | "renamed";
  date: string;
  from?: string | number | null;
  to?: string | number | null;
  detail: string;
  status_now: string | null;
}

interface ChangesResponse {
  ok: true;
  earliest_snapshot: string | null;
  totals: {
    total: number;
    ads_killed: number;
    campaigns_off: number;
    by_kind: Record<string, number>;
  };
  events: ChangeEvent[];
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

const TYPE_META: Record<CreateItem["type"], { label: string; icon: typeof Layers }> = {
  campaign: { label: "Campaign", icon: Megaphone },
  ad_group: { label: "Ad group", icon: Layers },
  ad: { label: "Ad", icon: ImageIcon },
};

const KIND_META: Record<
  ChangeEvent["kind"],
  { label: string; icon: typeof Plus; color: string }
> = {
  created: { label: "Created", icon: Plus, color: "text-green-600 bg-green-50" },
  removed: { label: "Removed", icon: XCircle, color: "text-red-600 bg-red-50" },
  status: { label: "Status", icon: PauseCircle, color: "text-amber-600 bg-amber-50" },
  budget: { label: "Budget", icon: DollarSign, color: "text-blue-600 bg-blue-50" },
  bid: { label: "Bid", icon: DollarSign, color: "text-blue-600 bg-blue-50" },
  cap: { label: "Cap", icon: DollarSign, color: "text-blue-600 bg-blue-50" },
  renamed: { label: "Renamed", icon: Tag, color: "text-purple-600 bg-purple-50" },
};

function statusBadge(status: string | null): string {
  const s = (status || "").toUpperCase();
  if (s === "ACTIVE") return "bg-green-100 text-green-700";
  if (s === "PAUSED") return "bg-yellow-100 text-yellow-700";
  if (s === "ARCHIVED") return "bg-zinc-200 text-zinc-600";
  return "bg-muted text-muted-foreground";
}

function formatDayHeader(dayKey: string) {
  const today = new Date();
  const yest = new Date();
  yest.setDate(yest.getDate() - 1);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  if (dayKey === fmt(today)) return "Today";
  if (dayKey === fmt(yest)) return "Yesterday";
  const d = new Date(dayKey + "T12:00:00");
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

// Unify creates + changes into one event stream for the feed.
interface FeedEvent {
  key: string;
  date: string;
  entity_id: string;
  entity_type: "campaign" | "ad_group" | "ad";
  name: string;
  kind: ChangeEvent["kind"];
  detail: string;
  status_now: string | null;
  sort: number;
}

export default function AdminActivityPage() {
  const { isAgencyAdmin, loading: authLoading } = useOrg();
  const router = useRouter();

  const [stores, setStores] = useState<Store[] | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("7d");
  const [customStart, setCustomStart] = useState<string>(isoDaysAgo(7));
  const [customEnd, setCustomEnd] = useState<string>(todayIso());
  const [creates, setCreates] = useState<CreatesResponse | null>(null);
  const [changes, setChanges] = useState<ChangesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "creates" | "kills" | "edits">("all");

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
    setCreates(null);
    setChanges(null);
    const body = JSON.stringify({
      org_id: selectedStoreId,
      start_date: startDate,
      end_date: endDate,
    });
    Promise.all([
      fetch("/api/admin/activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      }).then((r) => r.json()),
      fetch("/api/admin/activity/changes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      }).then((r) => r.json()),
    ])
      .then(([c, ch]) => {
        if (!c.ok) throw new Error(c.error || "Failed to load creates");
        if (!ch.ok) throw new Error(ch.error || "Failed to load changes");
        setCreates(c);
        setChanges(ch);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [selectedStoreId, startDate, endDate]);

  // Merge creates (from Pinterest API) + diff events (from snapshots) into a
  // single feed. Dedupe by (entity_id + 'created') so a created event detected
  // by both sources only renders once — prefer the Pinterest API one (it has
  // a real timestamp inside the day).
  const merged: FeedEvent[] = useMemo(() => {
    const map = new Map<string, FeedEvent>();
    if (creates) {
      for (const c of creates.items) {
        const date = new Date(c.action_time * 1000).toISOString().slice(0, 10);
        map.set(`${c.id}:created`, {
          key: `${c.id}:created:${c.action_time}`,
          date,
          entity_id: c.id,
          entity_type: c.type,
          name: c.name,
          kind: "created",
          detail: "Newly created",
          status_now: c.status,
          sort: c.action_time,
        });
      }
    }
    if (changes) {
      for (const ev of changes.events) {
        if (ev.kind === "created" && map.has(`${ev.entity_id}:created`)) continue;
        const key = `${ev.entity_id}:${ev.kind}:${ev.date}:${ev.from ?? ""}:${ev.to ?? ""}`;
        map.set(key, {
          key,
          date: ev.date,
          entity_id: ev.entity_id,
          entity_type: ev.entity_type,
          name: ev.name,
          kind: ev.kind,
          detail: ev.detail,
          status_now: ev.status_now,
          sort: new Date(ev.date + "T00:00:00Z").getTime() / 1000,
        });
      }
    }
    const arr = Array.from(map.values()).sort((a, b) => b.sort - a.sort);
    return arr;
  }, [creates, changes]);

  const filtered = useMemo(() => {
    if (filter === "all") return merged;
    if (filter === "creates") return merged.filter((e) => e.kind === "created");
    if (filter === "kills")
      return merged.filter(
        (e) => e.kind === "removed" || (e.kind === "status" && (e.status_now === "PAUSED" || e.status_now === "ARCHIVED"))
      );
    return merged.filter((e) => e.kind === "budget" || e.kind === "bid" || e.kind === "cap" || e.kind === "renamed");
  }, [merged, filter]);

  const grouped = useMemo(() => {
    const map = new Map<string, FeedEvent[]>();
    for (const ev of filtered) {
      if (!map.has(ev.date)) map.set(ev.date, []);
      map.get(ev.date)!.push(ev);
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [filtered]);

  if (authLoading) {
    return <div className="h-8 w-48 bg-muted animate-pulse rounded" />;
  }

  const selectedStore = stores?.find((s) => s.id === selectedStoreId) || null;

  // Stats derived from the actual data sources.
  const newCampaigns = creates?.totals.by_type.campaign ?? 0;
  const newAds = creates?.totals.by_type.ad ?? 0;
  const newAdGroups = creates?.totals.by_type.ad_group ?? 0;
  const adsKilled = changes?.totals.ads_killed ?? 0;
  const campaignsOff = changes?.totals.campaigns_off ?? 0;
  const edits =
    (changes?.totals.by_kind.budget ?? 0) +
    (changes?.totals.by_kind.bid ?? 0) +
    (changes?.totals.by_kind.cap ?? 0) +
    (changes?.totals.by_kind.renamed ?? 0);

  const noSnapshots = !!changes && changes.earliest_snapshot === null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Activity className="w-6 h-6 text-primary" /> Ad Account Activity
        </h1>
        <p className="text-muted-foreground mt-1 text-sm max-w-2xl">
          Real changes the media buyer made in the selected store&apos;s Pinterest
          ad account. Creations come directly from Pinterest; status flips,
          kills, budget edits and renames are detected by diffing daily
          snapshots stored by Pinformance.
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
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

      {/* KPI cards — what the head of mediabuying actually wants */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="New campaigns" value={newCampaigns} loading={loading} icon={Megaphone} accent="text-green-600" />
        <StatCard label="New ad groups" value={newAdGroups} loading={loading} icon={Layers} accent="text-green-600" />
        <StatCard label="New ads" value={newAds} loading={loading} icon={Plus} accent="text-green-600" />
        <StatCard label="Campaigns off" value={campaignsOff} loading={loading} icon={PauseCircle} accent="text-amber-600" />
        <StatCard label="Ads killed" value={adsKilled} loading={loading} icon={XCircle} accent="text-red-600" />
        <StatCard label="Edits" value={edits} loading={loading} icon={Edit3} accent="text-blue-600" />
      </div>

      {noSnapshots && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-900 text-sm px-4 py-3 flex items-start gap-2">
          <RotateCcw className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            Snapshotting for this store hasn&apos;t started yet — the daily cron
            runs at 05:30 UTC. Until at least 2 snapshots exist we can only show
            <strong> new </strong>campaigns/ad-groups/ads (from Pinterest&apos;s
            <code className="mx-1">created_time</code>). Status flips, pauses,
            budget edits and kills will appear from the next snapshot onwards.
          </div>
        </div>
      )}

      {/* Feed */}
      <div className="bg-card border border-border rounded-xl">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between flex-wrap gap-2">
          <div className="text-sm font-medium">
            Activity feed
            {selectedStore && (
              <span className="text-muted-foreground font-normal">
                {" "}· {selectedStore.name}
                {creates?.ad_account_name && ` · ${creates.ad_account_name}`}
              </span>
            )}
          </div>
          <div className="flex bg-muted/50 rounded-md p-0.5">
            {(["all", "creates", "kills", "edits"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "px-2.5 py-1 text-xs font-medium rounded transition-colors capitalize",
                  filter === f ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {error && <div className="p-6 text-sm text-red-600">{error}</div>}

        {loading && (
          <div className="p-5 space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-14 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="p-12 text-center text-muted-foreground text-sm">
            No matching activity in this window.
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="divide-y divide-border">
            {grouped.map(([day, items]) => (
              <div key={day}>
                <div className="px-5 py-2 bg-muted/40 text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center justify-between">
                  <span>{formatDayHeader(day)}</span>
                  <span className="font-normal normal-case">
                    {items.length} {items.length === 1 ? "change" : "changes"}
                  </span>
                </div>
                <ul>
                  {items.map((ev) => (
                    <FeedRow key={ev.key} ev={ev} />
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
  value: number;
  loading: boolean;
  icon: typeof Plus;
  accent: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <Icon className={cn("w-3.5 h-3.5", accent)} />
      </div>
      <div className={cn("mt-1 text-2xl font-semibold tabular-nums", accent)}>
        {loading ? (
          <span className="inline-block h-6 w-10 bg-muted animate-pulse rounded" />
        ) : (
          value.toLocaleString()
        )}
      </div>
    </div>
  );
}

function FeedRow({ ev }: { ev: FeedEvent }) {
  const typeMeta = TYPE_META[ev.entity_type];
  const kindMeta = KIND_META[ev.kind];
  const TypeIcon = typeMeta.icon;
  const KindIcon = kindMeta.icon;

  return (
    <li className="px-5 py-3 flex items-start gap-3 hover:bg-muted/30 transition-colors">
      <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
        <TypeIcon className="w-4 h-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={cn(
              "text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded inline-flex items-center gap-1",
              kindMeta.color
            )}
          >
            <KindIcon className="w-3 h-3" />
            {kindMeta.label}
          </span>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
            {typeMeta.label}
          </span>
          {ev.status_now && (
            <span
              className={cn(
                "text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded font-medium",
                statusBadge(ev.status_now)
              )}
            >
              {ev.status_now}
            </span>
          )}
        </div>
        <div className="text-sm font-medium mt-1 truncate">{ev.name}</div>
        <div className="text-xs text-muted-foreground mt-0.5 truncate">{ev.detail}</div>
      </div>
    </li>
  );
}
