"use client";

import { useMemo, useState } from "react";
import {
  Search,
  ArrowUpDown,
  ExternalLink,
  Video as VideoIcon,
  Image as ImageIcon,
  Images as ImagesIcon,
  BookOpen as StoryIcon,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { EntityRow } from "@/lib/media-buying/types";

type SortKey = "spend" | "revenue" | "conversions" | "roas" | "cpa" | "created";

const SORT_OPTIONS: { key: SortKey; label: string; direction: "asc" | "desc" }[] = [
  { key: "spend", label: "Spend (high → low)", direction: "desc" },
  { key: "revenue", label: "Revenue (high → low)", direction: "desc" },
  { key: "conversions", label: "Conversions (high → low)", direction: "desc" },
  { key: "roas", label: "ROAS (high → low)", direction: "desc" },
  { key: "cpa", label: "CPA (low → high)", direction: "asc" },
  { key: "created", label: "Most recent first", direction: "desc" },
];

// `null` means "show all rows" (used for "All" option in the page size
// selector). 10 is the default landing size — the user can opt into more.
type PageSize = 10 | 25 | 50 | 100 | null;
const PAGE_SIZE_OPTIONS: { value: PageSize; label: string }[] = [
  { value: 10, label: "10" },
  { value: 25, label: "25" },
  { value: 50, label: "50" },
  { value: 100, label: "100" },
  { value: null, label: "All" },
];

const fmtCurrency = (n: number | null, currency: string): string => {
  if (n == null || !isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: n >= 1000 ? 0 : 2,
  }).format(n);
};
const fmtRoas = (n: number | null): string =>
  n == null || !isFinite(n) ? "—" : `${n.toFixed(2)}x`;
const fmtNum = (n: number | null): string =>
  n == null ? "—" : new Intl.NumberFormat("en-US").format(Math.round(n));

function roasClass(roas: number, spend: number): string {
  if (spend === 0) return "text-muted-foreground";
  if (roas >= 3) return "text-emerald-600 dark:text-emerald-400 font-medium";
  if (roas >= 1.5) return "text-foreground";
  return "text-amber-600 dark:text-amber-400 font-medium";
}

function FallbackThumb({ creativeType }: { creativeType: string | null | undefined }) {
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

function VideoBadge() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
      <div className="w-5 h-5 rounded-full bg-white/85 flex items-center justify-center">
        <svg className="w-2.5 h-2.5 text-black" fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 5v14l11-7z" />
        </svg>
      </div>
    </div>
  );
}

interface AdPerformanceTableProps {
  ads: EntityRow[];
  currency: string;
  loading: boolean;
  /** Optional title above the table. */
  title?: string;
  /** Optional description below the title. */
  description?: string;
}

