"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { TaskCard } from "./phase/[phase]/PhaseBoard";
import { phaseMeta } from "@/lib/organic/phase-meta";
import type { CycleView } from "@/lib/organic/phase4";
import type { TaskRow, ViabilityRow } from "@/lib/organic/types";
import type { AssetRow, TaskAnswer } from "@/lib/organic/workspace";
import type { Phase2Snapshot } from "./Phase2Forms";
import type { Phase3Snapshot } from "./Phase3Forms";
import type { Deviation } from "@/lib/organic/structure";

interface OrgBoard { id: string; name: string; status: string; topic_name: string | null }
interface OrgKeyword { id: string; term: string; volume: number | null; type: string }
interface SelectableUrl { id: string; url: string; name: string; reason: string | null; is_seasonal: boolean; is_selectable: boolean }

const REASONS = ["SEASONAL","NEW","BEST_PERFORMER","CLIENT_REQUEST","STOCK_PUSH","AB_TEST"] as const;

export function Phase4Cycles({
  orgId, cycles, selectableUrls, orgBoards, orgKeywords,
  assets, answers, viability, phase2, phase3,
}: {
  orgId: string;
  cycles: CycleView[];
  selectableUrls: SelectableUrl[];
  orgBoards: OrgBoard[];
  orgKeywords: OrgKeyword[];
  assets: AssetRow[];
  answers: TaskAnswer[];
  viability: ViabilityRow | null;
  phase2: Phase2Snapshot;
  phase3: Phase3Snapshot;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-neutral-800">
          Phase 4 — Cycles <span className="text-neutral-400 font-normal">({cycles.length} active)</span>
        </h2>
      </div>

      <StartCycle orgId={orgId} candidates={selectableUrls} usedUrlIds={new Set(cycles.map((c) => c.url_id))} />

      {cycles.length === 0 && (
        <div className="rounded-md border border-dashed border-neutral-300 bg-white px-4 py-6 text-sm text-neutral-500 text-center">
          No active cycles. Start one by picking a candidate URL above.
        </div>
      )}

      <div className="space-y-2">
        {cycles.map((c) => (
          <CycleCard key={c.cycle} orgId={orgId} cycle={c} orgBoards={orgBoards} orgKeywords={orgKeywords}
                     assets={assets} answers={answers} viability={viability} phase2={phase2} phase3={phase3} />
        ))}
      </div>
    </section>
  );
}

// ---------- Cycle starter ---------------------------------------------------

