"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/hooks/use-org";
import { useRouter } from "next/navigation";
import {
  Eye,
  Bookmark,
  MousePointer,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowRight,
  Play,
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
import { OnboardingVideoModal } from "@/components/shared/onboarding-video-modal";

interface DashboardStats {
  total_pins: number;
  posted_pins: number;
  scheduled_pins: number;
  generating_pins: number;
  approved_pins: number;
  total_boards: number;
  impressions: { current: number; previous: number };
  saves: { current: number; previous: number };
  clicks: { current: number; previous: number };
  outbound_clicks: { current: number; previous: number };
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
  const { org, user, loading } = useOrg();
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [topPins, setTopPins] = useState<TopPin[]>([]);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [videoWatched, setVideoWatched] = useState(true);
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("30d");

  useEffect(() => {
    if (!org) return;

    // Per-user onboarding check — each user must complete their own onboarding
    const userCompleted = user?.onboarding_completed_at;

    if (!userCompleted) {
      router.push("/onboarding");
      return;
    }

    const videoWatchedByUser = user?.onboarding_video_watched;
    const videoWatchedByOrg = org.onboarding_video_watched;
    const watched = !!videoWatchedByUser || !!videoWatchedByOrg;

    setVideoWatched(watched);

    if (!watched) {
      setShowVideoModal(true);
    }

    async function loadStats() {
      const supabase = createClient();
      const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
      const now = new Date();
      const currentStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const previousStart = new Date(now.getTime() - days * 2 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

      const [pinsResult, boardsResult, currentAnalytics, previousAnalytics, topPinsResult] = await Promise.all([
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
      ]);

      const pins = pinsResult.data || [];
      const currentData = currentAnalytics.data || [];
      const previousData = previousAnalytics.data || [];

      const sumField = (data: Record<string, number>[], field: string) =>
        data.reduce((sum, a) => sum + (a[field] || 0), 0);

      const currImpressions = sumField(currentData, "impressions");
      const currSaves = sumField(currentData, "saves");
      const currClicks = sumField(currentData, "pin_clicks");
      const currOutbound = sumField(currentData, "outbound_clicks");

      const prevImpressions = sumField(previousData, "impressions");
      const prevSaves = sumField(previousData, "saves");
      const prevClicks = sumField(previousData, "pin_clicks");
      const prevOutbound = sumField(previousData, "outbound_clicks");

      setStats({
        total_pins: pins.length,
        posted_pins: pins.filter((p) => p.status === "posted").length,
        scheduled_pins: pins.filter((p) => p.status === "scheduled").length,
        generating_pins: pins.filter((p) => p.status === "generating" || p.status === "generated").length,
        approved_pins: pins.filter((p) => p.status === "approved").length,
        total_boards: boardsResult.count || 0,
        impressions: { current: currImpressions, previous: prevImpressions },
        saves: { current: currSaves, previous: prevSaves },
        clicks: { current: currClicks, previous: prevClicks },
        outbound_clicks: { current: currOutbound, previous: prevOutbound },
        save_rate: currImpressions > 0 ? (currSaves / currImpressions) * 100 : 0,
        engagement_rate: currImpressions > 0 ? ((currSaves + currClicks) / currImpressions) * 100 : 0,
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
  const clicksTrend = getTrend(stats?.clicks.current || 0, stats?.clicks.previous || 0);
  const outboundTrend = getTrend(stats?.outbound_clicks.current || 0, stats?.outbound_clicks.previous || 0);

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

  function handleVideoComplete() {
    setShowVideoModal(false);
    setVideoWatched(true);
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

      {/* Onboarding video banner */}
      {!videoWatched && (
        <button
          onClick={() => setShowVideoModal(true)}
          className="w-full bg-primary/5 border border-primary/20 rounded-xl p-4 flex items-center gap-4 hover:bg-primary/10 transition-colors text-left"
        >
          <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
            <Play className="w-6 h-6 text-primary ml-0.5" />
          </div>
          <div className="flex-1">
            <div className="font-medium text-sm">Watch the platform walkthrough</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Learn how to get the most out of your Pinformance dashboard
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-primary flex-shrink-0" />
        </button>
      )}

      {/* Key Metrics - Pinterest Performance */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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

        <div className="kpi-card rounded-xl p-5" style={{ "--accent-color": "#8b5cf6" } as React.CSSProperties}>
          <div className="flex items-center justify-between mb-3">
            <div className="w-9 h-9 bg-purple-500/10 rounded-lg flex items-center justify-center">
              <Bookmark className="w-4 h-4 text-purple-600" />
            </div>
            <TrendBadge trend={savesTrend} />
          </div>
          <div className="text-2xl font-bold tracking-tight">
            {formatNumber(stats?.saves.current || 0)}
          </div>
          <div className="text-xs text-muted-foreground mt-1 font-medium">Saves</div>
          <div className="text-[10px] text-muted-foreground/50 mt-0.5">
            {(stats?.save_rate || 0).toFixed(1)}% save rate
          </div>
        </div>

        <div className="kpi-card rounded-xl p-5" style={{ "--accent-color": "#f97316" } as React.CSSProperties}>
          <div className="flex items-center justify-between mb-3">
            <div className="w-9 h-9 bg-orange-500/10 rounded-lg flex items-center justify-center">
              <MousePointer className="w-4 h-4 text-orange-600" />
            </div>
            <TrendBadge trend={clicksTrend} />
          </div>
          <div className="text-2xl font-bold tracking-tight">
            {formatNumber(stats?.clicks.current || 0)}
          </div>
          <div className="text-xs text-muted-foreground mt-1 font-medium">Pin Clicks</div>
          <div className="text-[10px] text-muted-foreground/50 mt-0.5">
            {(stats?.engagement_rate || 0).toFixed(1)}% engagement
          </div>
        </div>

        <div className="kpi-card rounded-xl p-5" style={{ "--accent-color": "#22c55e" } as React.CSSProperties}>
          <div className="flex items-center justify-between mb-3">
            <div className="w-9 h-9 bg-green-500/10 rounded-lg flex items-center justify-center">
              <ExternalLink className="w-4 h-4 text-green-600" />
            </div>
            <TrendBadge trend={outboundTrend} />
          </div>
          <div className="text-2xl font-bold tracking-tight">
            {formatNumber(stats?.outbound_clicks.current || 0)}
          </div>
          <div className="text-xs text-muted-foreground mt-1 font-medium">Website Clicks</div>
          <div className="text-[10px] text-muted-foreground/50 mt-0.5">clicks to your store</div>
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

        {/* Performance Score */}
        <div className="glass-card rounded-xl p-6">
          <h2 className="font-semibold mb-1">Pinterest Health</h2>
          <p className="text-xs text-muted-foreground mb-5">Account performance indicators</p>

          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5" /> Save Rate
                </span>
                <span className="text-xs font-semibold">
                  {(stats?.save_rate || 0).toFixed(1)}%
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500 rounded-full transition-all progress-animate"
                  style={{ width: `${Math.min((stats?.save_rate || 0) * 10, 100)}%` }}
                />
              </div>
              <div className="text-[10px] text-muted-foreground/60 mt-0.5">
                Pinterest avg: 1-3%
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5" /> Engagement Rate
                </span>
                <span className="text-xs font-semibold">
                  {(stats?.engagement_rate || 0).toFixed(1)}%
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-orange-500 rounded-full transition-all progress-animate"
                  style={{ width: `${Math.min((stats?.engagement_rate || 0) * 5, 100)}%` }}
                />
              </div>
              <div className="text-[10px] text-muted-foreground/60 mt-0.5">
                Pinterest avg: 2-5%
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
                  className="h-full bg-green-500 rounded-full transition-all progress-animate"
                  style={{ width: `${Math.min(((stats?.posted_pins || 0) / Math.max(((org.settings as unknown as Record<string, number>)?.pins_per_day ?? 40) * 30, 1)) * 100, 100)}%` }}
                />
              </div>
              <div className="text-[10px] text-muted-foreground/60 mt-0.5">
                Target: {((org.settings as unknown as Record<string, number>)?.pins_per_day) ?? 40}/day
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <CircleDot className="w-3.5 h-3.5" /> Active Boards
                </span>
                <span className="text-xs font-semibold">
                  {stats?.total_boards || 0}
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all progress-animate"
                  style={{ width: `${Math.min(((stats?.total_boards || 0) / 20) * 100, 100)}%` }}
                />
              </div>
              <div className="text-[10px] text-muted-foreground/60 mt-0.5">
                Recommended: 10-20 boards
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

      {/* Onboarding Video Modal */}
      {showVideoModal && (
        <OnboardingVideoModal
          orgId={org.id}
          userId={user?.id}
          onClose={() => setShowVideoModal(false)}
          onComplete={handleVideoComplete}
        />
      )}
    </div>
  );
}
