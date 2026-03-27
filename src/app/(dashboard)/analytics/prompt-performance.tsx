"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/hooks/use-org";
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  Minus,
  Zap,
  Target,
  Palette,
  Clock,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { FeedbackRule } from "@/lib/types";

interface KeywordPerformance {
  keyword: string;
  score: number;
  trend: "up" | "down" | "stable";
}

interface LearnedPreferences {
  last_optimized_at: string;
  recommended_content_mix: Record<string, number>;
  recommended_posting_hours: number[];
  top_insights: string[];
  active_rules_count: number;
}

interface OptimizationTask {
  id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  output_summary: string;
  metadata: {
    insights?: string[];
    rules_created?: number;
    recommended_content_mix?: Record<string, number>;
    recommended_posting_hours?: number[];
    keyword_performance?: KeywordPerformance[];
  };
}

type RunStatus = "idle" | "running" | "success" | "error";

export default function PromptPerformance() {
  const { org } = useOrg();
  const [feedbackRules, setFeedbackRules] = useState<FeedbackRule[]>([]);
  const [keywords, setKeywords] = useState<KeywordPerformance[]>([]);
  const [preferences, setPreferences] = useState<LearnedPreferences | null>(null);
  const [recentTask, setRecentTask] = useState<OptimizationTask | null>(null);
  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [runError, setRunError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!org) return;
    const supabase = createClient();

    const [rulesRes, brandRes, tasksRes, kwRes] = await Promise.all([
      supabase
        .from("feedback_rules")
        .select("*")
        .eq("org_id", org.id)
        .eq("is_active", true)
        .order("priority", { ascending: false }),
      supabase
        .from("brand_profiles")
        .select("structured_data")
        .eq("org_id", org.id)
        .single(),
      supabase
        .from("ai_tasks")
        .select("*")
        .eq("org_id", org.id)
        .eq("task_type", "prompt_optimization")
        .order("created_at", { ascending: false })
        .limit(1),
      supabase
        .from("keywords")
        .select("keyword, performance_score")
        .eq("org_id", org.id)
        .not("performance_score", "is", null)
        .order("performance_score", { ascending: false })
        .limit(20),
    ]);

    setFeedbackRules((rulesRes.data as FeedbackRule[]) || []);

    const structuredData = brandRes.data?.structured_data;
    if (structuredData?.learned_preferences) {
      setPreferences(structuredData.learned_preferences as LearnedPreferences);
    }

    if (tasksRes.data?.length) {
      const task = tasksRes.data[0] as OptimizationTask;
      setRecentTask(task);
      // Use keyword_performance from the most recent optimization task if available
      if (task.metadata?.keyword_performance?.length) {
        setKeywords(task.metadata.keyword_performance);
      }
    }

    // Fallback: build keyword list from DB scores if no task data
    if (!keywords.length && kwRes.data?.length) {
      setKeywords(
        (kwRes.data as { keyword: string; performance_score: number }[]).map((k) => ({
          keyword: k.keyword,
          score: k.performance_score * 10, // Normalize from 0-1 to 0-10
          trend: "stable" as const,
        }))
      );
    }

    setLoading(false);
  }, [org]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function runOptimization() {
    setRunStatus("running");
    setRunError(null);

    try {
      const res = await fetch("/api/cron/optimize-prompts", {
        method: "POST",
        headers: { "x-cron-secret": "manual-trigger" },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      if (data.errors?.length) {
        setRunError(`Completed with errors: ${data.errors.map((e: { error: string }) => e.error).join(", ")}`);
        setRunStatus("error");
      } else {
        setRunStatus("success");
      }

      // Reload data after optimization
      await loadData();
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Unknown error");
      setRunStatus("error");
    }
  }

  if (loading) {
    return <div className="h-64 bg-muted animate-pulse rounded-xl" />;
  }

  const rulesByType: Record<string, FeedbackRule[]> = {};
  for (const rule of feedbackRules) {
    if (!rulesByType[rule.rule_type]) rulesByType[rule.rule_type] = [];
    rulesByType[rule.rule_type].push(rule);
  }

  const ruleTypeLabels: Record<string, { label: string; icon: typeof Zap; color: string }> = {
    prompt_modifier: { label: "Prompt Modifiers", icon: Zap, color: "text-purple-500" },
    keyword_boost: { label: "Boosted Keywords", icon: TrendingUp, color: "text-green-500" },
    keyword_block: { label: "Blocked Keywords", icon: TrendingDown, color: "text-red-500" },
    style_guide: { label: "Style Guides", icon: Palette, color: "text-blue-500" },
    content_filter: { label: "Content Filters", icon: Target, color: "text-orange-500" },
  };

  const trendIcon = (trend: string) => {
    if (trend === "up") return <TrendingUp className="w-3.5 h-3.5 text-green-500" />;
    if (trend === "down") return <TrendingDown className="w-3.5 h-3.5 text-red-500" />;
    return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
  };

  const contentMix = preferences?.recommended_content_mix || recentTask?.metadata?.recommended_content_mix;
  const postingHours = preferences?.recommended_posting_hours || recentTask?.metadata?.recommended_posting_hours;

  return (
    <div className="space-y-6">
      {/* Header with Run button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Prompt Optimization
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            AI-driven feedback rules that continuously improve your pin content
          </p>
        </div>
        <div className="flex items-center gap-3">
          {preferences?.last_optimized_at && (
            <span className="text-xs text-muted-foreground">
              Last run:{" "}
              {new Date(preferences.last_optimized_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          )}
          <button
            onClick={runOptimization}
            disabled={runStatus === "running"}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              runStatus === "running"
                ? "bg-muted text-muted-foreground cursor-not-allowed"
                : runStatus === "success"
                  ? "bg-green-600 text-white hover:bg-green-700"
                  : runStatus === "error"
                    ? "bg-red-600 text-white hover:bg-red-700"
                    : "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
          >
            {runStatus === "running" && <Loader2 className="w-4 h-4 animate-spin" />}
            {runStatus === "success" && <CheckCircle2 className="w-4 h-4" />}
            {runStatus === "error" && <AlertCircle className="w-4 h-4" />}
            {runStatus === "running"
              ? "Optimizing..."
              : runStatus === "success"
                ? "Optimization Complete"
                : runStatus === "error"
                  ? "Retry Optimization"
                  : "Run Optimization"}
          </button>
        </div>
      </div>

      {runError && (
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-lg p-3 text-sm text-red-700 dark:text-red-400">
          {runError}
        </div>
      )}

      {/* Insights from last run */}
      {recentTask?.metadata?.insights && recentTask.metadata.insights.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold mb-3">Latest Insights</h3>
          <ul className="space-y-2">
            {recentTask.metadata.insights.map((insight, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <Sparkles className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                <span>{insight}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Feedback Rules */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold mb-3">Active Feedback Rules ({feedbackRules.length})</h3>
          {feedbackRules.length > 0 ? (
            <div className="space-y-4">
              {Object.entries(rulesByType).map(([type, rules]) => {
                const config = ruleTypeLabels[type] || {
                  label: type,
                  icon: Target,
                  color: "text-muted-foreground",
                };
                const Icon = config.icon;

                return (
                  <div key={type}>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Icon className={cn("w-3.5 h-3.5", config.color)} />
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        {config.label}
                      </span>
                    </div>
                    <ul className="space-y-1">
                      {rules.map((rule) => (
                        <li
                          key={rule.id}
                          className="text-sm py-1.5 px-2.5 bg-muted/50 rounded-md flex items-center justify-between"
                        >
                          <span className="truncate">{rule.rule_text}</span>
                          <span className="text-xs text-muted-foreground ml-2 shrink-0">
                            p:{rule.priority}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No active rules yet. Run optimization to generate rules from your pin performance data.
            </p>
          )}
        </div>

        {/* Keyword Performance */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold mb-3">Top Keywords by Performance</h3>
          {keywords.length > 0 ? (
            <div className="space-y-1.5">
              {keywords.slice(0, 15).map((kw) => (
                <div
                  key={kw.keyword}
                  className="flex items-center gap-2 py-1.5 px-2.5 bg-muted/50 rounded-md"
                >
                  {trendIcon(kw.trend)}
                  <span className="text-sm flex-1 truncate">{kw.keyword}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          kw.score >= 7
                            ? "bg-green-500"
                            : kw.score >= 4
                              ? "bg-yellow-500"
                              : "bg-red-500"
                        )}
                        style={{ width: `${(kw.score / 10) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium w-6 text-right">
                      {kw.score.toFixed(1)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No keyword performance data yet. Run optimization after your pins have analytics data.
            </p>
          )}
        </div>

        {/* Visual Style Performance */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Palette className="w-4 h-4 text-primary" />
            Recommended Content Mix
          </h3>
          {contentMix ? (
            <div className="space-y-3">
              {Object.entries(contentMix)
                .sort(([, a], [, b]) => b - a)
                .map(([style, pct]) => (
                  <div key={style}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm capitalize">{style.replace("_", " ")}</span>
                      <span className="text-sm font-medium">{pct}%</span>
                    </div>
                    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary/80 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No content mix recommendations yet. Run optimization to get visual style analysis.
            </p>
          )}
        </div>

        {/* Recommended Posting Hours */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            Recommended Posting Hours
          </h3>
          {postingHours?.length ? (
            <div className="flex flex-wrap gap-2">
              {postingHours.sort((a, b) => a - b).map((hour) => (
                <div
                  key={hour}
                  className="flex items-center gap-1.5 bg-primary/10 text-primary px-3 py-2 rounded-lg"
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span className="text-sm font-medium">
                    {hour === 0
                      ? "12 AM"
                      : hour < 12
                        ? `${hour} AM`
                        : hour === 12
                          ? "12 PM"
                          : `${hour - 12} PM`}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No posting hour recommendations yet. Run optimization to analyze best posting times.
            </p>
          )}
        </div>
      </div>

      {/* Pin Performance Over Time (placeholder) */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          Pin Performance Over Time
        </h3>
        <div className="h-48 flex items-center justify-center border border-dashed border-border rounded-lg bg-muted/30">
          <p className="text-sm text-muted-foreground">
            Performance trend chart coming soon. Track how optimization rules improve engagement over time.
          </p>
        </div>
      </div>
    </div>
  );
}
