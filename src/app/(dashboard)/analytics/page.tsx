"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/hooks/use-org";
import {
  Eye,
  Bookmark,
  MousePointer,
  TrendingUp,
  ShoppingCart,
  ShoppingBag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PinAnalytics, SalesData } from "@/lib/types";

type DateRange = "7" | "30" | "90";

interface PinRow {
  pin_id: string;
  title: string;
  impressions: number;
  saves: number;
  clicks: number;
  engagement_rate: number;
}

interface KeywordRow {
  keyword: string;
  performance_score: number;
  search_volume: number;
  relevance_score: number;
}

export default function AnalyticsPage() {
  const { org, loading } = useOrg();
  const [range, setRange] = useState<DateRange>("30");
  const [dailyData, setDailyData] = useState<
    { date: string; impressions: number; saves: number; clicks: number; sales: number; addToCarts: number }[]
  >([]);
  const [topPins, setTopPins] = useState<PinRow[]>([]);
  const [topKeywords, setTopKeywords] = useState<KeywordRow[]>([]);
  const [totals, setTotals] = useState({
    impressions: 0,
    saves: 0,
    clicks: 0,
    saveRate: 0,
    sales: 0,
    addToCarts: 0,
  });

  useEffect(() => {
    if (!org) return;

    async function load() {
      const supabase = createClient();
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - parseInt(range));
      const sinceDate = daysAgo.toISOString().split("T")[0];

      // Fetch analytics and sales data in parallel
      const [analyticsRes, salesRes] = await Promise.all([
        supabase
          .from("pin_analytics")
          .select("*")
          .eq("org_id", org!.id)
          .gte("date", sinceDate)
          .order("date"),
        supabase
          .from("sales_data")
          .select("*")
          .eq("org_id", org!.id)
          .gte("date", sinceDate)
          .order("date"),
      ]);

      const rows = (analyticsRes.data as PinAnalytics[]) || [];
      const salesRows = (salesRes.data as SalesData[]) || [];

      // Aggregate daily analytics
      const byDate: Record<string, { impressions: number; saves: number; clicks: number; sales: number; addToCarts: number }> = {};
      rows.forEach((r) => {
        if (!byDate[r.date]) {
          byDate[r.date] = { impressions: 0, saves: 0, clicks: 0, sales: 0, addToCarts: 0 };
        }
        byDate[r.date].impressions += r.impressions;
        byDate[r.date].saves += r.saves;
        byDate[r.date].clicks += r.pin_clicks;
      });

      // Merge sales data
      salesRows.forEach((s) => {
        if (!byDate[s.date]) {
          byDate[s.date] = { impressions: 0, saves: 0, clicks: 0, sales: 0, addToCarts: 0 };
        }
        byDate[s.date].sales += s.sales_count;
        byDate[s.date].addToCarts += s.add_to_cart_count;
      });

      const daily = Object.entries(byDate)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, vals]) => ({ date, ...vals }));
      setDailyData(daily);

      // Totals
      const totalImp = rows.reduce((s, r) => s + r.impressions, 0);
      const totalSaves = rows.reduce((s, r) => s + r.saves, 0);
      const totalClicks = rows.reduce((s, r) => s + r.pin_clicks, 0);
      const totalSales = salesRows.reduce((s, r) => s + r.sales_count, 0);
      const totalAddToCarts = salesRows.reduce((s, r) => s + r.add_to_cart_count, 0);

      setTotals({
        impressions: totalImp,
        saves: totalSaves,
        clicks: totalClicks,
        saveRate: totalImp > 0 ? (totalSaves / totalImp) * 100 : 0,
        sales: totalSales,
        addToCarts: totalAddToCarts,
      });

      // Top pins by impressions
      const byPin: Record<string, { impressions: number; saves: number; clicks: number }> = {};
      rows.forEach((r) => {
        if (!byPin[r.pin_id]) {
          byPin[r.pin_id] = { impressions: 0, saves: 0, clicks: 0 };
        }
        byPin[r.pin_id].impressions += r.impressions;
        byPin[r.pin_id].saves += r.saves;
        byPin[r.pin_id].clicks += r.pin_clicks;
      });

      const topPinIds = Object.entries(byPin)
        .sort(([, a], [, b]) => b.impressions - a.impressions)
        .slice(0, 10);

      if (topPinIds.length > 0) {
        const { data: pinData } = await supabase
          .from("pins")
          .select("id, title")
          .in("id", topPinIds.map(([id]) => id));

        const pinMap: Record<string, string> = {};
        (pinData || []).forEach((p: { id: string; title: string }) => {
          pinMap[p.id] = p.title;
        });

        setTopPins(
          topPinIds.map(([id, vals]) => ({
            pin_id: id,
            title: pinMap[id] || "Untitled",
            ...vals,
            engagement_rate:
              vals.impressions > 0
                ? ((vals.saves + vals.clicks) / vals.impressions) * 100
                : 0,
          }))
        );
      }

      // Top keywords
      const { data: kwData } = await supabase
        .from("keywords")
        .select("keyword, performance_score, search_volume, relevance_score")
        .eq("org_id", org!.id)
        .not("performance_score", "is", null)
        .order("performance_score", { ascending: false })
        .limit(10);

      setTopKeywords((kwData as KeywordRow[]) || []);
    }

    load();
  }, [org, range]);

  if (loading) {
    return <div className="h-96 bg-muted animate-pulse rounded-xl" />;
  }

  const maxDaily = Math.max(...dailyData.map((d) => d.impressions), 1);

  const metricCards = [
    { label: "Total Impressions", value: totals.impressions.toLocaleString(), icon: Eye, color: "text-green-500" },
    { label: "Total Saves", value: totals.saves.toLocaleString(), icon: Bookmark, color: "text-purple-500" },
    { label: "Total Clicks", value: totals.clicks.toLocaleString(), icon: MousePointer, color: "text-blue-500" },
    { label: "Save Rate", value: `${totals.saveRate.toFixed(2)}%`, icon: TrendingUp, color: "text-primary" },
    { label: "Sales", value: totals.sales.toLocaleString(), icon: ShoppingCart, color: "text-emerald-500" },
    { label: "Add to Carts", value: totals.addToCarts.toLocaleString(), icon: ShoppingBag, color: "text-orange-500" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Analytics</h1>
          <p className="text-muted-foreground mt-1">
            Track your Pinterest performance
          </p>
        </div>
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          {(["7", "30", "90"] as DateRange[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                range === r
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {r}d
            </button>
          ))}
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {metricCards.map((card) => (
          <div key={card.label} className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{card.label}</span>
              <card.icon className={`w-4 h-4 ${card.color}`} />
            </div>
            <div className="mt-2 text-2xl font-semibold">{card.value}</div>
          </div>
        ))}
      </div>

      {/* Daily impressions chart */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h2 className="font-semibold mb-4">Daily Impressions</h2>
        {dailyData.length > 0 ? (
          <>
            <div className="flex items-end gap-1 h-48">
              {dailyData.map((d) => (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full bg-primary/80 rounded-t hover:bg-primary transition-colors"
                    style={{
                      height: `${(d.impressions / maxDaily) * 100}%`,
                      minHeight: d.impressions > 0 ? "4px" : "0px",
                    }}
                    title={`${d.date}: ${d.impressions.toLocaleString()} impressions`}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-1 mt-1">
              {dailyData.map((d, i) => (
                <div key={d.date} className="flex-1 text-center text-[10px] text-muted-foreground truncate">
                  {i % Math.max(1, Math.floor(dailyData.length / 10)) === 0
                    ? new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                    : ""}
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No analytics data for this period yet.
          </div>
        )}
      </div>

      {/* Top performing pins */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h2 className="font-semibold mb-4">Top 10 Performing Pins</h2>
        {topPins.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="pb-2 font-medium">#</th>
                  <th className="pb-2 font-medium">Pin</th>
                  <th className="pb-2 font-medium text-right">Impressions</th>
                  <th className="pb-2 font-medium text-right">Saves</th>
                  <th className="pb-2 font-medium text-right">Clicks</th>
                  <th className="pb-2 font-medium text-right">Engagement</th>
                </tr>
              </thead>
              <tbody>
                {topPins.map((pin, i) => (
                  <tr key={pin.pin_id} className="border-b border-border/50 last:border-0">
                    <td className="py-2.5 text-muted-foreground">{i + 1}</td>
                    <td className="py-2.5 font-medium truncate max-w-[200px]">
                      <a href={`/pins/${pin.pin_id}`} className="hover:text-primary">
                        {pin.title}
                      </a>
                    </td>
                    <td className="py-2.5 text-right">{pin.impressions.toLocaleString()}</td>
                    <td className="py-2.5 text-right">{pin.saves.toLocaleString()}</td>
                    <td className="py-2.5 text-right">{pin.clicks.toLocaleString()}</td>
                    <td className="py-2.5 text-right">{pin.engagement_rate.toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No pin performance data yet.
          </div>
        )}
      </div>

      {/* Top keywords */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h2 className="font-semibold mb-4">Top 10 Keywords by Performance</h2>
        {topKeywords.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="pb-2 font-medium">#</th>
                  <th className="pb-2 font-medium">Keyword</th>
                  <th className="pb-2 font-medium text-right">Search Volume</th>
                  <th className="pb-2 font-medium text-right">Relevance</th>
                  <th className="pb-2 font-medium text-right">Performance</th>
                </tr>
              </thead>
              <tbody>
                {topKeywords.map((kw, i) => (
                  <tr key={kw.keyword} className="border-b border-border/50 last:border-0">
                    <td className="py-2.5 text-muted-foreground">{i + 1}</td>
                    <td className="py-2.5 font-medium">{kw.keyword}</td>
                    <td className="py-2.5 text-right">{kw.search_volume?.toLocaleString() ?? "—"}</td>
                    <td className="py-2.5 text-right">
                      {kw.relevance_score != null ? `${(kw.relevance_score * 100).toFixed(0)}%` : "—"}
                    </td>
                    <td className="py-2.5 text-right">
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded text-xs font-medium",
                          kw.performance_score >= 0.7 && "bg-green-100 text-green-700",
                          kw.performance_score >= 0.4 && kw.performance_score < 0.7 && "bg-yellow-100 text-yellow-700",
                          kw.performance_score < 0.4 && "bg-red-100 text-red-700"
                        )}
                      >
                        {(kw.performance_score * 100).toFixed(0)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No keyword performance data yet.
          </div>
        )}
      </div>
    </div>
  );
}
