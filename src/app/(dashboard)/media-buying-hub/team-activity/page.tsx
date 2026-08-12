"use client";

import { useEffect, useState } from "react";
import { Loader2, TrendingUp, TrendingDown, Minus, Rocket, Pause, LayoutGrid, ImageIcon } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { cn } from "@/lib/utils";
import type {
  TeamActivityResponse,
  WeekBucket,
} from "@/lib/media-buying/team-activity";

export default function TeamActivityPage() {
  const [data, setData] = useState<TeamActivityResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/team-activity")
      .then((r) => (r.ok ? r.json() : r.json().then((e) => Promise.reject(e.error))))
      .then((d) => setData(d as TeamActivityResponse))
      .catch((e) => setError(typeof e === "string" ? e : String(e)));
  }, []);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Team Activity</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          What the team actually shipped this week — campaigns launched and
          paused in the ad account, boards created and pins added on the
          organic side. Per media buyer, week over week.
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}
      {!data && !error && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading team activity…
        </div>
      )}

      {data && (
        <>
          <ActivitySection
            title="Paid Ads Activity"
            description="Campaign-level changes only — new campaigns spun up vs campaigns turned off."
            weeks={data.weeks}
            buyers={data.buyers}
            series={[
              {
                key: "launched",
                label: "Campaigns launched",
                color: "#10b981",
                icon: Rocket,
                data: data.paid.launched,
              },
              {
                key: "paused",
                label: "Campaigns paused",
                color: "#ef4444",
                icon: Pause,
                data: data.paid.paused,
              },
            ]}
          />

          <ActivitySection
            title="Organic Activity"
            description="Boards created and pins added — the raw output flowing through the dashboard this week."
            weeks={data.weeks}
            buyers={data.buyers}
            series={[
              {
                key: "boards",
                label: "Boards created",
                color: "#8b5cf6",
                icon: LayoutGrid,
                data: data.organic.boards_created,
              },
              {
                key: "pins",
                label: "Pins added",
                color: "#f59e0b",
                icon: ImageIcon,
                data: data.organic.pins_added,
              },
            ]}
          />
        </>
      )}
    </div>
  );
}

interface Series {
  key: string;
  label: string;
  color: string;
  icon: React.ComponentType<{ className?: string }>;
  data: WeekBucket[];
}

function ActivitySection({
  title,
  description,
  weeks,
  buyers,
  series,
}: {
  title: string;
  description: string;
  weeks: string[];
  buyers: string[];
  series: Series[];
}) {
  const currentIdx = weeks.length - 1;
  const priorIdx = Math.max(0, currentIdx - 1);

  return (
    <section className="bg-card border border-border rounded-2xl p-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>

      {/* Big numbers this week */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {series.map((s) => {
          const current = s.data[currentIdx]?.total ?? 0;
          const prior = s.data[priorIdx]?.total ?? 0;
          const delta = current - prior;
          const Icon = s.icon;
          return (
            <div
              key={s.key}
              className="rounded-xl border border-border bg-background/50 p-4 flex items-center gap-4"
            >
              <div
                className="rounded-lg p-2.5 flex-shrink-0"
                style={{ backgroundColor: s.color + "22", color: s.color }}
              >
                <Icon className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {s.label}
                </div>
                <div className="flex items-baseline gap-3 mt-0.5">
                  <span className="text-3xl font-semibold tabular-nums">{current}</span>
                  <DeltaBadge delta={delta} />
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  this week · {prior} last week
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 8-week trend bar chart */}
      <div>
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
          Last 8 weeks
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={weeks.map((w, i) => {
                const row: Record<string, string | number> = { week: shortWeek(w) };
                for (const s of series) row[s.label] = s.data[i]?.total ?? 0;
                return row;
              })}
              margin={{ top: 8, right: 12, bottom: 4, left: 4 }}
              barCategoryGap="25%"
              barGap={4}
            >
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
              <XAxis
                dataKey="week"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: "currentColor", opacity: 0.65 }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                tick={{ fontSize: 10, fill: "currentColor", opacity: 0.6 }}
                width={30}
              />
              <Tooltip
                cursor={{ fill: "currentColor", opacity: 0.05 }}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              {series.map((s) => (
                <Bar
                  key={s.key}
                  dataKey={s.label}
                  fill={s.color}
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Per-buyer breakdown table */}
      <div>
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
          This week per buyer
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 font-medium">Buyer</th>
                {series.map((s) => (
                  <th key={s.key} className="py-2 pr-4 font-medium text-right">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {buyers.length === 0 && (
                <tr>
                  <td colSpan={1 + series.length} className="py-3 text-xs text-muted-foreground">
                    No buyers configured on any store yet.
                  </td>
                </tr>
              )}
              {buyers.map((b) => (
                <tr key={b} className="border-b border-border/50 last:border-b-0">
                  <td className="py-2 font-medium">{b}</td>
                  {series.map((s) => {
                    const current = s.data[currentIdx]?.by_buyer[b] ?? 0;
                    const prior = s.data[priorIdx]?.by_buyer[b] ?? 0;
                    const delta = current - prior;
                    return (
                      <td key={s.key} className="py-2 pr-4 text-right tabular-nums">
                        <span className="font-medium">{current}</span>{" "}
                        <span
                          className={cn(
                            "text-[11px]",
                            delta > 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : delta < 0
                              ? "text-red-600 dark:text-red-400"
                              : "text-muted-foreground"
                          )}
                        >
                          {delta > 0 ? "+" : ""}
                          {delta}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function DeltaBadge({ delta }: { delta: number }) {
  const cls =
    delta > 0
      ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
      : delta < 0
      ? "text-red-600 dark:text-red-400 bg-red-500/10"
      : "text-muted-foreground bg-muted";
  const Icon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", cls)}>
      <Icon className="w-3 h-3" />
      {delta > 0 ? "+" : ""}
      {delta} wk/wk
    </span>
  );
}

/** "2026-08-05" → "Aug 5". */
function shortWeek(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  const m = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  return `${m} ${d.getUTCDate()}`;
}
