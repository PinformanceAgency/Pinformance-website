"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/hooks/use-org";
import { useRouter } from "next/navigation";
import {
  Eye,
  Bookmark,
  MousePointer,
  ShoppingCart,
  ShoppingBag,
  Euro,
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
  Zap,
  CircleDot,
} from "lucide-react";
import Link from "next/link";

interface DashboardStats {
  total_pins: number;
  posted_pins: number;
  scheduled_pins: number;
  generating_pins: number;
  approved_pins: number;
  total_boards: number;
  impressions: { current: number; previous: number };
  saves: { current: number; previous: number };
  page_visits: { current: number; previous: number };
  add_to_carts: { current: number; previous: number };
  sales: { current: number; previous: number };
  revenue: { current: number; previous: number };
  save_rate: number;
  engagement_rate: number;
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

function getTrend(current: number, previous: number): { value: number; direction: "up" | "down" | "neutral" } {
  if (previous === 0) return { value: 0, direction: "neutral" };
  const change = ((current - previous) / previous) * 100;
  return {
    value: Math.abs(Math.round(change)),
    direction: change > 0 ? "up" : change < 0 ? "down" : "neutral",
  };
}

export default function OverviewPage() {
  const { org, user, loading, error } = useOrg();
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [topPins, setTopPins] = useState<TopPin[]>([]);
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("30d");

  // Redirect to onboarding if neither user nor org has completed it
  useEffect(() => {
    if (loading) return;
    if (!user) return;

    // Check if user OR org has completed onboarding
    const userCompleted = !!user.onboarding_completed_at;
    const orgCompleted = !!org?.onboarding_completed_at;

    // If neither completed, redirect to onboarding
    if (!userCompleted && !orgCompleted) {
      router.push("/onboarding");
      return;
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

      const [pinsResult, boardsResult, currentAnalytics, previousAnalytics, topPinsResult, currentSales, previousSales] = await Promise.all([
        supabase
          .from("pins")
          .select("id, status")
          .eq("org_id", org!.id),
        supabase
          .from("boards")
          .select("id", { count: "exact" })
          .eq("org_id", org!.id),
        supabase
          .from("pin_analytics")
          .select("impressions, saves, pin_clicks, outbound_clicks")
          .eq("org_id", org!.id)
          .gte("date", currentStart),
        supabase
          .from("pin_analytics")
          .select("impressions, saves, pin_clicks, outbound_clicks")
          .eq("org_id", org!.id)
          .gte("date", previousStart)
          .lt("date", currentStart),
        supabase
          .from("pins")
          .select("id, title, image_url")
          .eq("org_id", org!.id)
          .eq("status", "posted")
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("sales_data")
          .select("sales_count, add_to_cart_count, sales_revenue, page_visits")
          .eq("org_id", org!.id)
          .eq("source", "pinterest")
          .gte("date", currentStart),
        supabase
          .from("sales_data")
          .select("sales_count, add_to_cart_count, sales_revenue, page_visits")
          .eq("org_id", org!.id)
          .eq("source", "pinterest")
          .gte("date", previousStart)
          .lt("date", currentStart),
      ]);

      const pins = pinsResult.data || [];
      const currentData = currentAnalytics.data || [];
      const previousData = previousAnalytics.data || [];

      const sumField = (data: Record<string, number>[], field: string) =>
        data.reduce((sum, a) => sum + (a[field] || 0), 0);

      const currImpressions = sumField(currentData, "impressions");
      const currSaves = sumField(currentData, "saves");

      const prevImpressions = sumField(previousData, "impressions");
      const prevSaves = sumField(previousData, "saves");

      const currSalesData = currentSales.data || [];
      const prevSalesData = previousSales.data || [];
      const currAddToCarts = sumField(currSalesData, "add_to_cart_count");
      const currSalesCount = sumField(currSalesData, "sales_count");
      const currRevenue = sumField(currSalesData, "sales_revenue");
      const currPageVisits = sumField(currSalesData, "page_visits");
      const prevAddToCarts = sumField(prevSalesData, "add_to_cart_count");
      const prevSalesCount = sumField(prevSalesData, "sales_count");
      const prevRevenue = sumField(prevSalesData, "sales_revenue");
      const prevPageVisits = sumField(prevSalesData, "page_visits");

      setStats({
        total_pins: pins.length,
        posted_pins: pins.filter((p) => p.status === "posted").length,
        scheduled_pins: pins.filter((p) => p.status === "scheduled").length,
        generating_pins: pins.filter((p) => p.status === "generating" || p.status === "generated").length,
        approved_pins: pins.filter((p) => p.status === "approved").length,
        total_boards: boardsResult.count || 0,
        impressions: { current: currImpressions, previous: prevImpressions },
        saves: { current: currSaves, previous: prevSaves },
        page_visits: { current: currPageVisits, previous: prevPageVisits },
        add_to_carts: { current: currAddToCarts, previous: prevAddToCarts },
        sales: { current: currSalesCount, previous: prevSalesCount },
        revenue: { current: currRevenue, previous: prevRevenue },
        save_rate: currImpressions > 0 ? (currSaves / currImpressions) * 100 : 0,
        engagement_rate: currImpressions > 0 ? (currSaves / currImpressions) * 100 : 0,
      });

      // Load analytics for top pins
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
  }, [org, router, period]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-72 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-48 bg-muted animate-pulse rounded-xl" />
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

  const impressionsTrend = getTrend(stats?.impressions.current || 0, stats?.impressions.previous || 0);
  const savesTrend = getTrend(stats?.saves.current || 0, stats?.saves.previous || 0);
  const pageVisitsTrend = getTrend(stats?.page_visits.current || 0, stats?.page_visits.previous || 0);
  const addToCartsTrend = getTrend(stats?.add_to_carts.current || 0, stats?.add_to_carts.previous || 0);
  const salesTrend = getTrend(stats?.sales.current || 0, stats?.sales.previous || 0);
  const revenueTrend = getTrend(stats?.revenue.current || 0, stats?.revenue.previous || 0);
  const currAov = (stats?.sales.current || 0) > 0 ? (stats?.revenue.current || 0) / stats!.sales.current : 0;
  const prevAov = (stats?.sales.previous || 0) > 0 ? (stats?.revenue.previous || 0) / stats!.sales.previous : 0;
  const aovTrend = getTrend(currAov, prevAov);

  const periodLabel = period === "7d" ? "7 days" : period === "30d" ? "30 days" : "90 days";

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

  const userName = user?.full_name || org.name;

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


      {/* Key Metrics - Pinterest Performance */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="kpi-card rounded-xl p-5" style={{ "--accent-color": "#3b82f6" } as React.CSSProperties}>
          <div className="flex items-center justify-between mb-3">
            <div className="w-9 h-9 bg-blue-500/10 rounded-lg flex items-center justify-center">
              <Eye className="w-4 h-4 text-blue-600" />
            </div>
            <TrendBadge trend={impressionsTrend} />
          </div>
          <div className="text-2xl font-bold tracking-tight">
            {formatNumber(stats?.impressions.current || 0)}
          </div>
          <div className="text-xs text-muted-foreground mt-1 font-medium">Impressions</div>
          <div className="text-[10px] text-muted-foreground/50 mt-0.5">vs previous {periodLabel}</div>
        </div>

        <div className="kpi-card rounded-xl p-5" style={{ "--accent-color": "#f97316" } as React.CSSProperties}>
          <div className="flex items-center justify-between mb-3">
            <div className="w-9 h-9 bg-orange-500/10 rounded-lg flex items-center justify-center">
              <MousePointer className="w-4 h-4 text-orange-600" />
            </div>
            <TrendBadge trend={pageVisitsTrend} />
          </div>
          <div className="text-2xl font-bold tracking-tight">
            {formatNumber(stats?.page_visits.current || 0)}
          </div>
          <div className="text-xs text-muted-foreground mt-1 font-medium">Page Visits</div>
          <div className="text-[10px] text-muted-foreground/50 mt-0.5">organic Pinterest</div>
        </div>

        <div className="kpi-card rounded-xl p-5" style={{ "--accent-color": "#f59e0b" } as React.CSSProperties}>
          <div className="flex items-center justify-between mb-3">
            <div className="w-9 h-9 bg-amber-500/10 rounded-lg flex items-center justify-center">
              <ShoppingBag className="w-4 h-4 text-amber-600" />
            </div>
            <TrendBadge trend={addToCartsTrend} />
          </div>
          <div className="text-2xl font-bold tracking-tight">
            {formatNumber(stats?.add_to_carts.current || 0)}
          </div>
          <div className="text-xs text-muted-foreground mt-1 font-medium">Add to Carts</div>
          <div className="text-[10px] text-muted-foreground/50 mt-0.5">organic Pinterest</div>
        </div>

        <div className="kpi-card rounded-xl p-5" style={{ "--accent-color": "#10b981" } as React.CSSProperties}>
          <div className="flex items-center justify-between mb-3">
            <div className="w-9 h-9 bg-emerald-500/10 rounded-lg flex items-center justify-center">
              <ShoppingCart className="w-4 h-4 text-emerald-600" />
            </div>
            <TrendBadge trend={salesTrend} />
          </div>
          <div className="text-2xl font-bold tracking-tight">
            {formatNumber(stats?.sales.current || 0)}
          </div>
          <div className="text-xs text-muted-foreground mt-1 font-medium">Sales</div>
          <div className="text-[10px] text-muted-foreground/50 mt-0.5">organic Pinterest</div>
        </div>

        <div className="kpi-card rounded-xl p-5" style={{ "--accent-color": "#6366f1" } as React.CSSProperties}>
          <div className="flex items-center justify-between mb-3">
            <div className="w-9 h-9 bg-indigo-500/10 rounded-lg flex items-center justify-center">
              <Euro className="w-4 h-4 text-indigo-600" />
            </div>
            <TrendBadge trend={revenueTrend} />
          </div>
          <div className="text-2xl font-bold tracking-tight">
            {formatNumber(stats?.revenue.current || 0)}
          </div>
          <div className="text-xs text-muted-foreground mt-1 font-medium">Revenue</div>
          <div className="text-[10px] text-muted-foreground/50 mt-0.5">organic Pinterest</div>
        </div>

        <div className="kpi-card rounded-xl p-5" style={{ "--accent-color": "#ec4899" } as React.CSSProperties}>
          <div className="flex items-center justify-between mb-3">
            <div className="w-9 h-9 bg-pink-500/10 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-pink-600" />
            </div>
            <TrendBadge trend={aovTrend} />
          </div>
          <div className="text-2xl font-bold tracking-tight">
            {currAov.toFixed(2)}
          </div>
          <div className="text-xs text-muted-foreground mt-1 font-medium">Avg Order Value</div>
          <div className="text-[10px] text-muted-foreground/50 mt-0.5">organic Pinterest</div>
        </div>
      </div>

      {/* Content Pipeline + Performance Score */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Content Pipeline */}
        <div className="lg:col-span-2 glass-card rounded-xl p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-semibold">Content Pipeline</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Your pins at every stage</p>
            </div>
            <Link
              href="/pins"
              className="text-xs text-primary flex items-center gap-1 hover:underline"
            >
              View all pins <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-amber-50/50 border border-amber-100 rounded-lg p-4 text-center">
              <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-2">
                <Sparkles className="w-4 h-4 text-amber-600" />
              </div>
              <div className="text-xl font-bold text-amber-700">{stats?.generating_pins || 0}</div>
              <div className="text-[11px] text-amber-600/80 font-medium mt-0.5">Generating</div>
            </div>

            <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-4 text-center">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-2">
                <CheckCircle2 className="w-4 h-4 text-blue-600" />
              </div>
              <div className="text-xl font-bold text-blue-700">{stats?.approved_pins || 0}</div>
              <div className="text-[11px] text-blue-600/80 font-medium mt-0.5">Approved</div>
            </div>

            <div className="bg-purple-50/50 border border-purple-100 rounded-lg p-4 text-center">
              <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-2">
                <Clock className="w-4 h-4 text-purple-600" />
              </div>
              <div className="text-xl font-bold text-purple-700">{stats?.scheduled_pins || 0}</div>
              <div className="text-[11px] text-purple-600/80 font-medium mt-0.5">Scheduled</div>
            </div>

            <div className="bg-green-50/50 border border-green-100 rounded-lg p-4 text-center">
              <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2">
                <Send className="w-4 h-4 text-green-600" />
              </div>
              <div className="text-xl font-bold text-green-700">{stats?.posted_pins || 0}</div>
              <div className="text-[11px] text-green-600/80 font-medium mt-0.5">Posted</div>
            </div>
          </div>

          {/* Pipeline flow indicator */}
          <div className="flex items-center justify-center gap-0 mt-4 px-8">
            <div className="flex-1 h-1.5 bg-amber-200 rounded-l-full" />
            <div className="flex-1 h-1.5 bg-blue-200" />
            <div className="flex-1 h-1.5 bg-purple-200" />
            <div className="flex-1 h-1.5 bg-green-200 rounded-r-full" />
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
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5" /> Impressions
                </span>
                <span className={`text-xs font-semibold ${impressionsTrend.direction === "up" ? "text-green-600" : impressionsTrend.direction === "down" ? "text-red-500" : ""}`}>
                  {impressionsTrend.direction === "up" ? "+" : impressionsTrend.direction === "down" ? "-" : ""}{impressionsTrend.value}%
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all progress-animate ${impressionsTrend.direction === "up" ? "bg-green-500" : "bg-red-400"}`}
                  style={{ width: `${Math.min(impressionsTrend.value, 100)}%` }}
                />
              </div>
              <div className="text-[10px] text-muted-foreground/60 mt-0.5">
                {formatNumber(stats?.impressions.current || 0)} total
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <MousePointer className="w-3.5 h-3.5" /> Page Visits
                </span>
                <span className={`text-xs font-semibold ${pageVisitsTrend.direction === "up" ? "text-green-600" : pageVisitsTrend.direction === "down" ? "text-red-500" : ""}`}>
                  {pageVisitsTrend.direction === "up" ? "+" : pageVisitsTrend.direction === "down" ? "-" : ""}{pageVisitsTrend.value}%
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all progress-animate ${pageVisitsTrend.direction === "up" ? "bg-green-500" : "bg-red-400"}`}
                  style={{ width: `${Math.min(pageVisitsTrend.value, 100)}%` }}
                />
              </div>
              <div className="text-[10px] text-muted-foreground/60 mt-0.5">
                {formatNumber(stats?.page_visits.current || 0)} total
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Euro className="w-3.5 h-3.5" /> Revenue
                </span>
                <span className={`text-xs font-semibold ${revenueTrend.direction === "up" ? "text-green-600" : revenueTrend.direction === "down" ? "text-red-500" : ""}`}>
                  {revenueTrend.direction === "up" ? "+" : revenueTrend.direction === "down" ? "-" : ""}{revenueTrend.value}%
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all progress-animate ${revenueTrend.direction === "up" ? "bg-green-500" : "bg-red-400"}`}
                  style={{ width: `${Math.min(revenueTrend.value, 100)}%` }}
                />
              </div>
              <div className="text-[10px] text-muted-foreground/60 mt-0.5">
                {formatNumber(stats?.revenue.current || 0)} total
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <BarChart3 className="w-3.5 h-3.5" /> Content Output
                </span>
                <span className="text-xs font-semibold">
                  {stats?.posted_pins || 0} pins
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all progress-animate"
                  style={{ width: `${Math.min(((stats?.posted_pins || 0) / Math.max(((org.settings as unknown as Record<string, number>)?.pins_per_day ?? 40) * 30, 1)) * 100, 100)}%` }}
                />
              </div>
              <div className="text-[10px] text-muted-foreground/60 mt-0.5">
                Target: {((org.settings as unknown as Record<string, number>)?.pins_per_day) ?? 40}/day
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Top Performing Pins + Quick Links */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Top Pins */}
        <div className="lg:col-span-2 glass-card rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold">Top Performing Pins</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Your best content by impressions</p>
            </div>
            <Link
              href="/analytics"
              className="text-xs text-primary flex items-center gap-1 hover:underline"
            >
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
            <Link
              href="/pins"
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors group"
            >
              <div className="w-9 h-9 bg-primary/10 rounded-lg flex items-center justify-center">
                <ImageIcon className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium group-hover:text-primary transition-colors">Review Pins</div>
                <div className="text-xs text-muted-foreground">
                  {(stats?.generating_pins || 0) + (stats?.approved_pins || 0)} awaiting review
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </Link>

            <Link
              href="/calendar"
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors group"
            >
              <div className="w-9 h-9 bg-purple-50 rounded-lg flex items-center justify-center">
                <Clock className="w-4 h-4 text-purple-600" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium group-hover:text-primary transition-colors">Content Calendar</div>
                <div className="text-xs text-muted-foreground">
                  {stats?.scheduled_pins || 0} scheduled
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </Link>

            <Link
              href="/boards"
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors group"
            >
              <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center">
                <BarChart3 className="w-4 h-4 text-blue-600" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium group-hover:text-primary transition-colors">Manage Boards</div>
                <div className="text-xs text-muted-foreground">
                  {stats?.total_boards || 0} active boards
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </Link>

            <Link
              href="/analytics"
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors group"
            >
              <div className="w-9 h-9 bg-green-50 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-green-600" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium group-hover:text-primary transition-colors">Full Analytics</div>
                <div className="text-xs text-muted-foreground">
                  Deep dive into performance
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </Link>

            <Link
              href="/keywords"
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors group"
            >
              <div className="w-9 h-9 bg-amber-50 rounded-lg flex items-center justify-center">
                <Target className="w-4 h-4 text-amber-600" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium group-hover:text-primary transition-colors">Keywords</div>
                <div className="text-xs text-muted-foreground">
                  SEO & search strategy
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </Link>
          </div>
        </div>
      </div>

    </div>
  );
}