export function AdPerformanceTable({
  ads,
  currency,
  loading,
  title = "All ads",
  description = "Per-ad performance for the period. Search by ad name (or any naming-convention token) and sort by any KPI.",
}: AdPerformanceTableProps) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("spend");
  const [pageSize, setPageSize] = useState<PageSize>(10);

  const filtered = useMemo(() => {
    // Comma-separated tokens, all must match (AND). So "video, UGC" only
    // returns ads whose name contains BOTH "video" AND "UGC". Empty tokens
    // (from a trailing comma or double comma) are skipped.
    const tokens = query
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0);
    if (tokens.length === 0) return ads;
    return ads.filter((a) => {
      const name = a.name.toLowerCase();
      return tokens.every((t) => name.includes(t));
    });
  }, [ads, query]);

  const sorted = useMemo(() => {
    const opt = SORT_OPTIONS.find((o) => o.key === sortKey)!;
    const getVal = (r: EntityRow): number => {
      switch (sortKey) {
        case "spend":
          return r.spend;
        case "revenue":
          return r.revenue;
        case "conversions":
          return r.conversions;
        case "roas":
          return r.spend > 0 ? r.roas : -Infinity;
        case "cpa":
          return r.cpa != null && r.cpa > 0 ? r.cpa : Number.POSITIVE_INFINITY;
        case "created":
          return r.created_time ?? 0;
      }
    };
    const out = [...filtered];
    out.sort((a, b) => {
      const av = getVal(a);
      const bv = getVal(b);
      return opt.direction === "desc" ? bv - av : av - bv;
    });
    return out;
  }, [filtered, sortKey]);

  // Total row across the *filtered* set so the user sees the aggregate of
  // what they're currently looking at — not the always-the-same account
  // total (which is already in the KPI strip).
  const totals = useMemo(() => {
    let spend = 0,
      revenue = 0,
      conversions = 0;
    for (const r of filtered) {
      spend += r.spend;
      revenue += r.revenue;
      conversions += r.conversions;
    }
    const roas = spend > 0 ? revenue / spend : 0;
    const cpa = conversions > 0 ? spend / conversions : null;
    return { spend, revenue, conversions, roas, cpa };
  }, [filtered]);

  // Page-size limited view. Default 10 — users opt into 25/50/100/All for
  // wider browsing without paying the render cost upfront on huge accounts.
  const visible = useMemo(() => {
    if (pageSize === null) return sorted;
    return sorted.slice(0, pageSize);
  }, [sorted, pageSize]);

  return (
    <section className="bg-card border border-border rounded-2xl p-5">
      <div className="mb-4 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-semibold">
            {title}{" "}
            <span className="text-muted-foreground font-normal">
              ({filtered.length}
              {filtered.length !== ads.length ? ` of ${ads.length}` : ""})
            </span>
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search ad name (comma = AND)"
              className="pl-8 pr-7 py-1.5 text-xs rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 w-56"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                title="Clear search"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="inline-flex items-center gap-1.5">
            <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Sort:</span>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="px-2.5 py-1 text-xs font-medium rounded-lg border border-border bg-card text-foreground hover:bg-muted"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="inline-flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Show:</span>
            <select
              value={pageSize === null ? "all" : String(pageSize)}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "all") setPageSize(null);
                else setPageSize(Number(v) as PageSize);
              }}
              className="px-2.5 py-1 text-xs font-medium rounded-lg border border-border bg-card text-foreground hover:bg-muted"
            >
              {PAGE_SIZE_OPTIONS.map((o) => (
                <option key={String(o.value)} value={o.value === null ? "all" : String(o.value)}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading && ads.length === 0 ? (
        <div className="h-48 bg-muted/30 animate-pulse rounded-xl" />
      ) : sorted.length === 0 ? (
        <div className="text-sm text-muted-foreground py-10 text-center">
          {query ? `No ads match "${query}".` : "No ads to show for this period."}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="text-left font-medium px-3 py-2.5">Ad</th>
                <th className="text-right font-medium px-3 py-2.5">Spend</th>
                <th className="text-right font-medium px-3 py-2.5">Revenue</th>
                <th className="text-right font-medium px-3 py-2.5">Conv.</th>
                <th className="text-right font-medium px-3 py-2.5">ROAS</th>
                <th className="text-right font-medium px-3 py-2.5">CPA</th>
              </tr>
            </thead>
            <tbody>
              <tr className="bg-muted/30 border-t-2 border-border font-medium">
                <td className="px-3 py-2.5 text-xs uppercase tracking-wider text-muted-foreground">
                  Total ({filtered.length} ad{filtered.length === 1 ? "" : "s"})
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {fmtCurrency(totals.spend, currency)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {fmtCurrency(totals.revenue, currency)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {fmtNum(totals.conversions)}
                </td>
                <td className={cn("px-3 py-2.5 text-right tabular-nums", roasClass(totals.roas, totals.spend))}>
                  {fmtRoas(totals.roas)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {fmtCurrency(totals.cpa, currency)}
                </td>
              </tr>
              {visible.map((a) => {
                const isVideo = (a.creative_type || "").toUpperCase().includes("VIDEO");
                const pinUrl = a.pin_id ? `https://www.pinterest.com/pin/${a.pin_id}/` : null;
                const thumb = (
                  <div className="relative w-12 h-12 rounded-lg bg-muted overflow-hidden flex items-center justify-center flex-shrink-0">
                    {a.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={a.image_url}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <FallbackThumb creativeType={a.creative_type} />
                    )}
                    {isVideo && a.image_url && <VideoBadge />}
                  </div>
                );
                return (
                  <tr
                    key={a.id}
                    className="border-t border-border hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3 min-w-0 max-w-[560px]">
                        {pinUrl ? (
                          <a
                            href={pinUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Open pin on Pinterest"
                            className="group block rounded-lg overflow-hidden hover:ring-2 hover:ring-primary/50 transition-all flex-shrink-0"
                          >
                            {thumb}
                          </a>
                        ) : (
                          thumb
                        )}
                        <div className="min-w-0">
                          <div
                            className="font-medium truncate flex items-center gap-1.5"
                            title={a.name}
                          >
                            {pinUrl ? (
                              <a
                                href={pinUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:text-primary inline-flex items-center gap-1 truncate"
                              >
                                <span className="truncate">{a.name}</span>
                                <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-60 flex-shrink-0" />
                              </a>
                            ) : (
                              <span className="truncate">{a.name}</span>
                            )}
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            {a.created_time && (
                              <>
                                Launched{" "}
                                {new Date(a.created_time * 1000).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                })}
                              </>
                            )}
                            {a.parsed.unknown && (a.parsed.unknown as string[]).length > 0 && (
                              <span className="ml-2 text-amber-700/80">
                                · non-standard naming
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-foreground">
                      {fmtCurrency(a.spend, currency)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-foreground">
                      {fmtCurrency(a.revenue, currency)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-foreground">
                      {fmtNum(a.conversions)}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-3 text-right tabular-nums",
                        roasClass(a.roas, a.spend)
                      )}
                    >
                      {fmtRoas(a.roas)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-foreground">
                      {fmtCurrency(a.cpa, currency)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {visible.length < sorted.length && (
            <div className="px-3 py-3 text-xs text-muted-foreground text-center border-t border-border bg-muted/10">
              Showing {visible.length} of {sorted.length} ads — change{" "}
              <span className="font-medium text-foreground">Show</span> above to see more.
            </div>
          )}
        </div>
      )}
    </section>
  );
}
