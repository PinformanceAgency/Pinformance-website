"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/hooks/use-org";
import { useRouter } from "next/navigation";
import {
  Eye,
  MousePointer,
  Heart,
  Bookmark,
  Users,
  UserCheck,
  ShoppingCart,
  ShoppingBag,
  DollarSign,
  Globe,
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowRight,
  Sparkles,
  Clock,
  CheckCircle2,
  Image as ImageIcon,
  Send,
  BarChart3,
  Target,
} from "lucide-react";
import Link from "next/link";

/* ─── Types ─── */

interface OverallPerformance {
  impressions: { current: number; previous: number };
  engagements: { current: number; previous: number };
  outbound_clicks: { current: number; previous: number };
  saves: { current: number; previous: number };
  total_audience: number; // monthly_views
  engaged_audience: number; // follower_count or engagement-based
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

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
  if (num >= 1000) return (num / 1000).toFixed(1) + "K";
  return num.toLocaleString();
}

function formatCurrency(num: number): string {
  if (num === 0) return "0.00";
  if (num >= 1000000) return (num / 1000000).toFixed(2) + "M";
  if (num >= 1000) return (num / 1000).toFixed(2) + "K";
  return num.toFixed(2);
}

function getTrend(current: number, previous: number): { value: number; direction: "up" | "down" | "neutral" } {
  if (previous === 0 && current === 0) return { value: 0, direction: "neutral" };
  if (previous === 0) return { value: 100, direction: "up" };
  const change = ((current - previous) / previous) * 100;
  return {
    value: Math.abs(Math.round(change)),
    direction: change > 0 ? "up" : change < 0 ? "down" : "neutral",
  };
}