function StartCycle({
  orgId, candidates, usedUrlIds,
}: {
  orgId: string;
  candidates: SelectableUrl[];
  usedUrlIds: Set<string>;
}) {
  const available = candidates.filter((c) => c.is_selectable && !usedUrlIds.has(c.id));
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [pick, setPick] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function start() {
    if (!pick) { setErr("Pick a URL first."); return; }
    setErr(null); setSubmitting(true);
    try {
      await callP4(orgId, { action: "start_cycle", url_id: pick });
      setPick("");
      startTransition(() => router.refresh());
    } catch (e) {
      setErr((e as Error).message);
    } finally { setSubmitting(false); }
  }

  return (
    <div className="rounded-md border border-border bg-card p-3">
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-xs text-neutral-600 hover:text-neutral-900">
        <span className="font-medium">+ Start new cycle</span>
        <span className="text-neutral-400">{available.length} URL{available.length === 1 ? "" : "s"} eligible {open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {available.length === 0 ? (
            <div className="text-[11px] text-neutral-500">
              No URLs are currently selectable. Add or update URLs so they pass cooldown (60d), topic coverage (≥5 boards), and are assigned to ≥5 boards.
            </div>
          ) : (
            <>
              <select value={pick} onChange={(e) => setPick(e.target.value)}
                className="w-full rounded-md border border-neutral-300 px-2 py-1 text-xs bg-white">
                <option value="">— Pick a candidate URL —</option>
                {available.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} — {c.url}</option>
                ))}
              </select>
              <div className="flex items-center gap-2">
                <button type="button" onClick={start} disabled={submitting || !pick}
                  className="px-3 py-1 rounded-md bg-neutral-900 text-white text-xs font-semibold hover:bg-neutral-800 disabled:opacity-50">
                  {submitting ? "Starting…" : "Start cycle"}
                </button>
                {err && <span className="text-xs text-red-600">{err}</span>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- Cycle card ------------------------------------------------------

function CycleCard({
  orgId, cycle, orgBoards, orgKeywords, assets, answers, viability, phase2, phase3,
}: {
  orgId: string;
  cycle: CycleView;
  orgBoards: OrgBoard[];
  orgKeywords: OrgKeyword[];
  assets: AssetRow[];
  answers: TaskAnswer[];
  viability: ViabilityRow | null;
  phase2: Phase2Snapshot;
  phase3: Phase3Snapshot;
}) {
  const [expanded, setExpanded] = useState(cycle.progress.pct < 100);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <button type="button" onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-start justify-between gap-3 px-4 py-3 hover:bg-neutral-50 text-left">
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-sm font-semibold text-neutral-900">{cycle.url_name}</span>
            <ReasonPill reason={cycle.reason} />
            {cycle.is_seasonal && <span className="text-[10px] px-1 py-0.5 rounded border border-border bg-muted text-foreground font-medium">SEASONAL</span>}
            {cycle.topic_name && <span className="text-[10px] text-neutral-500">· {cycle.topic_name}</span>}
          </div>
          <div className="text-[11px] text-neutral-500 truncate mt-0.5">{cycle.url}</div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-32">
            <div className="h-1.5 rounded-full bg-neutral-100 overflow-hidden">
              <div className={`h-full ${cycle.progress.pct >= 100 ? "bg-foreground" : cycle.progress.pct >= 50 ? "bg-primary" : "bg-border"}`}
                style={{ width: `${Math.min(100, cycle.progress.pct)}%` }} />
            </div>
            <div className="text-[10px] text-neutral-500 mt-0.5 tabular-nums text-right">
              {cycle.progress.done}/{cycle.progress.total}
              {cycle.progress.blocked > 0 && <span className="text-red-600 ml-1">· {cycle.progress.blocked} blocked</span>}
            </div>
          </div>
          <span className="text-neutral-400 text-xs">{expanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-neutral-100 divide-y divide-neutral-100">
          <SetupSection orgId={orgId} cycle={cycle} orgBoards={orgBoards} orgKeywords={orgKeywords} />
          <CopySection orgId={orgId} cycle={cycle} />
          <WaterfallSection orgId={orgId} cycle={cycle} />
          <TaskListSection cycle={cycle} orgId={orgId} assets={assets} answers={answers}
                           viability={viability} phase2={phase2} phase3={phase3} />
        </div>
      )}
    </div>
  );
}

function ReasonPill({ reason }: { reason: string }) {
  const cls =
    reason === "BEST_PERFORMER" ? "bg-foreground text-white border-foreground" :
    reason === "SEASONAL"       ? "bg-muted text-foreground border-border" :
    reason === "NEW"            ? "bg-primary/10 text-primary border-primary/30" :
    reason === "CLIENT_REQUEST" ? "bg-muted text-foreground border-border" :
    reason === "AB_TEST"        ? "bg-pink-50 text-pink-700 border-pink-200" :
    "bg-neutral-100 text-neutral-600 border-neutral-200";
  return <span className={`text-[10px] px-1 py-0.5 rounded border font-semibold uppercase tracking-wide ${cls}`}>{reason}</span>;
}

// ---------- section 1: setup (reason + boards + keywords) --------------------

function SetupSection({
  orgId, cycle, orgBoards, orgKeywords,
}: {
  orgId: string;
  cycle: CycleView;
  orgBoards: OrgBoard[];
  orgKeywords: OrgKeyword[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [reason, setReason] = useState(cycle.reason);
  const [reasonNote, setReasonNote] = useState(cycle.reason_note ?? "");
  const [boardIds, setBoardIds] = useState<Set<string>>(new Set(cycle.assigned_boards.map((b) => b.board_id)));
  const [keywordIds, setKeywordIds] = useState<Set<string>>(new Set(cycle.assigned_keywords.map((k) => k.keyword_id)));
  const [primary, setPrimary] = useState(cycle.assigned_keywords.find((k) => k.is_primary)?.keyword_id ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setErr(null); setSaving(true);
    try {
      // Update URL reason + note
      await callP4(orgId, {
        action: "upsert_url",
        url: cycle.url, name: cycle.url_name, type: "COLLECTION",
        reason, reason_note: reasonNote,
        topic_id: cycle.topic_id, funnel_stage: cycle.funnel_stage,
        is_seasonal: cycle.is_seasonal,
        peak_window_start: cycle.peak_window_start, peak_window_end: cycle.peak_window_end,
      });
      // Assign boards + keywords (backend validates min/max)
      const boardIdsArr = Array.from(boardIds);
      if (boardIdsArr.length > 0) {
        await callP4(orgId, { action: "assign_boards", url_id: cycle.url_id, board_ids: boardIdsArr });
      }
      const kwArr = Array.from(keywordIds);
      if (kwArr.length > 0) {
        if (!primary || !keywordIds.has(primary)) throw new Error("Pick a primary keyword from the selected list.");
        await callP4(orgId, { action: "assign_keywords", url_id: cycle.url_id, keyword_ids: kwArr, primary_id: primary });
      }
      startTransition(() => router.refresh());
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  }

  const toggleBoard = (id: string) => {
    const n = new Set(boardIds); n.has(id) ? n.delete(id) : n.add(id); setBoardIds(n);
  };
  const toggleKeyword = (id: string) => {
    const n = new Set(keywordIds); n.has(id) ? n.delete(id) : n.add(id); setKeywordIds(n);
    if (n.size === 0) setPrimary("");
    else if (!n.has(primary)) setPrimary(Array.from(n)[0]);
  };

  return (
    <div className="p-4 space-y-3">
      <SectionTitle text="1 · Setup — reason, boards, keywords (P4.1.5 / P4.1.6 / P4.1.7)" />

      <DeviationPanel deviations={cycle.deviations} />

      {/* The research is one click from the decision it informs. Half of it
          does not steer anything automatically — the competitor exports,
          the intake prose, the reasoning behind a red flag — and this is
          the moment somebody wants to check it. */}
      <a href={`/client/${orgId}/research`} target="_blank" rel="noreferrer"
         className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
        <BookOpen className="w-3.5 h-3.5" />
        Look something up in the research
      </a>

      {/* Reason */}
      <div className="grid grid-cols-3 gap-2">
        <label className="block text-[11px] col-span-1">
          <span className="text-neutral-500 block mb-0.5">Why this URL matters (mandatory)</span>
          <select value={reason} onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-2 py-1 text-xs bg-white">
            {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label className="block text-[11px] col-span-2">
          <span className="text-neutral-500 block mb-0.5">Note (optional)</span>
          <input value={reasonNote} onChange={(e) => setReasonNote(e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-2 py-1 text-xs" />
        </label>
      </div>

      {/* Boards */}
      <div>
        <div className="text-[11px] text-neutral-500 mb-1">Boards (≥5 required) — {boardIds.size} picked</div>
        <div className="max-h-48 overflow-y-auto rounded border border-neutral-200 bg-neutral-50 p-2 grid grid-cols-2 gap-1">
          {orgBoards.map((b) => (
            <label key={b.id} className="flex items-center gap-1.5 text-[11px] cursor-pointer">
              <input type="checkbox" checked={boardIds.has(b.id)} onChange={() => toggleBoard(b.id)} />
              <span className="truncate">{b.name}</span>
              <span className="text-neutral-400">· {b.status}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Keywords */}
      <div>
        <div className="text-[11px] text-neutral-500 mb-1">
          Keywords (max 5, from cache) — {keywordIds.size} picked{primary && `, primary: ${orgKeywords.find((k) => k.id === primary)?.term ?? "?"}`}
        </div>
        <div className="max-h-40 overflow-y-auto rounded border border-neutral-200 bg-neutral-50 p-2 grid grid-cols-2 gap-1">
          {orgKeywords.slice(0, 50).map((k) => (
            <label key={k.id} className="flex items-center gap-1.5 text-[11px]">
              <input type="checkbox" checked={keywordIds.has(k.id)} onChange={() => toggleKeyword(k.id)} disabled={!keywordIds.has(k.id) && keywordIds.size >= 5} />
              <span className="truncate">{k.term}</span>
              {k.volume != null && <span className="text-neutral-400 tabular-nums">{k.volume}</span>}
              {keywordIds.has(k.id) && (
                <button type="button" onClick={() => setPrimary(k.id)}
                  className={`ml-1 text-[9px] px-1 rounded border ${primary === k.id ? "bg-primary text-primary-foreground border-primary" : "text-primary border-primary/30"}`}
                  title="Set as primary">{primary === k.id ? "★" : "☆"}</button>
              )}
            </label>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button type="button" onClick={save} disabled={saving}
          className="px-3 py-1 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 disabled:opacity-50">
          {saving ? "Saving…" : "Save setup"}
        </button>
        {err && <span className="text-xs text-red-600 break-words">{err}</span>}
      </div>
    </div>
  );
}

// ---------- section 2: copy editor with live validators --------------------

function CopySection({ orgId, cycle }: { orgId: string; cycle: CycleView }) {
  const primaryKw = cycle.assigned_keywords.find((k) => k.is_primary)?.term ?? "";
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [briefLoading, setBriefLoading] = useState(false);
  const [brief, setBrief] = useState<{ primary_keyword?: string; long_tail_keywords?: string[]; dominant_colors?: string[] } | null>(null);
  const [briefErr, setBriefErr] = useState<string | null>(null);

  const validation = useMemo(() => validateCopy(title, description, primaryKw), [title, description, primaryKw]);

  async function loadBrief() {
    setBriefLoading(true); setBriefErr(null);
    try {
      const r = await callP4(orgId, { action: "brief", url_id: cycle.url_id }) as { brief: typeof brief };
      setBrief(r.brief);
    } catch (e) { setBriefErr((e as Error).message); }
    finally { setBriefLoading(false); }
  }

  return (
    <div className="p-4 space-y-3">
      <SectionTitle text="2 · Design brief + copy (P4.2.3 / P4.2.8 / P4.2.9)" />

      <div className="flex items-center gap-2">
        <button type="button" onClick={loadBrief} disabled={briefLoading}
          className="px-3 py-1 rounded-md border border-neutral-300 bg-white hover:bg-neutral-50 text-xs disabled:opacity-50">
          {briefLoading ? "Assembling…" : "Assemble design brief from DB"}
        </button>
        {briefErr && <span className="text-xs text-red-600">{briefErr}</span>}
      </div>
      {brief && (
        <div className="rounded border border-neutral-200 bg-neutral-50 p-2 text-[11px] space-y-1">
          <div><span className="text-neutral-500">Primary keyword:</span> <span className="font-medium">{brief.primary_keyword}</span></div>
          <div><span className="text-neutral-500">Long-tail:</span> {brief.long_tail_keywords?.join(", ")}</div>
          <div className="flex items-center gap-1">
            <span className="text-neutral-500">Colors:</span>
            {(brief.dominant_colors ?? []).map((c) => (
              <span key={c} className="inline-flex items-center gap-1">
                <span className="w-3 h-3 rounded border border-neutral-300" style={{ backgroundColor: c }} />
                <span className="tabular-nums">{c}</span>
              </span>
            ))}
          </div>
          <div className="text-neutral-500">Save/Click split: 80/20 (3 SAVE designs + 1 CLICK design).</div>
        </div>
      )}

      <div className="text-[11px] text-neutral-500">
        Copy shared across 4 crops per design. Primary keyword for validator: <span className="font-mono">{primaryKw || "— assign keyword first —"}</span>
      </div>

      <div className="space-y-1">
        <label className="block text-[11px]">
          <span className="text-neutral-500">Title (max 100, must start with primary keyword)</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120}
            className={`mt-0.5 w-full rounded-md border px-2 py-1 text-xs ${validation.title.ok ? "border-neutral-300" : "border-red-400 bg-red-50"}`} />
        </label>
        <div className={`text-[10px] tabular-nums ${validation.title.ok ? "text-neutral-500" : "text-red-600"}`}>
          {title.length}/100 · {validation.title.ok ? "OK" : validation.title.errors.join(" · ")}
        </div>
      </div>

      <div className="space-y-1">
        <label className="block text-[11px]">
          <span className="text-neutral-500">Description (250–300, no ! # em/en dash)</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4}
            className={`mt-0.5 w-full rounded-md border px-2 py-1 text-xs ${validation.desc.ok ? "border-neutral-300" : "border-red-400 bg-red-50"}`} />
        </label>
        <div className={`text-[10px] tabular-nums ${validation.desc.ok ? "text-neutral-500" : "text-red-600"}`}>
          {description.length}/300 · {validation.desc.ok ? "OK" : validation.desc.errors.join(" · ")}
        </div>
      </div>

      <div className={`text-[11px] rounded px-2 py-1 ${validation.overall.ok ? "bg-muted text-foreground border border-border" : "bg-red-50 text-red-700 border border-red-200"}`}>
        {validation.overall.ok ? "✓ All validators pass — copy would be committed." : "Copy would be blocked by validators."}
      </div>
    </div>
  );
}

function validateCopy(title: string, description: string, primaryKw: string) {
  const t = title.trim(); const d = description.trim(); const kw = primaryKw.trim().toLowerCase();
  const titleErrs: string[] = [];
  const descErrs: string[] = [];
  if (t.length === 0) titleErrs.push("empty");
  else if (t.length > 100) titleErrs.push("> 100 chars");
  if (kw && !t.toLowerCase().slice(0, Math.max(kw.length + 20, 30)).includes(kw)) titleErrs.push("primary keyword not at front");
  if (/[!]/.test(t)) titleErrs.push("no !");
  if (/#/.test(t)) titleErrs.push("no #");
  if (/[—–]/.test(t)) titleErrs.push("no em/en dash");
  if (d.length < 250 || d.length > 300) descErrs.push(`250–300 required (${d.length})`);
  if (/[!]/.test(d)) descErrs.push("no !");
  if (/#/.test(d)) descErrs.push("no #");
  if (/[—–]/.test(d)) descErrs.push("no em/en dash");
  return {
    title: { ok: titleErrs.length === 0, errors: titleErrs },
    desc: { ok: descErrs.length === 0, errors: descErrs },
    overall: { ok: titleErrs.length === 0 && descErrs.length === 0 },
  };
}

// ---------- section 3: waterfall trigger + calendar ------------------------

function WaterfallSection({ orgId, cycle }: { orgId: string; cycle: CycleView }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [generating, setGenerating] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ waterfall_id: string; matrix: string[][]; pin_schedule: Array<{ seq: number; design: number; copy: string; board_index: number; date: string }>; interval_days_between_same_design: number; spacing_hours: number } | null>(null);

  async function generate() {
    setErr(null); setGenerating(true); setResult(null);
    try {
      const r = await callP4(orgId, { action: "waterfall", url_id: cycle.url_id, start_date: startDate });
      setResult(r as typeof result);
      startTransition(() => router.refresh());
    } catch (e) { setErr((e as Error).message); }
    finally { setGenerating(false); }
  }

  const boardNames = cycle.assigned_boards.slice(0, 4).map((b) => b.board_name);
  const displayMatrix = result?.matrix ?? [];

  return (
    <div className="p-4 space-y-3">
      <SectionTitle text="3 · Waterfall generation (P4.3.1 / P4.3.2)" />

      {cycle.waterfall && (
        <div className="text-[11px] text-neutral-500">
          Existing waterfall: <span className="font-mono">{cycle.waterfall.id.slice(0, 8)}</span> ·
          status <span className="font-medium">{cycle.waterfall.status}</span> ·
          start {cycle.waterfall.start_date} · spacing {cycle.waterfall.spacing_hours}h
        </div>
      )}

      <div className="flex items-center gap-2 text-xs">
        <label>
          Start date:
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
            className="ml-1 rounded border border-neutral-300 px-2 py-1 text-xs" />
        </label>
        <button type="button" onClick={generate} disabled={generating}
          className="px-3 py-1 rounded-md bg-neutral-900 text-white text-xs font-semibold hover:bg-neutral-800 disabled:opacity-50">
          {generating ? "Generating…" : cycle.waterfall ? "Regenerate 16-pin waterfall" : "Generate 16-pin waterfall"}
        </button>
        {err && <span className="text-red-600 break-words">{err}</span>}
      </div>

      {result && (
        <div className="space-y-3">
          <div className="text-[11px] text-neutral-600">
            {result.pin_schedule.length} pins committed · same-design interval {result.interval_days_between_same_design} days · spacing {result.spacing_hours}h
          </div>

          {/* Design → Board matrix */}
          <div>
            <div className="text-[11px] font-semibold text-neutral-600 mb-1">Design → Board matrix</div>
            <table className="text-[11px] border-collapse">
              <thead>
                <tr>
                  <th className="border border-neutral-200 bg-neutral-50 px-2 py-1"></th>
                  {["A","B","C","D"].map((v) => <th key={v} className="border border-neutral-200 bg-neutral-50 px-2 py-1">{v}</th>)}
                </tr>
              </thead>
              <tbody>
                {displayMatrix.map((row, d) => (
                  <tr key={d}>
                    <td className="border border-neutral-200 bg-neutral-50 px-2 py-1 font-medium">D{d + 1}</td>
                    {row.map((boardId, i) => (
                      <td key={i} className="border border-neutral-200 px-2 py-1 truncate max-w-[140px]">
                        {boardNames[cycle.assigned_boards.findIndex((b) => b.board_id === boardId)] ?? boardId.slice(0, 8)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 16-pin calendar */}
          <div>
            <div className="text-[11px] font-semibold text-neutral-600 mb-1">16-pin calendar</div>
            <div className="grid grid-cols-8 gap-1">
              {result.pin_schedule.map((p) => (
                <div key={p.seq} className="rounded border border-border bg-card p-1 text-[10px]">
                  <div className="text-neutral-400 tabular-nums">{p.date.slice(5)}</div>
                  <div className="font-semibold">D{p.design}/{p.copy}</div>
                  <div className="text-neutral-500 truncate">{boardNames[p.board_index] ?? `b${p.board_index}`}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- section 4: raw task list ---------------------------------------

function TaskListSection({
  cycle, orgId, assets, answers, viability, phase2, phase3,
}: {
  cycle: CycleView;
  orgId: string;
  assets: AssetRow[];
  answers: TaskAnswer[];
  viability: ViabilityRow | null;
  phase2: Phase2Snapshot;
  phase3: Phase3Snapshot;
}) {
  const grouped = useMemo(() => {
    const m = new Map<string, typeof cycle.tasks>();
    for (const t of cycle.tasks) {
      const arr = m.get(t.step) ?? [];
      arr.push(t);
      m.set(t.step, arr);
    }
    return Array.from(m.entries())
      .map(([step, ts]) => ({ step, tasks: ts.sort((a, b) => a.sort_order - b.sort_order) }))
      .sort((a, b) => a.step.localeCompare(b.step));
  }, [cycle.tasks]);

  const assetsByTask = useMemo(() => {
    const m = new Map<string, AssetRow[]>();
    for (const a of assets) {
      if (!a.linked_task_id) continue;
      const arr = m.get(a.linked_task_id) ?? [];
      arr.push(a);
      m.set(a.linked_task_id, arr);
    }
    return m;
  }, [assets]);

  const meta = phaseMeta(4);

  return (
    <div className="p-4 space-y-4">
      <SectionTitle text={`4 · Every task in this cycle (${cycle.tasks.length})`} />
      {grouped.map((g) => {
        const sm = meta?.steps[g.step] ?? null;
        const done = g.tasks.filter((t) => t.status === "DONE").length;
        return (
          <section key={g.step} className="o-card overflow-hidden">
            <div className="o-card-head px-5 py-4">
              <div className="flex items-baseline justify-between gap-4 flex-wrap">
                <h4 className="o-h3 text-foreground">{sm?.title ?? `Step 4.${g.step}`}</h4>
                <span className="o-figure text-[11px] text-o-ink-3">{done}/{g.tasks.length} done</span>
              </div>
              {sm && (
                <dl className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-px bg-o-hairline rounded-lg overflow-hidden">
                  {([["What", sm.what], ["Where", sm.where], ["Output", sm.output]] as const).map(([k, v]) => (
                    <div key={k} className="bg-o-surface px-4 py-3">
                      <dt className="o-eyebrow">{k}</dt>
                      <dd className="mt-1.5 text-sm text-o-ink-2 leading-relaxed">{v}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
            <div className="divide-y divide-o-hairline">
              {g.tasks.map((t) => (
                <TaskCard
                  key={t.client_task_id}
                  orgId={orgId}
                  task={{ ...t, block_reasons: [] } as unknown as TaskRow}
                  viability={viability}
                  phase2={phase2}
                  phase3={phase3}
                  assets={assetsByTask.get(t.task_id) ?? []}
                  answers={answers}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === "DONE" ? "bg-foreground text-white border-foreground" :
    status === "BLOCKED" ? "bg-red-50 text-red-700 border-red-200" :
    status === "IN_PROGRESS" ? "bg-primary/10 text-primary border-primary/30" :
    status === "REVIEW" ? "bg-muted text-foreground border-border" :
    status === "SKIPPED" ? "bg-neutral-100 text-neutral-500 border-neutral-200" :
    "bg-white text-neutral-600 border-neutral-200";
  return <span className={`text-[9px] px-1.5 py-0.5 rounded border font-semibold uppercase ${cls}`}>{status.replace("_", " ")}</span>;
}

function SectionTitle({ text }: { text: string }) {
  return <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{text}</div>;
}

// ---------- shared post helper ----------------------------------------------

async function callP4(orgId: string, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`/api/organic/phase4/${orgId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    redirect: "error",
  });
  const text = await res.text();
  let data: { error?: string } & Record<string, unknown> = {};
  try { data = JSON.parse(text); } catch { /* keep raw */ }
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status} — ${text.slice(0, 160)}`);
  return data;
}


/**
 * What this selection does differently, and what it goes against.
 *
 * Advisory by design. Nothing here disables a control or stops a save — the
 * media buyer regularly knows something the research does not, and a tool
 * that argues with them is a tool they work around. What it will not do is
 * let a departure go unmarked: three months on, a deliberate exception and
 * an oversight look identical, and nobody remembers which it was.
 *
 * The two kinds are separated because they are answered differently. A
 * structure deviation is a rule of the method; a research deviation
 * contradicts what this account's own research found, and the manager is
 * often the one who knows why that research is out of date.
 */
function DeviationPanel({ deviations }: { deviations: Deviation[] }) {
  if (deviations.length === 0) return null;
  return (
    <div className="rounded-lg ring-1 ring-inset ring-o-accent/25 bg-o-accent/[0.04] px-3.5 py-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-3.5 h-3.5 text-o-accent shrink-0" />
        <span className="o-eyebrow text-o-accent">
          {deviations.length} thing{deviations.length === 1 ? "" : "s"} here differ from the structure
        </span>
        <span className="text-[11px] text-muted-foreground">— you can proceed anyway</span>
      </div>
      <ul className="mt-2.5 space-y-2">
        {deviations.map((d, i) => (
          <li key={i} className="text-xs leading-relaxed">
            <span className={cn(
              "inline-block rounded px-1.5 py-[1px] mr-2 text-[10px] font-semibold uppercase tracking-wide align-middle",
              d.kind === "research"
                ? "bg-o-accent text-white"
                : "bg-o-sunk text-o-ink-2 ring-1 ring-inset ring-o-hairline-firm"
            )}>
              {d.kind}
            </span>
            <span className="font-medium text-foreground">{d.what}</span>
            <span className="block mt-0.5 ml-[3.6rem] text-muted-foreground">{d.why}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
