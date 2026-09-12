"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, BookOpen, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { TaskCard } from "./phase/[phase]/PhaseBoard";
import { phaseMeta } from "@/lib/organic/phase-meta";
import { useFormDraft } from "./useFormDraft";
import type { CycleView } from "@/lib/organic/phase4";
import type { TaskRow, ViabilityRow } from "@/lib/organic/types";
import type { AssetRow, TaskAnswer } from "@/lib/organic/workspace";
import type { Phase2Snapshot } from "./Phase2Forms";
import type { Phase3Snapshot } from "./Phase3Forms";
import type { Deviation } from "@/lib/organic/structure";
import { Phase4Sourcing } from "./Phase4Sourcing";

interface OrgBoard { id: string; name: string; status: string; topic_name: string | null }
interface OrgKeyword { id: string; term: string; volume: number | null; type: string }
interface SelectableUrl {
  id: string; url: string; name: string; reason: string | null; is_seasonal: boolean;
  is_selectable: boolean;
  /** The three conditions behind is_selectable, so the picker can say what
   *  is missing instead of hiding the URL. */
  cooldown_clear: boolean; topic_covered: boolean; assigned_boards: number | string;
}

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

      {/* Filling the pool and choosing from it come before starting a cycle,
          and in that order — P4.1.1 was an empty list on every real store
          because nothing ever wrote organic.urls. */}
      <Phase4Sourcing orgId={orgId} poolSize={selectableUrls.length} />

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
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [pick, setPick] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  // Everything not already in a cycle, eligible or not. Filtering the list on
  // is_selectable is what made this box report "No URLs are currently
  // selectable" on a store with 167 URLs, while P4.1.4's proposal on the next
  // screen offered every one of them and started cycles happily. The gate is
  // the method's answer, not a lock: a store with one product never reaches
  // four boards under a covered topic and still has to be able to work.
  const free = candidates.filter((c) => !usedUrlIds.has(c.id));
  const eligible = free.filter((c) => c.is_selectable);
  // A URL inside its cooldown is not offered at all. That is the one
  // condition with no override: it exists so our own pins do not compete
  // with each other, and no shortage of URLs makes that safe.
  const overridable = free.filter((c) => !c.is_selectable && c.cooldown_clear);
  const offered = [...eligible, ...overridable];
  const picked = offered.find((c) => c.id === pick) ?? null;
  const needsReason = picked != null && !picked.is_selectable;

  function shortfall(c: SelectableUrl): string {
    const bits = [
      !c.topic_covered ? "topic under five live boards" : null,
      Number(c.assigned_boards) < 4 ? `${c.assigned_boards} of 4 boards` : null,
    ].filter(Boolean);
    return bits.length ? bits.join(", ") : "does not pass the gate";
  }

  async function start() {
    if (!pick) { setErr("Pick a URL first."); return; }
    if (needsReason && reason.trim() === "") {
      setErr("This URL does not pass the gate. Say why it starts anyway — one line is enough.");
      return;
    }
    setErr(null); setSubmitting(true);
    try {
      await callP4(orgId, {
        action: "start_cycle",
        url_id: pick,
        ...(needsReason ? { override_reason: reason.trim() } : {}),
      });
      setPick(""); setReason("");
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
        <span className="text-neutral-400">
          {eligible.length} eligible
          {overridable.length > 0 && ` · ${overridable.length} short of the gate`}
          {" "}{open ? "▲" : "▼"}
        </span>
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {offered.length === 0 ? (
            <div className="text-[11px] text-neutral-500">
              Every URL on this store is inside its 60-day cooldown, or there are none yet.
              A URL in cooldown comes back on its own — the date is on the URL.
            </div>
          ) : (
            <>
              <select value={pick} onChange={(e) => { setPick(e.target.value); setErr(null); }}
                className="w-full rounded-md border border-neutral-300 px-2 py-1 text-xs bg-white">
                <option value="">— Pick a candidate URL —</option>
                {eligible.length > 0 && (
                  <optgroup label="Passes the gate">
                    {eligible.map((c) => (
                      <option key={c.id} value={c.id}>{c.name} — {c.url}</option>
                    ))}
                  </optgroup>
                )}
                {overridable.length > 0 && (
                  <optgroup label="Short of the gate — needs a reason">
                    {overridable.map((c) => (
                      <option key={c.id} value={c.id}>{c.name} — {shortfall(c)}</option>
                    ))}
                  </optgroup>
                )}
              </select>
              {needsReason && picked && (
                <div className="space-y-1">
                  <div className="text-[11px] text-amber-700">
                    {picked.name} is short of the gate ({shortfall(picked)}). It can still run —
                    a one-product store never reaches four boards — but the reason stays on the cycle.
                  </div>
                  <input
                    type="text" value={reason} onChange={(e) => setReason(e.target.value)}
                    placeholder="Why start this one anyway?"
                    className="w-full rounded-md border border-amber-300 px-2 py-1 text-xs bg-white"
                  />
                </div>
              )}
              <div className="flex items-center gap-2">
                <button type="button" onClick={start} disabled={submitting || !pick}
                  className="px-3 py-1 rounded-md bg-neutral-900 text-white text-xs font-semibold hover:bg-neutral-800 disabled:opacity-50">
                  {submitting ? "Starting…" : needsReason ? "Start anyway" : "Start cycle"}
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
          {cycle.gate_override_reason && (
            <div className="text-[11px] text-amber-700 mt-0.5">
              Started without passing the gate: {cycle.gate_override_reason}
            </div>
          )}
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
      <ReadinessPanel readiness={cycle.readiness} />

      {/* P4.1.5 was retired — the reason is set when the URL enters the pool
          rather than as a step of its own. The dropdown stays here because
          urls.reason still drives the candidate ranking. */}
      <SectionTitle text="1 · Setup — reason, boards, keywords (P4.1.6 / P4.1.7 / P4.1.8)" />

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

interface CycleAsset {
  design_id: string;
  design_number: number;
  intent: string | null;
  copy_set_id: string | null;
  title: string | null;
  description: string | null;
  validator_status: string | null;
  copy_qc: string | null;
}

function CopySection({ orgId, cycle }: { orgId: string; cycle: CycleView }) {
  const primaryKw = cycle.assigned_keywords.find((k) => k.is_primary)?.term ?? "";
  const [designs, setDesigns] = useState<CycleAsset[] | null>(null);
  const [designId, setDesignId] = useState<string>("");
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [brief, setBrief] = useState<{ primary_keyword?: string; long_tail_keywords?: string[]; dominant_colors?: string[] } | null>(null);
  const [briefErr, setBriefErr] = useState<string | null>(null);

  // The copy belongs to a design — four designs, four copy sets, one per
  // design shared across its crops. Which one the boxes were writing to was
  // the question this panel never asked, because it wrote to nothing at all.
  const loadDesigns = useCallback(async () => {
    try {
      const r = await callP4(orgId, { action: "cycle_assets", url_id: cycle.url_id }) as { assets: CycleAsset[] };
      setDesigns(r.assets);
      setDesignId((cur) => cur || r.assets[0]?.design_id || "");
    } catch (e) { setLoadErr((e as Error).message); }
  }, [orgId, cycle.url_id]);

  useEffect(() => { void loadDesigns(); }, [loadDesigns]);

  async function loadBrief() {
    setBriefLoading(true); setBriefErr(null);
    try {
      const r = await callP4(orgId, { action: "brief", url_id: cycle.url_id }) as { brief: typeof brief };
      setBrief(r.brief);
    } catch (e) { setBriefErr((e as Error).message); }
    finally { setBriefLoading(false); }
  }

  const current = designs?.find((d) => d.design_id === designId) ?? null;

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

      {loadErr && <div className="text-xs text-red-600">{loadErr}</div>}

      {designs && designs.length === 0 ? (
        <div className="text-[11px] text-neutral-500">
          No designs yet — generate the waterfall below first (P4.3.1), then the four copy sets exist to write into.
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 text-[11px] flex-wrap">
            <span className="text-neutral-500">Copy for design:</span>
            <select value={designId} onChange={(e) => setDesignId(e.target.value)}
              className="rounded border border-neutral-300 px-2 py-1 text-xs bg-white">
              {(designs ?? []).map((d) => (
                <option key={d.design_id} value={d.design_id}>
                  D{d.design_number}{d.intent ? ` · ${d.intent}` : ""}{d.title ? " · written" : " · empty"}
                </option>
              ))}
            </select>
            {current && (
              <span className="text-neutral-500">
                shared across its 4 crops · validator {current.validator_status ?? "—"} · QC {current.copy_qc ?? "—"}
              </span>
            )}
          </div>

          {/* Keyed on the design: switching design remounts the editor, so its
              state AND its draft start from that design's own row. Without the
              key the draft hook keeps the first design's baseline and starts
              reporting one design's text as "restored" under another. */}
          {current && (
            <CopyEditor
              key={current.design_id}
              orgId={orgId}
              design={current}
              primaryKw={primaryKw}
              onSaved={loadDesigns}
            />
          )}
        </>
      )}
    </div>
  );
}

/**
 * The two boxes, for one design.
 *
 * Copy cannot be half-saved: the database refuses a description outside
 * 250-300 characters, so unlike the phase-2 forms there is no "save what is
 * filled in" here. That makes the draft the only thing between a long
 * description and a closed tab, and it makes the Save button's job to EXPLAIN
 * rather than to sit there greyed out — which is how it was reported: "the
 * save button does not work". It was disabled, on empty boxes, saying nothing.
 */
function CopyEditor({
  orgId, design, primaryKw, onSaved,
}: {
  orgId: string;
  design: CycleAsset;
  primaryKw: string;
  onSaved: () => Promise<void>;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [title, setTitle] = useState(design.title ?? "");
  const [description, setDescription] = useState(design.description ?? "");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const validation = useMemo(() => validateCopy(title, description, primaryKw), [title, description, primaryKw]);

  const draft = useFormDraft(
    orgId,
    `P4.2.8:${design.design_id}`,
    { title, description },
    (d: Partial<{ title: string; description: string }>) => {
      if (typeof d.title === "string") setTitle(d.title);
      if (typeof d.description === "string") setDescription(d.description);
    },
  );

  async function save() {
    // The button is never disabled on validation. A greyed-out Save with
    // nothing saying why is the same dead end phases 2 and 3 already had, and
    // it reads as a broken button rather than as unfinished copy.
    if (!validation.overall.ok) {
      const bits = [
        ...validation.title.errors.map((e) => `title: ${e}`),
        ...validation.desc.errors.map((e) => `description: ${e}`),
      ];
      setSaved(null);
      setSaveErr(
        `Not saved — ${bits.join(" · ")}. The description has to land between 250 and 300 characters and ` +
        `the title has to open with "${primaryKw}". The database enforces both, so there is no half-finished ` +
        `version to keep — what is typed stays here as a draft in the meantime.`
      );
      return;
    }
    setSaving(true); setSaveErr(null); setSaved(null);
    try {
      await callP4(orgId, { action: "save_copy", design_id: design.design_id, title, description });
      await draft.clear();
      await onSaved();
      setSaved(`Saved to D${design.design_number} — copy QC is back to PENDING, which is where it belongs after a change.`);
      startTransition(() => router.refresh());
    } catch (e) { setSaveErr((e as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <>
      <div className="text-[11px] text-neutral-500">
        Primary keyword for validator: <span className="font-mono">{primaryKw || "— assign keyword first —"}</span>
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

      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" onClick={save} disabled={saving}
          className="px-3 py-1 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 disabled:opacity-50">
          {saving ? "Saving…" : `Save copy for D${design.design_number}`}
        </button>
        <span className={`text-[11px] rounded px-2 py-1 ${validation.overall.ok
          ? "bg-muted text-foreground border border-border"
          : "bg-red-50 text-red-700 border border-red-200"}`}>
          {validation.overall.ok ? "✓ All validators pass" : "Validators block this copy"}
        </span>
        {draft.restoredAt && (
          <span className="text-[11px] text-amber-700">Restored what was typed here earlier — not saved yet.</span>
        )}
        {saveErr && <span className="text-xs text-red-600 break-words">{saveErr}</span>}
        {saved && <span className="text-xs text-emerald-700">{saved}</span>}
      </div>
    </>
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
  const [proposing, setProposing] = useState(false);
  const [proposal, setProposal] = useState<{
    start_date: string; requested: string; shifted_days: number; cap: number;
    spacing_days: number; blocked_dates: string[]; fits: boolean;
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [queueing, setQueueing] = useState(false);
  const [queued, setQueued] = useState<{
    scheduled: number; blocked: Array<{ sequence: number; reason: string }>;
    warnings: string[]; first_date: string | null; last_date: string | null;
  } | null>(null);
  const [result, setResult] = useState<{ waterfall_id: string; matrix: string[][]; pin_schedule: Array<{ seq: number; design: number; copy: string; board_index: number; date: string }>; interval_days_between_same_design: number; spacing_hours: number; carried?: { images: number; copy_sets: number }; superseded?: { waterfall_id: string; status: string; pins_cancelled: number; designs_discarded: number; designs_with_image: number; copy_sets_written: number } } | null>(null);

  // Whether sixteen pins fit from a given day is decided by two database
  // triggers — the daily cap and the same-URL spacing — and at 48h spacing a
  // running waterfall occupies every other day for a month, so whether the
  // second cycle of the month fits comes down to the parity of the date
  // somebody picked. Better computed than discovered halfway through an
  // insert.
  async function propose() {
    setErr(null); setProposing(true);
    try {
      const r = await callP4(orgId, {
        action: "propose_start", url_id: cycle.url_id, from: startDate,
      }) as unknown as NonNullable<typeof proposal>;
      setProposal(r);
      if (r.fits) setStartDate(r.start_date);
    } catch (e) { setErr((e as Error).message); }
    finally { setProposing(false); }
  }

  // The step that locks the plan in. Without it the panel could only ever
  // regenerate: sixteen pins sat at PLANNED, the cron ignores those, and the
  // next visit offered the same button again. Queueing moves them to
  // SCHEDULED, puts the waterfall on RUNNING and closes P4.3.2 — after which
  // /api/cron/organic-post-pins publishes each pin on its own date.
  async function queue() {
    if (!cycle.waterfall) return;
    if (!window.confirm(
      `This queues the sixteen pins for publishing.\n\n` +
      `Each one goes out on its own date — the first on ${cycle.waterfall.start_date} — ` +
      `and the plan stops being editable. Regenerating after this cancels real scheduled pins.\n\nQueue them?`
    )) return;
    setErr(null); setQueueing(true); setQueued(null);
    try {
      const r = await callP4(orgId, { action: "push", waterfall_id: cycle.waterfall.id }) as
        NonNullable<typeof queued>;
      setQueued(r);
      startTransition(() => router.refresh());
    } catch (e) { setErr((e as Error).message); }
    finally { setQueueing(false); }
  }

  async function generate() {
    // Regenerating replaces the plan that is there — say so before it does.
    // The old one is abandoned rather than deleted, but its designs and copy
    // leave the cycle, and that is worth a sentence when somebody has already
    // made images.
    if (cycle.waterfall && !window.confirm(
      `This replaces the existing waterfall (${cycle.waterfall.id.slice(0, 8)}, ${cycle.waterfall.status}).\n\n` +
      `New dates, new board rotation, sixteen new pins. Your uploaded design images and your written ` +
      `copy come across — you do not have to upload or write them again — but the micro-crops are cut ` +
      `from the new pins, so run P4.2.5 once more afterwards.\n\n` +
      `Nothing is deleted: the old waterfall stays readable as ABANDONED.\n\nRegenerate?`
    )) return;
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
        <button type="button" onClick={propose} disabled={proposing || generating}
          className="px-3 py-1 rounded-md border border-neutral-300 text-xs font-medium hover:bg-neutral-50 disabled:opacity-50">
          {proposing ? "Checking…" : "Find a date that fits"}
        </button>
        <button type="button" onClick={generate} disabled={generating || queueing}
          className="px-3 py-1 rounded-md bg-neutral-900 text-white text-xs font-semibold hover:bg-neutral-800 disabled:opacity-50">
          {generating ? "Generating…" : cycle.waterfall ? "Regenerate 16-pin waterfall" : "Generate 16-pin waterfall"}
        </button>
        {/* Offered while ANY pin is still unqueued, not only while the
            waterfall is PLANNING. Queueing is partial by design — a pin whose
            board does not exist on Pinterest yet is held back with a reason,
            and once that board is created the rest has to be queueable
            without regenerating the plan. Gating on the waterfall's status
            would have hidden the button at exactly that moment. */}
        {cycle.waterfall && (
          <button type="button" onClick={queue} disabled={queueing || generating}
            className="px-3 py-1 rounded-md bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50">
            {queueing
              ? "Queueing…"
              : cycle.waterfall.status === "PLANNING"
                ? "Save & queue these 16 pins"
                : "Queue whatever is still waiting"}
          </button>
        )}
        {cycle.waterfall && cycle.waterfall.status === "RUNNING" && (
          <span className="text-[11px] text-emerald-700">
            Running — the cron publishes each queued pin on its date.
          </span>
        )}
        {err && <span className="text-red-600 break-words">{err}</span>}
      </div>

      {queued && (
        <div className={`text-[11px] rounded border px-2 py-1.5 ${queued.blocked.length > 0
          ? "border-amber-300 bg-amber-50 text-amber-800"
          : "border-emerald-300 bg-emerald-50 text-emerald-800"}`}>
          {queued.scheduled} pin{queued.scheduled === 1 ? "" : "s"} queued
          {queued.first_date && <> · {queued.first_date} → {queued.last_date}</>}
          {queued.blocked.length > 0 && (
            <div className="mt-1">
              Not queued: {queued.blocked.map((b) => `#${b.sequence} ${b.reason}`).join(" · ")}
            </div>
          )}
          {queued.warnings.length > 0 && (
            <div className="mt-1 opacity-80">{queued.warnings.join(" · ")}</div>
          )}
        </div>
      )}

      {proposal && (
        <div className={`text-[11px] ${proposal.fits ? "text-neutral-600" : "text-red-600"}`}>
          {!proposal.fits ? (
            <>
              Nothing in the next four months fits sixteen pins at {proposal.cap}/day with{" "}
              {proposal.spacing_days}-day spacing. Raise the daily target, or finish a running
              waterfall first.
            </>
          ) : proposal.shifted_days === 0 ? (
            <>
              {proposal.requested} fits: sixteen pins, one every {proposal.spacing_days}{" "}
              day{proposal.spacing_days === 1 ? "" : "s"}, inside {proposal.cap}/day.
            </>
          ) : (
            <>
              Moved to <span className="font-medium">{proposal.start_date}</span> — {proposal.shifted_days}{" "}
              day{proposal.shifted_days === 1 ? "" : "s"} later. From {proposal.requested} the run would land on{" "}
              {proposal.blocked_dates.length} day{proposal.blocked_dates.length === 1 ? "" : "s"} that are already
              full{proposal.blocked_dates.length > 0 && <> ({proposal.blocked_dates.slice(0, 3).join(", ")}
              {proposal.blocked_dates.length > 3 ? ", …" : ""})</>}.
            </>
          )}
        </div>
      )}

      {result && (
        <div className="space-y-3">
          <div className="text-[11px] text-neutral-600">
            {result.pin_schedule.length} pins committed · same-design interval {result.interval_days_between_same_design} days · spacing {result.spacing_hours}h
          </div>

          {result.superseded && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
              Replaced waterfall <span className="font-mono">{result.superseded.waterfall_id.slice(0, 8)}</span>{" "}
              ({result.superseded.status} → ABANDONED): {result.superseded.pins_cancelled} pin
              {result.superseded.pins_cancelled === 1 ? "" : "s"} cancelled,{" "}
              {result.superseded.designs_discarded} design
              {result.superseded.designs_discarded === 1 ? "" : "s"} left the cycle. Nothing was deleted.
              {result.carried && (result.carried.images > 0 || result.carried.copy_sets > 0) && (
                <div className="mt-1 text-emerald-800">
                  Carried across:{" "}
                  {result.carried.images > 0 && `${result.carried.images} design image${result.carried.images === 1 ? "" : "s"}`}
                  {result.carried.images > 0 && result.carried.copy_sets > 0 && " and "}
                  {result.carried.copy_sets > 0 && `${result.carried.copy_sets} copy set${result.carried.copy_sets === 1 ? "" : "s"}`}
                  {" "}— nothing to upload or write again. The micro-crops are cut from the new pins, so run P4.2.5 once more.
                </div>
              )}
            </div>
          )}

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
                  cycle={cycle}
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
/**
 * Launch readiness — which of the nine things a live cycle needs are there.
 *
 * Clarissa's suggestion, 12-09-2026, after finding "P4.2.10 · DONE" sitting
 * above four copy sets that were all still PENDING. The task status was a
 * one-way latch (fixed in phase4.ts); this is the other half, and the half
 * that would have made it obvious without anyone having to open the QC
 * panel and count.
 *
 * It blocks nothing. Queueing already refuses a rejected design or copy;
 * PENDING only warns, because the manager may decide their own review was
 * enough. What was missing was the sentence, not a lock.
 */
function ReadinessPanel({ readiness }: { readiness: CycleView["readiness"] }) {
  const short = readiness.checks.filter((c) => !c.ok);
  const allGood = short.length === 0;
  return (
    <div className={cn(
      "rounded-lg ring-1 ring-inset px-3.5 py-3",
      allGood ? "ring-emerald-600/25 bg-emerald-600/[0.05]" : "ring-amber-600/30 bg-amber-500/[0.06]"
    )}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {allGood
          ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
          : <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0" />}
        <span className={cn("o-eyebrow", allGood ? "text-emerald-700" : "text-amber-700")}>
          Launch readiness: {readiness.passed}/{readiness.total} checks passed
        </span>
        {!allGood && (
          <span className="text-[11px] text-muted-foreground">
            — missing: {short.map((c) => `${c.label} ${c.detail}`).join(", ")}
          </span>
        )}
      </div>
      <ul className="mt-2.5 grid gap-x-5 gap-y-1 sm:grid-cols-2">
        {readiness.checks.map((c) => (
          <li key={c.label} className="flex items-baseline gap-2 text-xs">
            <span className={cn("shrink-0 font-semibold", c.ok ? "text-emerald-700" : "text-amber-700")}>
              {c.ok ? "✓" : "•"}
            </span>
            <span className={cn("flex-1", c.ok ? "text-muted-foreground" : "text-foreground font-medium")}>
              {c.label}
            </span>
            <span className="tabular-nums text-muted-foreground">{c.detail}</span>
            {!c.ok && c.task && (
              <span className="font-mono text-[10px] text-muted-foreground">{c.task}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

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
