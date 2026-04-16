"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/hooks/use-org";
import { useRouter } from "next/navigation";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowRight,
  Sparkles,
  Clock,
  CheckCircle2,
  Image as ImageIcon,
  Send,
  Info,
} from "lucide-react";
import Link from "next/link";

/* ─── Types ─── */

interface OverallPerformance {
  impressions: { current: number; previous: number };
  engagements: { current: number; previous: number };
  outbound_clicks: { current: number; previous: number };
  saves: { current: number; previous: number };
  total_audience: number;
  engaged_audience: number;
}

interface ConversionInsights {
  revenue: { current: number; previous: number };
  page_visits: { current: number; previous: number };
  add_to_cart: { current: number; previous: number };
  checkouts: { current: number; previous: number };
  aov: { current: number; previous: number };
}

interface PipelineStats {
  total_pins: number;
  posted_pins: number;
  scheduled_pins: number;
  generating_pins: number;
  approved_pins: number;
  total_boards: number;
}

interface TopPin {
  id: string;
  title: string;
  image_url: string | null;
  impressions: number;
  saves: number;
  clicks: number;
  engagement: number;
}

/* ─── Helpers ─── */

function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(2) + "M";
  if (num >= 1000) return (num / 1000).toFixed(1) + "K";
  return num.toLocaleString();
}

function formatCurrency(num: number): string {
  if (num === 0) return "0.00";
  if (num >= 1000000) return (num / 1000000).toFixed(2) + "M";
  if (num >= 1000) return (num / 1000).toFixed(2) + "K";
  return num.toFixed(2);
}

function calcTrend(current: number, previous: number): { value: number; direction: "up" | "down" | "neutral" } {
  if (previous === 0 && current === 0) return { value: 0, direction: "neutral" };
  if (previous === 0) return { value: 100, direction: "up" };
  const change = ((current - previous) / previous) * 100;
  return {
    value: Math.abs(Math.round(change)),
    direction: change > 0 ? "up" : change < 0 ? "down" : "neutral",
  };
}

function TrendIndicator({ trend }: { trend: { value: number; direction: "up" | "down" | "neutral" } }) {
  if (trend.direction === "neutral") {
    return <span className="text-xs text-muted-foreground ml-1">--</span>;
  }
  const color = trend.direction === "up" ? "text-green-600" : "text-red-500";
  const arrow = trend.direction === "up" ? "↑" : "↓";
  return (
    <span className={`text-xs font-medium ${color} ml-1.5 inline-flex items-center gap-0.5`}>
      {arrow} {trend.value}%
    </span>
  );
}

/* ─── Main Component ─── */

