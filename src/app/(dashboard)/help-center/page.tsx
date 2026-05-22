"use client";

import { useEffect, useRef, useState } from "react";
import { useOrg } from "@/hooks/use-org";
import { cn } from "@/lib/utils";
import {
  LifeBuoy,
  Send,
  Loader2,
  CheckCircle2,
  Info,
  AlertTriangle,
  XCircle,
  Sparkles,
} from "lucide-react";

interface HistoryItem {
  id: string;
  prompt: string;
  response: string;
  type: "apply" | "answer" | "unsupported" | "error";
  capability: string | null;
  created_at: string;
}

interface ResponsePayload {
  type: "apply" | "answer" | "unsupported" | "error";
  message: string;
  capability?: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
}

export default function HelpCenterPage() {
  const { org, isAgencyAdmin, loading: orgLoading } = useOrg();
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (orgLoading) return;
    if (!isAgencyAdmin) {
      setHistoryLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/help-center/history", {
          cache: "no-store",
        });
        const json = await res.json();
        if (!cancelled && res.ok && json.ok) {
          // API returns newest first; chat reads oldest → newest top-to-bottom.
          setHistory((json.items as HistoryItem[]).slice().reverse());
        }
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAgencyAdmin, orgLoading]);

  useEffect(() => {
    transcriptRef.current?.scrollTo({
      top: transcriptRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [history.length, submitting]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);

    // Optimistic: show the prompt immediately with a placeholder response.
    const tempId = `temp-${Date.now()}`;
    setHistory((prev) => [
      ...prev,
      {
        id: tempId,
        prompt: trimmed,
        response: "…",
        type: "answer",
        capability: null,
        created_at: new Date().toISOString(),
      },
    ]);
    setPrompt("");

    try {
      const res = await fetch("/api/help-center/request", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmed }),
      });
      const json = (await res.json()) as ResponsePayload & { error?: string };
      const responseMsg = json.error || json.message || "(no response)";
      const finalType: HistoryItem["type"] = json.error
        ? "error"
        : (json.type as HistoryItem["type"]) || "answer";
      setHistory((prev) =>
        prev.map((h) =>
          h.id === tempId
            ? {
                ...h,
                response: responseMsg,
                type: finalType,
                capability: json.capability ?? null,
              }
            : h
        )
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      setHistory((prev) =>
        prev.map((h) =>
          h.id === tempId
            ? { ...h, response: msg, type: "error", capability: null }
            : h
        )
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (orgLoading) {
    return (
      <div className="flex items-center justify-center h-96 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  if (!isAgencyAdmin) {
    return (
      <div className="max-w-xl mx-auto mt-20 text-center space-y-3">
        <LifeBuoy className="w-10 h-10 mx-auto text-muted-foreground" />
        <h1 className="text-xl font-semibold">Help Center</h1>
        <p className="text-sm text-muted-foreground">
          The in-app Help Center is only available to agency administrators.
        </p>
      </div>
    );
  }

  const examples = [
    "Brand name should be Tobio's Kids, not Tobios Kids",
    "Set brand voice to 'luxe & professioneel'",
    "Add 'Made in EU' as a USP",
    "Update brand colors to #FF6B00, #1F1F1F, #FFFFFF",
    "Default landing page should be carol-jewellery.com",
    "Avoid the word 'cheap' in all AI output",
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <LifeBuoy className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Help Center</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Ask for a small change to{" "}
            <span className="font-medium text-foreground">
              {org?.name || "this organization"}
            </span>{" "}
            — brand name, voice, USPs, colors, SEO templates, default URLs.
            Anything that can be fixed without code is applied immediately.
          </p>
        </div>
      </div>

      {/* Transcript */}
      <div className="bg-card border border-border rounded-2xl flex flex-col h-[60vh] min-h-[400px]">
        <div
          ref={transcriptRef}
          className="flex-1 overflow-y-auto px-5 py-4 space-y-4"
        >
          {historyLoading ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : history.length === 0 ? (
            <EmptyState examples={examples} onPick={(s) => setPrompt(s)} />
          ) : (
            history.map((item) => <Message key={item.id} item={item} />)
          )}
        </div>

        {/* Input */}
        <form
          onSubmit={handleSend}
          className="border-t border-border p-3 flex items-end gap-2"
        >
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!submitting) handleSend(e);
              }
            }}
            placeholder="Type a small change or a question…"
            disabled={submitting}
            rows={1}
            className="flex-1 resize-none px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50 max-h-32"
          />
          <button
            type="submit"
            disabled={submitting || !prompt.trim()}
            className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </form>
      </div>

      <p className="text-xs text-muted-foreground">
        Tip: requests like &quot;the chart colors should be different&quot; or new
        features need a code change — those are flagged automatically and the
        developer should be contacted.
      </p>
    </div>
  );
}

function EmptyState({
  examples,
  onPick,
}: {
  examples: string[];
  onPick: (s: string) => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center max-w-lg mx-auto space-y-3">
      <Sparkles className="w-8 h-8 text-muted-foreground" />
      <h2 className="text-base font-semibold">Start a request</h2>
      <p className="text-xs text-muted-foreground">
        Try one of these — or type your own:
      </p>
      <div className="flex flex-wrap gap-1.5 justify-center">
        {examples.map((ex) => (
          <button
            key={ex}
            onClick={() => onPick(ex)}
            className="px-2.5 py-1 text-xs rounded-md border border-border bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}

function Message({ item }: { item: HistoryItem }) {
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <div className="max-w-[80%] px-3 py-2 rounded-2xl rounded-tr-md bg-primary text-primary-foreground text-sm whitespace-pre-wrap">
          {item.prompt}
        </div>
      </div>
      <div className="flex justify-start">
        <ResponseBubble item={item} />
      </div>
    </div>
  );
}

function ResponseBubble({ item }: { item: HistoryItem }) {
  const config = (() => {
    switch (item.type) {
      case "apply":
        return {
          icon: CheckCircle2,
          ringClass: "border-emerald-500/30 bg-emerald-500/5",
          iconClass: "text-emerald-600",
          label: "Applied",
        };
      case "answer":
        return {
          icon: Info,
          ringClass: "border-border bg-muted/30",
          iconClass: "text-foreground/60",
          label: null,
        };
      case "unsupported":
        return {
          icon: AlertTriangle,
          ringClass: "border-amber-500/30 bg-amber-500/5",
          iconClass: "text-amber-600",
          label: "Needs developer",
        };
      case "error":
        return {
          icon: XCircle,
          ringClass: "border-red-500/30 bg-red-500/5",
          iconClass: "text-red-600",
          label: "Error",
        };
    }
  })();
  const Icon = config.icon;
  return (
    <div
      className={cn(
        "max-w-[80%] px-3 py-2 rounded-2xl rounded-tl-md border text-sm",
        config.ringClass
      )}
    >
      <div className="flex items-start gap-2">
        <Icon className={cn("w-4 h-4 flex-shrink-0 mt-0.5", config.iconClass)} />
        <div className="space-y-1 min-w-0">
          {config.label && (
            <div className="text-[11px] uppercase tracking-wider font-medium text-foreground/70">
              {config.label}
              {item.capability && (
                <span className="ml-2 font-mono text-muted-foreground normal-case">
                  {item.capability}
                </span>
              )}
            </div>
          )}
          <div className="whitespace-pre-wrap text-foreground">{item.response}</div>
        </div>
      </div>
    </div>
  );
}
