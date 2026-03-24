"use client";

import { useState, useEffect } from "react";
import {
  Zap,
  Brain,
  ImageIcon,
  Send,
  BarChart3,
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  Sparkles,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { useOrg } from "@/hooks/use-org";
import { createClient } from "@/lib/supabase/client";

interface PipelineStep {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  pipelineKey: string;
  status: "idle" | "running" | "success" | "error";
  result?: string;
  estimatedTime: string;
  prerequisites: string[];
}

interface TaskLog {
  id: string;
  task_type: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  input_summary: string | null;
  output_summary: string | null;
}

export default function PipelinePage() {
  const { org } = useOrg();
  const [steps, setSteps] = useState<PipelineStep[]>([
    {
      id: "strategy",
      name: "Strategy & Keywords",
      description: "AI analyzes your products and competitors to generate keyword strategy and board plan",
      icon: Brain,
      pipelineKey: "strategy",
      status: "idle",
      estimatedTime: "~30 sec",
      prerequisites: ["Products synced from Shopify"],
    },
    {
      id: "content",
      name: "Content Generation",
      description: "Generates pin titles, descriptions, and image prompts for the next 7 days",
      icon: Sparkles,
      pipelineKey: "content",
      status: "idle",
      estimatedTime: "~2 min",
      prerequisites: ["Strategy pipeline completed", "Boards created"],
    },
    {
      id: "images",
      name: "Image Generation",
      description: "Sends prompts to Krea AI to create Pinterest-optimized 2:3 images",
      icon: ImageIcon,
      pipelineKey: "images",
      status: "idle",
      estimatedTime: "~5 min",
      prerequisites: ["Content generated", "Krea API key configured"],
    },
    {
      id: "review",
      name: "Review & Approve",
      description: "Review generated pins and approve or reject them before posting",
      icon: CheckCircle2,
      pipelineKey: "review",
      status: "idle",
      estimatedTime: "Manual",
      prerequisites: ["Images generated"],
    },
    {
      id: "posting",
      name: "Auto-Post to Pinterest",
      description: "Approved pins are posted to Pinterest at scheduled times (evenings, 17-21h)",
      icon: Send,
      pipelineKey: "posting",
      status: "idle",
      estimatedTime: "Automatic",
      prerequisites: ["Pins approved", "Pinterest connected"],
    },
    {
      id: "feedback",
      name: "Performance Feedback",
      description: "Analyzes pin performance to optimize future content generation",
      icon: BarChart3,
      pipelineKey: "feedback",
      status: "idle",
      estimatedTime: "~20 sec",
      prerequisites: ["Pins posted", "7+ days of analytics data"],
    },
  ]);

  const [taskLogs, setTaskLogs] = useState<TaskLog[]>([]);
  const [stats, setStats] = useState({
    totalPins: 0,
    generatedPins: 0,
    approvedPins: 0,
    postedPins: 0,
    totalKeywords: 0,
    totalBoards: 0,
  });

  useEffect(() => {
    if (!org) return;
    loadStats();
    loadTaskLogs();
  }, [org]);

  async function loadStats() {
    const supabase = createClient();
    const orgId = org!.id;

    const [pinsRes, keywordsRes, boardsRes] = await Promise.all([
      supabase.from("pins").select("status", { count: "exact" }).eq("org_id", orgId),
      supabase.from("keywords").select("id", { count: "exact" }).eq("org_id", orgId),
      supabase.from("boards").select("id", { count: "exact" }).eq("org_id", orgId),
    ]);

    const pins = pinsRes.data || [];
    setStats({
      totalPins: pinsRes.count || 0,
      generatedPins: pins.filter((p) => p.status === "generated").length,
      approvedPins: pins.filter((p) => ["approved", "scheduled"].includes(p.status)).length,
      postedPins: pins.filter((p) => p.status === "posted").length,
      totalKeywords: keywordsRes.count || 0,
      totalBoards: boardsRes.count || 0,
    });
  }

  async function loadTaskLogs() {
    const supabase = createClient();
    const { data } = await supabase
      .from("ai_tasks")
      .select("*")
      .eq("org_id", org!.id)
      .order("created_at", { ascending: false })
      .limit(10);
    setTaskLogs(data || []);
  }

  async function runPipeline(stepId: string) {
    const step = steps.find((s) => s.id === stepId);
    if (!step || step.status === "running") return;

    // Special cases for non-API steps
    if (stepId === "review") {
      window.location.href = "/pins?status=generated";
      return;
    }
    if (stepId === "posting") {
      // Posting is automatic via cron
      return;
    }

    setSteps((prev) =>
      prev.map((s) => (s.id === stepId ? { ...s, status: "running", result: undefined } : s))
    );

    try {
      let endpoint = "/api/pipeline/run";
      let body: Record<string, unknown> = { pipeline: step.pipelineKey };

      if (stepId === "images") {
        endpoint = "/api/ai/generate-images";
        body = { org_id: org!.id };
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Pipeline failed");
      }

      setSteps((prev) =>
        prev.map((s) =>
          s.id === stepId
            ? {
                ...s,
                status: "success",
                result: formatResult(stepId, data),
              }
            : s
        )
      );

      // Refresh stats
      loadStats();
      loadTaskLogs();
    } catch (err) {
      setSteps((prev) =>
        prev.map((s) =>
          s.id === stepId
            ? {
                ...s,
                status: "error",
                result: err instanceof Error ? err.message : "Unknown error",
              }
            : s
        )
      );
    }
  }

  function formatResult(stepId: string, data: Record<string, unknown>): string {
    const result = data.result as Record<string, unknown> | undefined;
    switch (stepId) {
      case "strategy":
        return `${result?.keywords || 0} keywords, ${result?.boards || 0} boards generated`;
      case "content":
        return `${result?.pinsCreated || 0} pins created for ${result?.daysPlanned || 0} days`;
      case "images":
        return `${data.generated || 0}/${data.total || 0} images sent to Krea`;
      case "feedback":
        if (result?.message) return result.message as string;
        return `${result?.keyword_updates || 0} keyword updates, ${result?.recommendations || 0} recommendations`;
      default:
        return "Completed";
    }
  }

  const pinterestConnected = !!org?.pinterest_user_id;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="w-6 h-6 text-primary" />
            Automation Pipeline
          </h1>
          <p className="text-muted-foreground mt-1">
            AI-powered content creation → image generation → auto-posting
          </p>
        </div>
        <button
          onClick={() => {
            loadStats();
            loadTaskLogs();
          }}
          className="flex items-center gap-2 px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {[
          { label: "Keywords", value: stats.totalKeywords, color: "text-blue-600" },
          { label: "Boards", value: stats.totalBoards, color: "text-purple-600" },
          { label: "Total Pins", value: stats.totalPins, color: "text-gray-700" },
          { label: "Generated", value: stats.generatedPins, color: "text-amber-600" },
          { label: "Approved", value: stats.approvedPins, color: "text-green-600" },
          { label: "Posted", value: stats.postedPins, color: "text-primary" },
        ].map((stat) => (
          <div key={stat.label} className="kpi-card rounded-xl p-4 text-center">
            <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Pipeline Steps */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Pipeline Steps</h2>

        {!pinterestConnected && (
          <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm">
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
            <div>
              <span className="font-medium">Pinterest not connected.</span> The pipeline can
              generate content and images, but posting requires a Pinterest connection.{" "}
              <a href="/integrations" className="text-primary hover:underline">
                Connect now →
              </a>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {steps.map((step, index) => (
            <div key={step.id} className="relative">
              {/* Connector line */}
              {index < steps.length - 1 && (
                <div className="absolute left-8 top-full w-px h-3 bg-border z-0" />
              )}

              <div className="glass-card rounded-xl p-5">
                <div className="flex items-start gap-4">
                  {/* Step number + icon */}
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      step.status === "success"
                        ? "bg-green-50 text-green-600"
                        : step.status === "error"
                          ? "bg-red-50 text-red-600"
                          : step.status === "running"
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {step.status === "running" ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : step.status === "success" ? (
                      <CheckCircle2 className="w-5 h-5" />
                    ) : step.status === "error" ? (
                      <XCircle className="w-5 h-5" />
                    ) : (
                      <step.icon className="w-5 h-5" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-muted-foreground">
                        STEP {index + 1}
                      </span>
                      {index < steps.length - 1 && (
                        <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                      )}
                    </div>
                    <h3 className="font-semibold mt-0.5">{step.name}</h3>
                    <p className="text-sm text-muted-foreground mt-0.5">{step.description}</p>

                    {/* Prerequisites */}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {step.prerequisites.map((pre) => (
                        <span
                          key={pre}
                          className="text-[11px] px-2 py-0.5 bg-muted rounded-full text-muted-foreground"
                        >
                          {pre}
                        </span>
                      ))}
                    </div>

                    {/* Result message */}
                    {step.result && (
                      <div
                        className={`mt-2 text-sm font-medium ${
                          step.status === "error" ? "text-red-600" : "text-green-600"
                        }`}
                      >
                        {step.result}
                      </div>
                    )}
                  </div>

                  {/* Action */}
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {step.estimatedTime}
                    </span>

                    {step.id === "posting" ? (
                      <div className="px-4 py-2 text-sm bg-muted rounded-lg text-muted-foreground">
                        {pinterestConnected ? (
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-green-500 live-pulse" />
                            Auto
                          </span>
                        ) : (
                          "Waiting for Pinterest"
                        )}
                      </div>
                    ) : step.id === "review" ? (
                      <button
                        onClick={() => runPipeline(step.id)}
                        className="px-4 py-2 text-sm bg-primary text-white rounded-lg glow-btn"
                      >
                        Review Pins
                      </button>
                    ) : (
                      <button
                        onClick={() => runPipeline(step.id)}
                        disabled={step.status === "running"}
                        className="px-4 py-2 text-sm bg-primary text-white rounded-lg glow-btn disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                      >
                        {step.status === "running" ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Running...
                          </>
                        ) : (
                          <>
                            <Play className="w-3.5 h-3.5" />
                            Run
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Task History */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Recent Pipeline Activity</h2>
        {taskLogs.length === 0 ? (
          <div className="glass-card rounded-xl p-8 text-center text-muted-foreground">
            <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p>No pipeline runs yet. Start with Step 1 — Strategy & Keywords.</p>
          </div>
        ) : (
          <div className="glass-card rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 font-medium">Pipeline</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">Input</th>
                  <th className="text-left px-4 py-3 font-medium">Output</th>
                  <th className="text-left px-4 py-3 font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {taskLogs.map((task) => (
                  <tr key={task.id} className="border-b border-border/50">
                    <td className="px-4 py-3 font-medium capitalize">
                      {task.task_type.replace("_", " ")}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                          task.status === "completed"
                            ? "bg-green-50 text-green-700"
                            : task.status === "failed"
                              ? "bg-red-50 text-red-700"
                              : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {task.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{task.input_summary || "-"}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {task.output_summary || "-"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {task.started_at
                        ? new Date(task.started_at).toLocaleDateString("nl-NL", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
