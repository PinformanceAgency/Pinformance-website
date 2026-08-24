"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, ExternalLink, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Requirement {
  daily_pin_target: number;
  spacing_hours: number;
  waterfall_duration_days: number;
  urls_per_month_needed: number;
  cooldown_days: number;
  rerun_interval_days: number;
  required_urls: number;
  existing_urls: number;
  gap: number;
  cooldown_below_floor: boolean;
}
interface Assessment {
  buildable_pages: number;
  existing_plus_buildable: number;
  verdict_suggested: "STRONG_FIT" | "MODERATE_FIT" | "WEAK_FIT";
  reasoning: string;
}
interface Proposal {
  id: string;
  proposed_title: string;
  page_type: string;
  supporting_keywords: string[];
  supporting_keywords_volume: number;
  brief: string;
  status: "PROPOSED" | "SENT_TO_CLIENT" | "BUILDING" | "BUILT" | "REJECTED";
  built_url: string | null;
  built_url_id: string | null;
  created_at: string;
  sent_to_client_at: string | null;
  built_at: string | null;
}

export function ExpansionPanel({
  orgId, requirement, assessment, proposals,
}: {
  orgId: string;
  requirement: Requirement;
  assessment: Assessment;
  proposals: Proposal[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [generating, setGenerating] = useState(false);
  const [genErr, setGenErr] = useState<string | null>(null);

  const canExpand = requirement.gap > 0 || proposals.length > 0;
  if (!canExpand) return null;

  async function generate() {
    setGenErr(null); setGenerating(true);
    try {
      const res = await fetch(`/api/organic/expansion/${orgId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "generate_and_save", target_count: Math.max(6, requirement.gap * 2) }),
        redirect: "error",
      });
      const t = await res.text();
      const j = t ? JSON.parse(t) : {};
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status} — ${t.slice(0, 140)}`);
      startTransition(() => router.refresh());
    } catch (e) { setGenErr((e as Error).message); }
    finally { setGenerating(false); }
  }

  const verdictClass =
    assessment.verdict_suggested === "STRONG_FIT"    ? "border-foreground/20 bg-muted text-foreground" :
    assessment.verdict_suggested === "MODERATE_FIT"  ? "border-border bg-muted text-foreground" :
                                                       "border-red-200 bg-red-50 text-red-900";

  return (
    <section>
      <h2 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-primary" />
        URL pool expansion
      </h2>

      {/* Requirement + verdict summary */}
      <div className={cn("rounded-lg border p-4 mb-3", verdictClass)}>
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <div>
            <div className="text-xs uppercase tracking-wide font-semibold">{assessment.verdict_suggested.replace("_", " ")}</div>
            <div className="text-sm mt-1">{assessment.reasoning}</div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-2xl font-semibold tabular-nums">{requirement.existing_urls} / {requirement.required_urls}</div>
            <div className="text-[11px]">existing / required</div>
            {requirement.gap > 0 && (
              <div className="text-[11px] mt-1">
                short by <strong>{requirement.gap}</strong> · {assessment.buildable_pages} proposal{assessment.buildable_pages === 1 ? "" : "s"} in queue
              </div>
            )}
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-current/10 text-[11px] flex flex-wrap gap-x-4 gap-y-1 opacity-90">
          <span>daily target {requirement.daily_pin_target}</span>
          <span>spacing {requirement.spacing_hours}h</span>
          <span>waterfall {requirement.waterfall_duration_days}d</span>
          <span>cooldown {requirement.cooldown_days}d{requirement.cooldown_below_floor && " ⚠ below 30-day floor"}</span>
          <span>rerun interval {requirement.rerun_interval_days}d</span>
          <span>urls/month {requirement.urls_per_month_needed}</span>
        </div>
      </div>

      {/* Generate action */}
      {proposals.length === 0 && (
        <div className="rounded-md border border-dashed border-border bg-card px-4 py-4 mb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-xs text-muted-foreground">
              No expansion proposals yet. Generate a page brief from the keyword bank + cluster axes.
            </div>
            <button type="button" onClick={generate} disabled={generating}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 disabled:opacity-50">
              <Sparkles className="w-3.5 h-3.5" />
              {generating ? "Generating…" : "Generate proposals"}
            </button>
          </div>
          {genErr && <div className="mt-2 text-xs text-red-600 break-words">{genErr}</div>}
        </div>
      )}

      {/* Proposal list */}
      {proposals.length > 0 && (
        <div className="space-y-2">
          {proposals.map((p) => <ProposalCard key={p.id} orgId={orgId} p={p} onRefresh={() => startTransition(() => router.refresh())} />)}
          <div className="text-right">
            <button type="button" onClick={generate} disabled={generating}
              className="text-[11px] text-primary hover:underline font-medium">
              + Re-generate (adds fresh proposals from the current bank)
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function ProposalCard({ orgId, p, onRefresh }: { orgId: string; p: Proposal; onRefresh: () => void }) {
  const [busy, setBusy] = useState(false);
  const [showBrief, setShowBrief] = useState(false);
  const [copiedBrief, setCopiedBrief] = useState(false);
  const [buildingUrl, setBuildingUrl] = useState("");
  const [showBuildInput, setShowBuildInput] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function post(body: Record<string, unknown>): Promise<unknown> {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/organic/expansion/${orgId}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(body), redirect: "error",
      });
      const t = await res.text();
      const j = t ? JSON.parse(t) : {};
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status} — ${t.slice(0, 140)}`);
      return j;
    } finally { setBusy(false); }
  }

  async function setStatus(status: Proposal["status"]) {
    try { await post({ action: "mark_status", id: p.id, status }); onRefresh(); }
    catch (e) { setErr((e as Error).message); }
  }

  async function markBuilt() {
    if (!buildingUrl.trim()) { setErr("Enter the built URL first."); return; }
    try {
      await post({ action: "mark_built_with_url", id: p.id, built_url: buildingUrl.trim() });
      setShowBuildInput(false); onRefresh();
    } catch (e) { setErr((e as Error).message); }
  }

  async function copyBrief() {
    await navigator.clipboard.writeText(p.brief);
    setCopiedBrief(true);
    setTimeout(() => setCopiedBrief(false), 1500);
  }

  const statusCls =
    p.status === "BUILT"          ? "border-foreground/30 bg-muted text-foreground" :
    p.status === "BUILDING"       ? "border-primary/30 bg-primary/10 text-primary" :
    p.status === "SENT_TO_CLIENT" ? "border-border bg-muted text-foreground" :
    p.status === "REJECTED"       ? "border-neutral-200 bg-muted text-neutral-500" :
                                    "border-border bg-card text-foreground";

  return (
    <div className={cn("rounded-lg border p-3", p.status === "REJECTED" && "opacity-60")}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-semibold uppercase tracking-wide", statusCls)}>{p.status.replace("_", " ")}</span>
            <span className="text-sm font-medium text-foreground truncate">{p.proposed_title}</span>
            <span className="text-[10px] text-muted-foreground uppercase">{p.page_type.replace(/_/g, " ")}</span>
          </div>
          {p.supporting_keywords.length > 0 && (
            <div className="mt-1 text-[11px] text-muted-foreground">
              anchors: {p.supporting_keywords.slice(0, 4).join(", ")}
              {p.supporting_keywords.length > 4 && <span>, +{p.supporting_keywords.length - 4} more</span>}
              {p.supporting_keywords_volume > 0 && <span className="ml-2 tabular-nums">· combined vol {p.supporting_keywords_volume.toLocaleString("en-US")}</span>}
            </div>
          )}
          {p.built_url && (
            <div className="mt-1 text-[11px]">
              <a href={p.built_url} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                {p.built_url} <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {p.status === "PROPOSED" && (
            <>
              <button type="button" onClick={() => setStatus("SENT_TO_CLIENT")} disabled={busy}
                className="text-[10px] px-2 py-0.5 rounded border border-border text-foreground hover:bg-muted disabled:opacity-50">Sent to client</button>
              <button type="button" onClick={() => setStatus("REJECTED")} disabled={busy}
                className="text-[10px] px-2 py-0.5 rounded border border-border text-muted-foreground hover:bg-muted disabled:opacity-50">Reject</button>
            </>
          )}
          {p.status === "SENT_TO_CLIENT" && (
            <button type="button" onClick={() => setStatus("BUILDING")} disabled={busy}
              className="text-[10px] px-2 py-0.5 rounded border border-primary/30 text-primary hover:bg-primary/10 disabled:opacity-50">Building</button>
          )}
          {(p.status === "BUILDING" || p.status === "SENT_TO_CLIENT") && (
            <button type="button" onClick={() => setShowBuildInput((v) => !v)}
              className="text-[10px] px-2 py-0.5 rounded bg-primary text-primary-foreground font-semibold hover:opacity-90">Mark built</button>
          )}
        </div>
      </div>

      {showBuildInput && (
        <div className="mt-2 flex items-center gap-1">
          <input type="url" value={buildingUrl} onChange={(e) => setBuildingUrl(e.target.value)}
            placeholder="https://client.com/collections/…"
            className="flex-1 rounded-md border border-border px-2 py-1 text-xs bg-card" />
          <button type="button" onClick={markBuilt} disabled={busy}
            className="text-[11px] px-2 py-1 rounded-md bg-primary text-primary-foreground font-semibold hover:opacity-90 disabled:opacity-50">
            Save
          </button>
          <button type="button" onClick={() => setShowBuildInput(false)}
            className="text-[11px] px-2 py-1 rounded-md border border-border">Cancel</button>
        </div>
      )}

      {err && <div className="mt-1 text-xs text-red-600 break-words">{err}</div>}

      <div className="mt-2 flex items-center gap-2 text-[11px]">
        <button type="button" onClick={() => setShowBrief((v) => !v)}
          className="text-muted-foreground hover:text-foreground">
          {showBrief ? "Hide brief ▲" : "Show brief ▼"}
        </button>
        {showBrief && (
          <button type="button" onClick={copyBrief}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            {copiedBrief ? <><Check className="w-3 h-3" /> copied</> : <><Copy className="w-3 h-3" /> copy</>}
          </button>
        )}
      </div>
      {showBrief && (
        <pre className="mt-2 whitespace-pre-wrap text-[11px] bg-muted/60 border border-border rounded p-3 text-foreground font-mono">
{p.brief}
        </pre>
      )}
    </div>
  );
}