export default function OverviewPage() {
  const { org, user, loading } = useOrg();
  const router = useRouter();
  const [overall, setOverall] = useState<OverallPerformance | null>(null);
  const [conversion, setConversion] = useState<ConversionInsights | null>(null);
  const [pipeline, setPipeline] = useState<PipelineStats | null>(null);
  const [topPins, setTopPins] = useState<TopPin[]>([]);
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("30d");

  useEffect(() => {
    if (loading) return;
    if (!user) return;
    if (!user.onboarding_completed_at && !org?.onboarding_completed_at) {
      router.push("/onboarding");
    }
  }, [loading, user, org, router]);

  useEffect(() => {
    if (!org || !user) return;
    if (!user.onboarding_completed_at && !org.onboarding_completed_at) return;

    async function loadStats() {
      const supabase = createClient();
      const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
      const now = new Date();
      const currentStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const previousStart = new Date(now.getTime() - days * 2 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

      const [
        pinsResult,
        boardsResult,
        currentAccount,
        previousAccount,
        currentSales,
        previousSales,
        topPinsResult,
        orgResult,
      ] = await Promise.all([
        supabase.from("pins").select("id, status").eq("org_id", org!.id),
        supabase.from("boards").select("id", { count: "exact" }).eq("org_id", org!.id),
        supabase.from("account_analytics").select("*").eq("org_id", org!.id).gte("date", currentStart),
        supabase.from("account_analytics").select("*").eq("org_id", org!.id).gte("date", previousStart).lt("date", currentStart),
        supabase.from("sales_data").select("*").eq("org_id", org!.id).eq("source", "pinterest").gte("date", currentStart),
        supabase.from("sales_data").select("*").eq("org_id", org!.id).eq("source", "pinterest").gte("date", previousStart).lt("date", currentStart),
        supabase.from("pins").select("id, title, image_url").eq("org_id", org!.id).eq("status", "posted").order("created_at", { ascending: false }).limit(5),
        supabase.from("organizations").select("pinterest_follower_count, pinterest_monthly_views").eq("id", org!.id).single(),
      ]);

      const pins = pinsResult.data || [];
      const currAccount = currentAccount.data || [];
      const prevAccount = previousAccount.data || [];

      const sum = (data: Record<string, number>[], field: string) =>
        data.reduce((s, a) => s + ((a as Record<string, number>)[field] || 0), 0);

      // Engaged audience = unique engagers approximation (saves + pin_clicks for the period)
      const currEngagedAudience = sum(currAccount, "saves") + sum(currAccount, "pin_clicks");
      const prevEngagedAudience = sum(prevAccount, "saves") + sum(prevAccount, "pin_clicks");

      setOverall({
        impressions: { current: sum(currAccount, "impressions"), previous: sum(prevAccount, "impressions") },
        engagements: { current: sum(currAccount, "engagement"), previous: sum(prevAccount, "engagement") },
        outbound_clicks: { current: sum(currAccount, "outbound_clicks"), previous: sum(prevAccount, "outbound_clicks") },
        saves: { current: sum(currAccount, "saves"), previous: sum(prevAccount, "saves") },
        total_audience: 0,
        engaged_audience: currEngagedAudience,
      });

      const currSales = currentSales.data || [];
      const prevSales = previousSales.data || [];
      const currRev = sum(currSales, "sales_revenue");
      const prevRev = sum(prevSales, "sales_revenue");
      const currCheckouts = sum(currSales, "sales_count");
      const prevCheckouts = sum(prevSales, "sales_count");

      setConversion({
        revenue: { current: currRev, previous: prevRev },
        page_visits: { current: sum(currSales, "page_visits"), previous: sum(prevSales, "page_visits") },
        add_to_cart: { current: sum(currSales, "add_to_cart_count"), previous: sum(prevSales, "add_to_cart_count") },
        checkouts: { current: currCheckouts, previous: prevCheckouts },
        aov: {
          current: currCheckouts > 0 ? currRev / currCheckouts : 0,
          previous: prevCheckouts > 0 ? prevRev / prevCheckouts : 0,
        },
      });

      setPipeline({
        total_pins: pins.length,
        posted_pins: pins.filter((p) => p.status === "posted").length,
        scheduled_pins: pins.filter((p) => p.status === "scheduled").length,
        generating_pins: pins.filter((p) => p.status === "generating" || p.status === "generated").length,
        approved_pins: pins.filter((p) => p.status === "approved").length,
        total_boards: boardsResult.count || 0,
      });

      if (topPinsResult.data && topPinsResult.data.length > 0) {
        const pinIds = topPinsResult.data.map((p) => p.id);
        const { data: pinAnalytics } = await supabase
          .from("pin_analytics")
          .select("pin_id, impressions, saves, pin_clicks")
          .in("pin_id", pinIds);

        const analyticsMap: Record<string, { impressions: number; saves: number; clicks: number }> = {};
        (pinAnalytics || []).forEach((a) => {
          if (!analyticsMap[a.pin_id]) analyticsMap[a.pin_id] = { impressions: 0, saves: 0, clicks: 0 };
          analyticsMap[a.pin_id].impressions += a.impressions || 0;
          analyticsMap[a.pin_id].saves += a.saves || 0;
          analyticsMap[a.pin_id].clicks += a.pin_clicks || 0;
        });

        const enrichedPins: TopPin[] = topPinsResult.data.map((p) => {
          const a = analyticsMap[p.id] || { impressions: 0, saves: 0, clicks: 0 };
          return {
            id: p.id, title: p.title, image_url: p.image_url,
            impressions: a.impressions, saves: a.saves, clicks: a.clicks,
            engagement: a.impressions > 0 ? ((a.saves + a.clicks) / a.impressions) * 100 : 0,
          };
        });
        enrichedPins.sort((a, b) => b.impressions - a.impressions);
        setTopPins(enrichedPins);
      }
    }

    loadStats();
  }, [org, user, router, period]);

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!org || !user) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-sm text-muted-foreground">Unable to load your workspace.</p>
      </div>
    );
  }

  const periodLabel = period === "7d" ? "7 days" : period === "30d" ? "30 days" : "90 days";

  const impressionsTrend = calcTrend(overall?.impressions.current || 0, overall?.impressions.previous || 0);
  const engagementsTrend = calcTrend(overall?.engagements.current || 0, overall?.engagements.previous || 0);
  const outboundTrend = calcTrend(overall?.outbound_clicks.current || 0, overall?.outbound_clicks.previous || 0);
  const savesTrend = calcTrend(overall?.saves.current || 0, overall?.saves.previous || 0);
  const revenueTrend = calcTrend(conversion?.revenue.current || 0, conversion?.revenue.previous || 0);
  const pageVisitsTrend = calcTrend(conversion?.page_visits.current || 0, conversion?.page_visits.previous || 0);
  const atcTrend = calcTrend(conversion?.add_to_cart.current || 0, conversion?.add_to_cart.previous || 0);
  const checkoutsTrend = calcTrend(conversion?.checkouts.current || 0, conversion?.checkouts.previous || 0);
  const aovTrend = calcTrend(conversion?.aov.current || 0, conversion?.aov.previous || 0);

  return (
    <div className="space-y-8 min-h-full -m-8 p-8">
      {/* ── Header ── */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-xl font-semibold tracking-tight">Overview</h1>
          <div className="flex items-center gap-1 border rounded-lg p-0.5">
            {(["7d", "30d", "90d"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                  period === p
                    ? "bg-foreground text-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Last {p === "7d" ? "7 days" : p === "30d" ? "30 days" : "90 days"}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Pinterest organic performance and conversion metrics
        </p>
      </div>

      {/* ══════════════════════════════════════════ */}
      {/* OVERALL PERFORMANCE                       */}
      {/* ══════════════════════════════════════════ */}
      <div>
        <div className="flex items-center gap-1.5 mb-4">
          <h2 className="text-sm font-semibold">Overall performance</h2>
          <Info className="w-3.5 h-3.5 text-muted-foreground" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-px bg-border rounded-xl overflow-hidden border">
          {[
            { label: "Impressions", value: formatNumber(overall?.impressions.current || 0), trend: impressionsTrend },
            { label: "Engagements", value: formatNumber(overall?.engagements.current || 0), trend: engagementsTrend },
            { label: "Outbound clicks", value: formatNumber(overall?.outbound_clicks.current || 0), trend: outboundTrend },
            { label: "Saves", value: formatNumber(overall?.saves.current || 0), trend: savesTrend },
            { label: "Engaged audience", value: formatNumber(overall?.engaged_audience || 0), trend: null },
          ].map(({ label, value, trend }) => (
            <div key={label} className="bg-background p-4">
              <div className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
                {label} <Info className="w-3 h-3" />
              </div>
              <div className="flex items-baseline">
                <span className="text-lg font-bold tracking-tight">{value}</span>
                {trend && <TrendIndicator trend={trend} />}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════ */}
      {/* CONVERSION INSIGHTS                       */}
      {/* ══════════════════════════════════════════ */}
      <div>
        <div className="flex items-center gap-1.5 mb-1">
          <h2 className="text-sm font-semibold">Conversion insights</h2>
          <Info className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Revenue and conversions from organic Pinterest traffic
        </p>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-px bg-border rounded-xl overflow-hidden border">
          {[
            { label: "Page visits", value: formatNumber(conversion?.page_visits.current || 0), trend: pageVisitsTrend },
            { label: "Add to basket", value: formatNumber(conversion?.add_to_cart.current || 0), trend: atcTrend },
            { label: "Checkouts", value: formatNumber(conversion?.checkouts.current || 0), trend: checkoutsTrend },
            { label: "Average order value", value: formatCurrency(conversion?.aov.current || 0), trend: aovTrend },
            { label: "Revenue", value: formatCurrency(conversion?.revenue.current || 0), trend: revenueTrend },
          ].map(({ label, value, trend }) => (
            <div key={label} className="bg-background p-4">
              <div className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
                {label} <Info className="w-3 h-3" />
              </div>
              <div className="flex items-baseline">
                <span className="text-lg font-bold tracking-tight">{value}</span>
                <TrendIndicator trend={trend} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════ */}
      {/* CONTENT PIPELINE                          */}
      {/* ══════════════════════════════════════════ */}
      <div className="border rounded-xl p-6 bg-background">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-sm font-semibold">Content Pipeline</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Your pins at every stage</p>
          </div>
          <Link href="/pins" className="text-xs text-primary flex items-center gap-1 hover:underline">
            View all pins <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Generating", count: pipeline?.generating_pins || 0, icon: Sparkles, color: "amber" },
            { label: "Approved", count: pipeline?.approved_pins || 0, icon: CheckCircle2, color: "blue" },
            { label: "Scheduled", count: pipeline?.scheduled_pins || 0, icon: Clock, color: "purple" },
            { label: "Posted", count: pipeline?.posted_pins || 0, icon: Send, color: "green" },
          ].map(({ label, count, icon: Icon, color }) => (
            <div key={label} className={`bg-${color}-50/50 dark:bg-${color}-950/20 border border-${color}-100 dark:border-${color}-900/30 rounded-lg p-4 text-center`}>
              <div className={`w-8 h-8 bg-${color}-100 dark:bg-${color}-900/30 rounded-full flex items-center justify-center mx-auto mb-2`}>
                <Icon className={`w-4 h-4 text-${color}-600`} />
              </div>
              <div className={`text-xl font-bold text-${color}-700 dark:text-${color}-400`}>{count}</div>
              <div className={`text-[11px] text-${color}-600/80 font-medium mt-0.5`}>{label}</div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-center gap-0 mt-4 px-8">
          <div className="flex-1 h-1.5 bg-amber-200 dark:bg-amber-800/40 rounded-l-full" />
          <div className="flex-1 h-1.5 bg-blue-200 dark:bg-blue-800/40" />
          <div className="flex-1 h-1.5 bg-purple-200 dark:bg-purple-800/40" />
          <div className="flex-1 h-1.5 bg-green-200 dark:bg-green-800/40 rounded-r-full" />
        </div>
        <div className="flex items-center justify-between mt-1.5 px-8">
          <span className="text-[10px] text-muted-foreground">Create</span>
          <span className="text-[10px] text-muted-foreground">Review</span>
          <span className="text-[10px] text-muted-foreground">Schedule</span>
          <span className="text-[10px] text-muted-foreground">Live</span>
        </div>
      </div>

      {/* ══════════════════════════════════════════ */}
      {/* TOP PERFORMING PINS                       */}
      {/* ══════════════════════════════════════════ */}
      <div className="border rounded-xl p-6 bg-background">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold">Top Performing Pins</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Best content by impressions</p>
          </div>
          <Link href="/analytics" className="text-xs text-primary flex items-center gap-1 hover:underline">
            Full analytics <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {topPins.length === 0 ? (
          <div className="text-center py-10">
            <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-3">
              <ImageIcon className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">No posted pins yet</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Performance data will appear once pins are live</p>
          </div>
        ) : (
          <div className="divide-y">
            {topPins.map((pin, index) => (
              <Link
                key={pin.id}
                href={`/pins/${pin.id}`}
                className="flex items-center gap-4 py-3 hover:bg-muted/30 transition-colors -mx-2 px-2 rounded-lg group"
              >
                <span className="text-sm font-medium text-muted-foreground w-5 text-center">{index + 1}</span>
                <div className="w-10 h-14 bg-muted rounded-lg overflow-hidden flex-shrink-0">
                  {pin.image_url ? (
                    <img src={pin.image_url} alt={pin.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageIcon className="w-4 h-4 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate group-hover:text-primary transition-colors">{pin.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{pin.engagement.toFixed(1)}% engagement</div>
                </div>
                <div className="flex items-center gap-6 text-xs text-muted-foreground flex-shrink-0">
                  <div className="text-right">
                    <div className="font-medium text-foreground">{formatNumber(pin.impressions)}</div>
                    <div>impressions</div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium text-foreground">{formatNumber(pin.saves)}</div>
                    <div>saves</div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium text-foreground">{formatNumber(pin.clicks)}</div>
                    <div>clicks</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════ */}
      {/* QUICK ACTIONS                             */}
      {/* ══════════════════════════════════════════ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { href: "/pins", label: "Review Pins", sub: `${(pipeline?.generating_pins || 0) + (pipeline?.approved_pins || 0)} awaiting` },
          { href: "/calendar", label: "Content Calendar", sub: `${pipeline?.scheduled_pins || 0} scheduled` },
          { href: "/boards", label: "Manage Boards", sub: `${pipeline?.total_boards || 0} boards` },
          { href: "/analytics", label: "Full Analytics", sub: "Deep dive" },
        ].map(({ href, label, sub }) => (
          <Link
            key={href}
            href={href}
            className="border rounded-xl p-4 bg-background hover:bg-muted/30 transition-colors group"
          >
            <div className="text-sm font-medium group-hover:text-primary transition-colors">{label}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>
            <ArrowRight className="w-3.5 h-3.5 text-muted-foreground mt-2 group-hover:text-primary transition-colors" />
          </Link>
        ))}
      </div>
    </div>
  );
}
