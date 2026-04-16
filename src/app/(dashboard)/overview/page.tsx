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
  Image as ImageIcon,
  Info,
  ChevronDown,
} from "lucide-react";
import Link from "next/link";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

/* ─── Types ─── */

interface OverallPerformance {
  impressions: { current: number; previous: number };
  engagements: { current: number; previous: number };
  outbound_clicks: { current: number; previous: number };
  saves: { current: number; previous: number };
  engaged_audience: { current: number; previous: number };
}

interface ConversionInsights {
  revenue: { current: number; previous: number };
  page_visits: { current: number; previous: number };
  add_to_cart: { current: number; previous: number };
  checkouts: { current: number; previous: number };
  aov: { current: number; previous: number };
}

interface DailyData {
  date: string;
  label: string;
  impressions: number;
  engagement: number;
  outbound_clicks: number;
  saves: number;
  pin_clicks: number;
  page_visits: number;
  revenue: number;
  checkouts: number;
  aov: number;
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
  const arrow = trend.direction === "up" ? "\u2191" : "\u2193";
  return (
    <span className={`text-xs font-medium ${color} ml-1.5 inline-flex items-center gap-0.5`}>
      {arrow} {trend.value}%
    </span>
  );
}

const CHART_METRICS = [
  { key: "impressions", label: "Impressions", format: formatNumber },
  { key: "engagement", label: "Engagements", format: formatNumber },
  { key: "outbound_clicks", label: "Outbound clicks", format: formatNumber },
  { key: "saves", label: "Saves", format: formatNumber },
  { key: "page_visits", label: "Page visits", format: formatNumber },
  { key: "revenue", label: "Revenue", format: formatCurrency },
  { key: "checkouts", label: "Checkouts", format: formatNumber },
  { key: "aov", label: "Average order value", format: formatCurrency },
] as const;

type ChartMetricKey = (typeof CHART_METRICS)[number]["key"];

/* ─── Main Component ─── */