function TrendBadge({ trend }: { trend: { value: number; direction: "up" | "down" | "neutral" } }) {
  if (trend.direction === "neutral") {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
        <Minus className="w-3 h-3" /> --
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${
        trend.direction === "up" ? "text-green-600" : "text-red-500"
      }`}
    >
      {trend.direction === "up" ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {trend.value}%
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

  // Redirect to onboarding if not completed
  useEffect(() => {
    if (loading) return;
    if (!user) return;
    const userCompleted = !!user.onboarding_completed_at;
    const orgCompleted = !!org?.onboarding_completed_at;
    if (!userCompleted && !orgCompleted) {
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

      // Overall Performance from account_analytics
      setOverall({
        impressions: { current: sum(currAccount, "impressions"), previous: sum(prevAccount, "impressions") },
        engagements: { current: sum(currAccount, "engagement"), previous: sum(prevAccount, "engagement") },
        outbound_clicks: { current: sum(currAccount, "outbound_clicks"), previous: sum(prevAccount, "outbound_clicks") },
        saves: { current: sum(currAccount, "saves"), previous: sum(prevAccount, "saves") },
        total_audience: (orgResult.data as Record<string, number>)?.pinterest_monthly_views || 0,
        engaged_audience: (orgResult.data as Record<string, number>)?.pinterest_follower_count || 0,
      });

      // Conversion Insights from sales_data
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

      // Pipeline
      setPipeline({
        total_pins: pins.length,
        posted_pins: pins.filter((p) => p.status === "posted").length,
        scheduled_pins: pins.filter((p) => p.status === "scheduled").length,
        generating_pins: pins.filter((p) => p.status === "generating" || p.status === "generated").length,
        approved_pins: pins.filter((p) => p.status === "approved").length,
        total_boards: boardsResult.count || 0,
      });

      // Top pins with analytics
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
            id: p.id,
            title: p.title,
            image_url: p.image_url,
            impressions: a.impressions,
            saves: a.saves,
            clicks: a.clicks,
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
      <div className="space-y-6">
        <div className="h-10 w-72 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-28 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!org || !user) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">Unable to load your workspace.</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Please try refreshing the page or signing out and back in.</p>
        </div>
      </div>
    );
  }

  const periodLabel = period === "7d" ? "7 days" : period === "30d" ? "30 days" : "90 days";
  const userName = user?.full_name || org.name;

  // Trends
  const impressionsTrend = getTrend(overall?.impressions.current || 0, overall?.impressions.previous || 0);
  const engagementsTrend = getTrend(overall?.engagements.current || 0, overall?.engagements.previous || 0);
  const outboundTrend = getTrend(overall?.outbound_clicks.current || 0, overall?.outbound_clicks.previous || 0);
  const savesTrend = getTrend(overall?.saves.current || 0, overall?.saves.previous || 0);

  const revenueTrend = getTrend(conversion?.revenue.current || 0, conversion?.revenue.previous || 0);
  const pageVisitsTrend = getTrend(conversion?.page_visits.current || 0, conversion?.page_visits.previous || 0);
  const atcTrend = getTrend(conversion?.add_to_cart.current || 0, conversion?.add_to_cart.previous || 0);
  const checkoutsTrend = getTrend(conversion?.checkouts.current || 0, conversion?.checkouts.previous || 0);
  const aovTrend = getTrend(conversion?.aov.current || 0, conversion?.aov.previous || 0);

  return (
    <div className="space-y-6 dot-grid-bg min-h-full -m-8 p-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {getGreeting()}, {userName}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Here&apos;s how your Pinterest is performing
          </p>
        </div>
        <div className="flex items-center gap-1 glass-card rounded-xl p-1 !border-border/50">
          {(["7d", "30d", "90d"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all ${
                period === p
                  ? "bg-primary text-white shadow-sm glow-btn"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p === "7d" ? "7D" : p === "30d" ? "30D" : "90D"}
            </button>
          ))}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════ */}
      {/* OVERALL PERFORMANCE (like Pinterest Analytics) */}
      {/* ═══════════════════════════════════════════════ */}
      <div>
        <h2 className="font-semibold text-base mb-1">Overall performance</h2>
        <p className="text-xs text-muted-foreground mb-4">Last {periodLabel} vs previous {periodLabel}</p>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Impressions */}
          <div className="kpi-card rounded-xl p-4" style={{ "--accent-color": "#3b82f6" } as React.CSSProperties}>
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center">
                <Eye className="w-4 h-4 text-blue-600" />
              </div>
              <TrendBadge trend={impressionsTrend} />
            </div>
            <div className="text-xl font-bold tracking-tight">{formatNumber(overall?.impressions.current || 0)}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5 font-medium">Impressions</div>
          </div>

          {/* Engagements */}
          <div className="kpi-card rounded-xl p-4" style={{ "--accent-color": "#ec4899" } as React.CSSProperties}>
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 bg-pink-500/10 rounded-lg flex items-center justify-center">
                <Heart className="w-4 h-4 text-pink-600" />
              </div>
              <TrendBadge trend={engagementsTrend} />
            </div>
            <div className="text-xl font-bold tracking-tight">{formatNumber(overall?.engagements.current || 0)}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5 font-medium">Engagements</div>
          </div>

          {/* Outbound clicks */}
          <div className="kpi-card rounded-xl p-4" style={{ "--accent-color": "#f97316" } as React.CSSProperties}>
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 bg-orange-500/10 rounded-lg flex items-center justify-center">
                <MousePointer className="w-4 h-4 text-orange-600" />
              </div>
              <TrendBadge trend={outboundTrend} />
            </div>
            <div className="text-xl font-bold tracking-tight">{formatNumber(overall?.outbound_clicks.current || 0)}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5 font-medium">Outbound clicks</div>
          </div>

          {/* Saves */}
          <div className="kpi-card rounded-xl p-4" style={{ "--accent-color": "#8b5cf6" } as React.CSSProperties}>
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 bg-violet-500/10 rounded-lg flex items-center justify-center">
                <Bookmark className="w-4 h-4 text-violet-600" />
              </div>
              <TrendBadge trend={savesTrend} />
            </div>
            <div className="text-xl font-bold tracking-tight">{formatNumber(overall?.saves.current || 0)}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5 font-medium">Saves</div>
          </div>

          {/* Total audience */}
          <div className="kpi-card rounded-xl p-4" style={{ "--accent-color": "#06b6d4" } as React.CSSProperties}>
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 bg-cyan-500/10 rounded-lg flex items-center justify-center">
                <Users className="w-4 h-4 text-cyan-600" />
              </div>
            </div>
            <div className="text-xl font-bold tracking-tight">{formatNumber(overall?.total_audience || 0)}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5 font-medium">Total audience</div>
          </div>

          {/* Engaged audience */}
          <div className="kpi-card rounded-xl p-4" style={{ "--accent-color": "#14b8a6" } as React.CSSProperties}>
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 bg-teal-500/10 rounded-lg flex items-center justify-center">
                <UserCheck className="w-4 h-4 text-teal-600" />
              </div>
            </div>
            <div className="text-xl font-bold tracking-tight">{formatNumber(overall?.engaged_audience || 0)}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5 font-medium">Engaged audience</div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════ */}
      {/* CONVERSION INSIGHTS (like Pinterest Beta)      */}
      {/* ═══════════════════════════════════════════════ */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h2 className="font-semibold text-base">Conversion insights</h2>
          <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">Organic</span>
        </div>
        <p className="text-xs text-muted-foreground mb-4">Revenue and conversions from organic Pinterest traffic</p>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* Revenue */}
          <div className="kpi-card rounded-xl p-4" style={{ "--accent-color": "#10b981" } as React.CSSProperties}>
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 bg-emerald-500/10 rounded-lg flex items-center justify-center">
                <DollarSign className="w-4 h-4 text-emerald-600" />
              </div>
              <TrendBadge trend={revenueTrend} />
            </div>
            <div className="text-xl font-bold tracking-tight">{formatCurrency(conversion?.revenue.current || 0)}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5 font-medium">Revenue</div>
          </div>

          {/* Page visits */}
          <div className="kpi-card rounded-xl p-4" style={{ "--accent-color": "#f97316" } as React.CSSProperties}>
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 bg-orange-500/10 rounded-lg flex items-center justify-center">
                <Globe className="w-4 h-4 text-orange-600" />
              </div>
              <TrendBadge trend={pageVisitsTrend} />
            </div>
            <div className="text-xl font-bold tracking-tight">{formatNumber(conversion?.page_visits.current || 0)}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5 font-medium">Page visits</div>
          </div>

          {/* Add to cart */}
          <div className="kpi-card rounded-xl p-4" style={{ "--accent-color": "#f59e0b" } as React.CSSProperties}>
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 bg-amber-500/10 rounded-lg flex items-center justify-center">
                <ShoppingBag className="w-4 h-4 text-amber-600" />
              </div>
              <TrendBadge trend={atcTrend} />
            </div>
            <div className="text-xl font-bold tracking-tight">{formatNumber(conversion?.add_to_cart.current || 0)}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5 font-medium">Add to cart</div>
          </div>

          {/* Checkouts */}
          <div className="kpi-card rounded-xl p-4" style={{ "--accent-color": "#6366f1" } as React.CSSProperties}>
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 bg-indigo-500/10 rounded-lg flex items-center justify-center">
                <ShoppingCart className="w-4 h-4 text-indigo-600" />
              </div>
              <TrendBadge trend={checkoutsTrend} />
            </div>
            <div className="text-xl font-bold tracking-tight">{formatNumber(conversion?.checkouts.current || 0)}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5 font-medium">Checkouts</div>
          </div>

          {/* AOV */}
          <div className="kpi-card rounded-xl p-4" style={{ "--accent-color": "#a855f7" } as React.CSSProperties}>
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 bg-purple-500/10 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-purple-600" />
              </div>
              <TrendBadge trend={aovTrend} />
            </div>
            <div className="text-xl font-bold tracking-tight">{formatCurrency(conversion?.aov.current || 0)}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5 font-medium">Avg order value</div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════ */}
      {/* CONTENT PIPELINE + GROWTH          */}
      {/* ═══════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Content Pipeline */}
        <div className="lg:col-span-2 glass-card rounded-xl p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-semibold">Content Pipeline</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Your pins at every stage</p>
            </div>
            <Link href="/pins" className="text-xs text-primary flex items-center gap-1 hover:underline">
              View all pins <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-amber-50/50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 rounded-lg p-4 text-center">
              <div className="w-8 h-8 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-2">
                <Sparkles className="w-4 h-4 text-amber-600" />
              </div>
              <div className="text-xl font-bold text-amber-700 dark:text-amber-400">{pipeline?.generating_pins || 0}</div>
              <div className="text-[11px] text-amber-600/80 font-medium mt-0.5">Generating</div>
            </div>

            <div className="bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30 rounded-lg p-4 text-center">
              <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-2">
                <CheckCircle2 className="w-4 h-4 text-blue-600" />
              </div>
              <div className="text-xl font-bold text-blue-700 dark:text-blue-400">{pipeline?.approved_pins || 0}</div>
              <div className="text-[11px] text-blue-600/80 font-medium mt-0.5">Approved</div>
            </div>

            <div className="bg-purple-50/50 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900/30 rounded-lg p-4 text-center">
              <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center mx-auto mb-2">
                <Clock className="w-4 h-4 text-purple-600" />
              </div>
              <div className="text-xl font-bold text-purple-700 dark:text-purple-400">{pipeline?.scheduled_pins || 0}</div>
              <div className="text-[11px] text-purple-600/80 font-medium mt-0.5">Scheduled</div>
            </div>

            <div className="bg-green-50/50 dark:bg-green-950/20 border border-green-100 dark:border-green-900/30 rounded-lg p-4 text-center">
              <div className="w-8 h-8 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-2">
                <Send className="w-4 h-4 text-green-600" />
              </div>
              <div className="text-xl font-bold text-green-700 dark:text-green-400">{pipeline?.posted_pins || 0}</div>
              <div className="text-[11px] text-green-600/80 font-medium mt-0.5">Posted</div>
            </div>
          </div>

          {/* Pipeline flow indicator */}
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

        {/* Growth Overview */}
        <div className="glass-card rounded-xl p-6">
          <h2 className="font-semibold mb-1">Growth</h2>
          <p className="text-xs text-muted-foreground mb-5">vs previous {periodLabel}</p>

          <div className="space-y-4">
            {[
              { label: "Impressions", icon: Eye, trend: impressionsTrend, value: overall?.impressions.current || 0 },
              { label: "Outbound clicks", icon: MousePointer, trend: outboundTrend, value: overall?.outbound_clicks.current || 0 },
              { label: "Saves", icon: Bookmark, trend: savesTrend, value: overall?.saves.current || 0 },
              { label: "Content Output", icon: BarChart3, trend: null, value: pipeline?.posted_pins || 0 },
            ].map(({ label, icon: Icon, trend, value }) => (
              <div key={label}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Icon className="w-3.5 h-3.5" /> {label}
                  </span>
                  {trend ? (
                    <span className={`text-xs font-semibold ${trend.direction === "up" ? "text-green-600" : trend.direction === "down" ? "text-red-500" : ""}`}>
                      {trend.direction === "up" ? "+" : trend.direction === "down" ? "-" : ""}{trend.value}%
                    </span>
                  ) : (
                    <span className="text-xs font-semibold">{value} pins</span>
                  )}
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all progress-animate ${
                      trend ? (trend.direction === "up" ? "bg-green-500" : "bg-red-400") : "bg-primary"
                    }`}
                    style={{ width: `${Math.min(trend ? trend.value : ((value as number) / Math.max(1, 30)) * 100, 100)}%` }}
                  />
                </div>
                <div className="text-[10px] text-muted-foreground/60 mt-0.5">
                  {formatNumber(value as number)} total
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════ */}
      {/* TOP PINS + QUICK ACTIONS           */}
      {/* ═══════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Top Pins */}
        <div className="lg:col-span-2 glass-card rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold">Top Performing Pins</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Your best content by impressions</p>
            </div>
            <Link href="/analytics" className="text-xs text-primary flex items-center gap-1 hover:underline">
              Full analytics <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {topPins.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-14 h-14 bg-muted rounded-full flex items-center justify-center mx-auto mb-3">
                <ImageIcon className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">No posted pins yet</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Once your pins are live, performance data will show up here
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {topPins.map((pin, index) => (
                <Link
                  key={pin.id}
                  href={`/pins/${pin.id}`}
                  className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted/50 transition-colors group"
                >
                  <span className="text-sm font-medium text-muted-foreground w-5">{index + 1}</span>
                  <div className="w-12 h-16 bg-muted rounded-lg overflow-hidden flex-shrink-0">
                    {pin.image_url ? (
                      <img src={pin.image_url} alt={pin.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon className="w-4 h-4 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                      {pin.title}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {pin.engagement.toFixed(1)}% engagement
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground flex-shrink-0">
                    <div className="text-right">
                      <div className="font-medium text-foreground">{formatNumber(pin.impressions)}</div>
                      <div>views</div>
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

        {/* Quick Actions */}
        <div className="glass-card rounded-xl p-6">
          <h2 className="font-semibold mb-1">Quick Actions</h2>
          <p className="text-xs text-muted-foreground mb-4">Jump to key areas</p>

          <div className="space-y-2">
            {[
              { href: "/pins", icon: ImageIcon, iconBg: "bg-primary/10", iconColor: "text-primary", label: "Review Pins", sub: `${(pipeline?.generating_pins || 0) + (pipeline?.approved_pins || 0)} awaiting review` },
              { href: "/calendar", icon: Clock, iconBg: "bg-purple-50 dark:bg-purple-950/30", iconColor: "text-purple-600", label: "Content Calendar", sub: `${pipeline?.scheduled_pins || 0} scheduled` },
              { href: "/boards", icon: BarChart3, iconBg: "bg-blue-50 dark:bg-blue-950/30", iconColor: "text-blue-600", label: "Manage Boards", sub: `${pipeline?.total_boards || 0} active boards` },
              { href: "/analytics", icon: TrendingUp, iconBg: "bg-green-50 dark:bg-green-950/30", iconColor: "text-green-600", label: "Full Analytics", sub: "Deep dive into performance" },
              { href: "/keywords", icon: Target, iconBg: "bg-amber-50 dark:bg-amber-950/30", iconColor: "text-amber-600", label: "Keywords", sub: "SEO & search strategy" },
            ].map(({ href, icon: Icon, iconBg, iconColor, label, sub }) => (
              <Link key={href} href={href} className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors group">
                <div className={`w-9 h-9 ${iconBg} rounded-lg flex items-center justify-center`}>
                  <Icon className={`w-4 h-4 ${iconColor}`} />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium group-hover:text-primary transition-colors">{label}</div>
                  <div className="text-xs text-muted-foreground">{sub}</div>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