export default function OverviewPage() {
  const { org, user, loading } = useOrg();
  const router = useRouter();
  const [overall, setOverall] = useState<OverallPerformance | null>(null);
  const [conversion, setConversion] = useState<ConversionInsights | null>(null);
  const [dailyData, setDailyData] = useState<DailyData[]>([]);
  const [topPins, setTopPins] = useState<TopPin[]>([]);
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("30d");
  const [chartMetric, setChartMetric] = useState<ChartMetricKey>("impressions");
  const [chartDropdownOpen, setChartDropdownOpen] = useState(false);

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
        currentAccount,
        previousAccount,
        currentSales,
        previousSales,
      ] = await Promise.all([
        supabase.from("account_analytics").select("*").eq("org_id", org!.id).gte("date", currentStart).order("date", { ascending: true }),
        supabase.from("account_analytics").select("*").eq("org_id", org!.id).gte("date", previousStart).lt("date", currentStart),
        supabase.from("sales_data").select("*").eq("org_id", org!.id).eq("source", "pinterest").gte("date", currentStart).order("date", { ascending: true }),
        supabase.from("sales_data").select("*").eq("org_id", org!.id).eq("source", "pinterest").gte("date", previousStart).lt("date", currentStart),
      ]);

      const currAccount = currentAccount.data || [];
      const prevAccount = previousAccount.data || [];
      const currSales = currentSales.data || [];
      const prevSales = previousSales.data || [];

      const sum = (data: Record<string, number>[], field: string) =>
        data.reduce((s, a) => s + ((a as Record<string, number>)[field] || 0), 0);

      // Engaged audience: use engagement metric (total engagement actions)
      setOverall({
        impressions: { current: sum(currAccount, "impressions"), previous: sum(prevAccount, "impressions") },
        engagements: { current: sum(currAccount, "engagement"), previous: sum(prevAccount, "engagement") },
        outbound_clicks: { current: sum(currAccount, "outbound_clicks"), previous: sum(prevAccount, "outbound_clicks") },
        saves: { current: sum(currAccount, "saves"), previous: sum(prevAccount, "saves") },
        engaged_audience: { current: sum(currAccount, "engagement"), previous: sum(prevAccount, "engagement") },
      });

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

      // Build daily chart data by merging account_analytics + sales_data by date
      const salesByDate: Record<string, { page_visits: number; revenue: number; checkouts: number }> = {};
      currSales.forEach((s: Record<string, unknown>) => {
        const d = s.date as string;
        salesByDate[d] = {
          page_visits: (s.page_visits as number) || 0,
          revenue: (s.sales_revenue as number) || 0,
          checkouts: (s.sales_count as number) || 0,
        };
      });

      const daily: DailyData[] = currAccount.map((row: Record<string, unknown>) => {
        const d = row.date as string;
        const sd = salesByDate[d] || { page_visits: 0, revenue: 0, checkouts: 0 };
        const dateObj = new Date(d);
        const label = `${dateObj.getDate()} ${dateObj.toLocaleString("en", { month: "short" })}`;
        return {
          date: d,
          label,
          impressions: (row.impressions as number) || 0,
          engagement: (row.engagement as number) || 0,
          outbound_clicks: (row.outbound_clicks as number) || 0,
          saves: (row.saves as number) || 0,
          pin_clicks: (row.pin_clicks as number) || 0,
          page_visits: sd.page_visits,
          revenue: sd.revenue,
          checkouts: sd.checkouts,
          aov: sd.checkouts > 0 ? sd.revenue / sd.checkouts : 0,
        };
      });
      setDailyData(daily);

      // Fetch top pins (organic only) from Pinterest API
      try {
        const topPinsRes = await fetch(`/api/pinterest/top-pins?days=${days}`);
        if (topPinsRes.ok) {
          const { pins: apiTopPins } = await topPinsRes.json();
          if (apiTopPins && apiTopPins.length > 0) {
            const enrichedPins: TopPin[] = apiTopPins.map((p: Record<string, unknown>) => ({
              id: p.pin_id as string,
              title: (p.title as string) || `Pin ${(p.pin_id as string).slice(-6)}`,
              image_url: (p.image_url as string) || null,
              impressions: (p.impressions as number) || 0,
              saves: (p.saves as number) || 0,
              clicks: (p.clicks as number) || 0,
              engagement: ((p.impressions as number) || 0) > 0
                ? ((((p.saves as number) || 0) + ((p.clicks as number) || 0)) / ((p.impressions as number) || 1)) * 100
                : 0,
            }));
            setTopPins(enrichedPins);
          }
        }
      } catch {
        // Top pins fetch failed
      }
    }

    loadStats();
  }, [org, user, router, period]);

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-3 lg:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
        <div className="h-64 bg-muted animate-pulse rounded-xl" />
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
  const engagedAudienceTrend = calcTrend(overall?.engaged_audience.current || 0, overall?.engaged_audience.previous || 0);
  const revenueTrend = calcTrend(conversion?.revenue.current || 0, conversion?.revenue.previous || 0);
  const pageVisitsTrend = calcTrend(conversion?.page_visits.current || 0, conversion?.page_visits.previous || 0);
  const atcTrend = calcTrend(conversion?.add_to_cart.current || 0, conversion?.add_to_cart.previous || 0);
  const checkoutsTrend = calcTrend(conversion?.checkouts.current || 0, conversion?.checkouts.previous || 0);
  const aovTrend = calcTrend(conversion?.aov.current || 0, conversion?.aov.previous || 0);

  const selectedMetric = CHART_METRICS.find((m) => m.key === chartMetric) || CHART_METRICS[0];
  const chartTotal = dailyData.reduce((s, d) => s + (d[chartMetric] || 0), 0);

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
            { label: "Engaged audience", value: formatNumber(overall?.engaged_audience.current || 0), trend: engagedAudienceTrend },
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
      {/* PERFORMANCE OVER TIME                     */}
      {/* ══════════════════════════════════════════ */}
      <div className="border rounded-xl p-6 bg-background">
        <h2 className="text-sm font-semibold mb-4">Performance over time</h2>

        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">Metric</span>
            <div className="relative">
              <button
                onClick={() => setChartDropdownOpen(!chartDropdownOpen)}
                className="flex items-center gap-2 border rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-muted/50 transition-colors"
              >
                {selectedMetric.label}
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
              {chartDropdownOpen && (
                <div className="absolute top-full left-0 mt-1 bg-background border rounded-lg shadow-lg z-50 py-1 min-w-[180px]">
                  {CHART_METRICS.map((m) => (
                    <button
                      key={m.key}
                      onClick={() => { setChartMetric(m.key); setChartDropdownOpen(false); }}
                      className={`block w-full text-left px-3 py-1.5 text-sm hover:bg-muted/50 transition-colors ${
                        chartMetric === m.key ? "font-medium text-primary" : "text-foreground"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="text-right">
            <div className="text-xs text-muted-foreground">Total {selectedMetric.label.toLowerCase()}</div>
            <div className="text-sm font-bold">{selectedMetric.format(chartTotal)}</div>
          </div>
        </div>

        <div className="h-64">
          {dailyData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  interval={Math.max(0, Math.floor(dailyData.length / 7) - 1)}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => selectedMetric.format(v)}
                  width={60}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--background))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  formatter={(value: unknown) => [selectedMetric.format(Number(value) || 0), selectedMetric.label]}
                  labelFormatter={(label: unknown) => String(label)}
                />
                <Line
                  type="monotone"
                  dataKey={chartMetric}
                  stroke="#E60023"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: "#E60023" }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              No data available for this period
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════ */}
      {/* TOP PERFORMING PINS (organic only)        */}
      {/* ══════════════════════════════════════════ */}
      <div className="border rounded-xl p-6 bg-background">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold">Top Performing Pins</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Best organic content by impressions</p>
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
            <p className="text-sm text-muted-foreground">No pin data available yet</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Performance data will appear once analytics are collected</p>
          </div>
        ) : (
          <div className="divide-y">
            {topPins.map((pin, index) => (
              <a
                key={pin.id}
                href={`https://pinterest.com/pin/${pin.id}`}
                target="_blank"
                rel="noopener noreferrer"
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
              </a>
            ))}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════ */}
      {/* QUICK ACTIONS                             */}
      {/* ══════════════════════════════════════════ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { href: "/pins", label: "Review Pins", sub: "Manage your content" },
          { href: "/calendar", label: "Content Calendar", sub: "Plan your schedule" },
          { href: "/boards", label: "Manage Boards", sub: "Organize your pins" },
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
