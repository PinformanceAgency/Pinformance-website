"use client";

import { useMemo, useState } from "react";
import { useKeyedRows } from "./useKeyedRows";
import { useFormDraft, type FormDraft } from "./useFormDraft";
import { DraftHint, DraftBanner } from "./DraftBanner";
import type { TaskRow } from "@/lib/organic/types";

export interface Phase3Snapshot {
  keywords: Array<{ term: string; type: string; source: string; seasonal_type: string | null; autocomplete_rank: number | null; generic_applies_to_all: boolean | null; client_forbidden: boolean; volume_validated: boolean }>;
  cache_status: Array<{ term: string; volume: number | null; taxonomy_path: string | null; expires_at: string | null; not_found: boolean | null; looked_up_at: string | null }>;
  clusters: Array<{ id: string; name: string; axis: string }>;
  topics: Array<{ id: string; name: string }>;
  boards: Array<{ id: string; name: string; topic_id: string | null; primary_keyword: string | null; breadth: string; status: string; pin_count: number; planned_creation_date: string | null; pinterest_board_id: string | null; description: string | null }>;
  coverage: Array<{ topic_name: string; active_boards: string; is_covered: boolean }>;
  profile: { display_name: string | null; bio: string | null } | null;
  queue: Array<{ term: string; priority: number; status: string }>;
}

interface Props {
  orgId: string;
  task: TaskRow;
  snapshot: Phase3Snapshot;
  onDone: () => void;
}

export function Phase3FormFor(p: Props): React.ReactNode {
  switch (p.task.task_id) {
    case "P3.1.1": return <SearchBarForm {...p} />;
    case "P3.1.2": return <BubblesForm {...p} />;
    case "P3.1.3": return <InterestPicksForm {...p} />;
    case "P3.1.4": return <ActionForm {...p} action="competitor_annotations" title="Mine competitor annotations" desc="Scans imported PinInspector CSV descriptions for 2–4 word phrases seen at least twice." />;
    case "P3.1.5": return <CloakedForm {...p} />;
    case "P3.1.6": return <ActionForm {...p} action="dedupe" title="Dedupe candidate pool against shared cache" desc="Volume is a property of the term, not the client. Anything already cached does not need looking up again." />;
    case "P3.1.7": return <ActionForm {...p} action="work_list" title="Generate PinClicks work list" desc="Cache misses only, prioritised by autocomplete rank." />;
    case "P3.1.8": return <PinClicksForm {...p} />;
    case "P3.1.9": return <ParentInterestsForm {...p} />;
    case "P3.1.10": return <GenericTestForm {...p} />;
    case "P3.1.11": return <ClustersForm {...p} />;
    case "P3.1.12": return <SeasonalForm {...p} />;
    case "P3.1.13": return <ActionForm {...p} action="windows" title="Compute publishing windows" desc="Peak minus 8 weeks. Runs over every SEASONAL keyword and fills ramp_up_start." />;
    case "P3.1.14": return <AlignmentForm {...p} />;
    case "P3.2.1": return <DisplayNameForm {...p} />;
    case "P3.2.2": return <BioForm {...p} />;
    case "P3.3.1": return <BoardListForm {...p} />;
    case "P3.3.2": return <ActionForm {...p} action="coverage" title="Check topic coverage" desc="Every topic needs ≥5 active (SECRET or PUBLIC) boards. Failure blocks P4.1.1 via the topic_coverage view." />;
    case "P3.3.3": return <DescriptionsForm {...p} />;
    case "P3.3.4": return <ActionForm {...p} action="schedule" title="Generate creation schedule" desc="Max 3 boards per day, starting tomorrow." />;
    case "P3.3.5": return <CreateBoardsForm {...p} />;
    case "P3.3.6": return <ActionForm {...p} action="select_seeds" title="Mark seed pins selected" desc="10–15 existing pins per board (never competitor content)." />;
    case "P3.3.7": return <ActionForm {...p} action="run_seeding" title="Run seeding" desc="Queues seeding through the existing pin scheduler." />;
    case "P3.3.8": return <ActionForm {...p} action="flip_public" title="Flip boards to public @ ≥10 pins" desc="Idempotent — safe to run repeatedly." />;
    default: return null;
  }
}

// --- shared ------------------------------------------------------------------

function FormShell({
  title, body, time, setTime, submitLabel, onSubmit, draft,
}: {
  title: string;
  body: React.ReactNode;
  /** Kept in the signature so the call sites still compile; the field is
   *  gone. Time on task was mandatory to submit, told nobody anything they
   *  acted on, and stood between a person and recording their work — the same
   *  reason phase 1 dropped it. Decided 06-09-2026. */
  time?: string;
  setTime?: (v: string) => void;
  submitLabel: string;
  /** A returned string is shown as the result of the save, so a partial save
   *  can say what landed and what is still open. */
  onSubmit: () => Promise<void | string>;
  draft?: FormDraft;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  async function go() {
    setErr(null); setOk(null); setSubmitting(true);
    try {
      const msg = await onSubmit();
      await draft?.clear();
      if (typeof msg === "string") setOk(msg);
    }
    catch (e) { setErr((e as Error).message); }
    finally { setSubmitting(false); }
  }
  return (
    <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="text-[11px] font-semibold text-neutral-600 uppercase tracking-wide">{title}</div>
        <span className="flex-1" />
        <DraftHint draft={draft} />
      </div>
      {draft?.restoredAt && <DraftBanner draft={draft} />}
      {(err || ok) && (
        <div className={`rounded border px-2 py-1.5 text-[11px] ${err
          ? "border-red-300 bg-red-50 text-red-700"
          : "border-emerald-300 bg-emerald-50 text-emerald-800"}`}>
          {err ?? ok}
        </div>
      )}
      {body}
      <div className="flex items-center gap-2 pt-1 border-t border-neutral-200">
        <span className="flex-1" />
        <button onClick={go} disabled={submitting}
          className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 disabled:opacity-50">
          {submitting ? "Saving…" : submitLabel}
        </button>
      </div>
    </div>
  );
}

async function post(orgId: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`/api/organic/phase3/${orgId}`, {
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

/** No longer collected. Returns 0, which every write path treats as "not
 *  recorded" and leaves the column alone. */
function n(_s: string): number {
  return 0;
}

function TextList({ v, on, rows = 5, placeholder }: { v: string; on: (v: string) => void; rows?: number; placeholder?: string }) {
  return (
    <textarea value={v} onChange={(e) => on(e.target.value)} rows={rows} placeholder={placeholder}
      className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-xs" />
  );
}

// --- individual forms -------------------------------------------------------

function SearchBarForm({ orgId, onDone }: Props) {
  const [seed, setSeed] = useState("");
  const [raw, setRaw] = useState("");
  const [time, setTime] = useState("");
  const list = raw.split("\n").map((s) => s.trim()).filter(Boolean);
  const draft = useFormDraft(orgId, "P3.1.1", { seed, raw, time }, (d) => {
    if (typeof d.seed === "string") setSeed(d.seed);
    if (typeof d.raw === "string") setRaw(d.raw);
    if (typeof d.time === "string") setTime(d.time);
  });

  return (
    <FormShell
      draft={draft}
      title="P3.1.1 — Search-bar suggestions (order = volume proxy)"
      body={
        <div className="space-y-2">
          <input value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="Seed keyword you typed"
            className="w-full rounded-md border border-neutral-300 px-2 py-1 text-xs" />
          <TextList v={raw} on={setRaw} rows={8} placeholder="One suggestion per line, TOP TO BOTTOM. Rank is captured automatically." />
          <div className="text-[11px] text-neutral-500">{list.length} suggestions parsed. Rank = line number.</div>
        </div>
      }
      time={time} setTime={setTime} submitLabel="Save"
      onSubmit={async () => {
        if (!seed.trim()) throw new Error("Enter the seed keyword.");
        if (list.length === 0) throw new Error("Add at least one suggestion.");
        await post(orgId, { action: "search_bar", seed: seed.trim(), suggestions: list, time_spent_min: n(time) });
        onDone();
      }}
    />
  );
}

function BubblesForm({ orgId, onDone }: Props) {
  const [raw, setRaw] = useState("");
  const [time, setTime] = useState("");
  const list = raw.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
  const draft = useFormDraft(orgId, "P3.1.2", { raw, time }, (d) => {
    if (typeof d.raw === "string") setRaw(d.raw);
    if (typeof d.time === "string") setTime(d.time);
  });

  return (
    <FormShell
      draft={draft}
      title="P3.1.2 — Bubbles + related searches"
      body={
        <>
          <TextList v={raw} on={setRaw} rows={4} placeholder="Comma-separated or one per line" />
          <div className="text-[11px] text-neutral-500">{list.length} bubbles parsed.</div>
        </>
      }
      time={time} setTime={setTime} submitLabel="Save"
      onSubmit={async () => { if (list.length === 0) throw new Error("Add at least one term."); await post(orgId, { action: "bubbles", terms: list, time_spent_min: n(time) }); onDone(); }}
    />
  );
}

function InterestPicksForm({ orgId, onDone }: Props) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Array<{ interest_id: string; name: string; crumb: string }>>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [time, setTime] = useState("");
  const [searching, setSearching] = useState(false);
  async function search() {
    if (!q.trim()) return;
    setSearching(true);
    try {
      const r = await post(orgId, { action: "interest_search", query: q.trim() });
      setResults((r.results as Array<{ interest_id: string; name: string; crumb: string }>) ?? []);
    } finally { setSearching(false); }
  }
  const draft = useFormDraft(orgId, "P3.1.3", { picked: Array.from(picked), time }, (d) => {
    if (Array.isArray(d.picked)) setPicked(new Set(d.picked as string[]));
    if (typeof d.time === "string") setTime(d.time);
  });

  return (
    <FormShell
      draft={draft}
      title="P3.1.3 — Pick from Pinterest interest taxonomy (3,437 terms)"
      body={
        <div className="space-y-2">
          <div className="flex gap-1">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search taxonomy…"
              onKeyDown={(e) => e.key === "Enter" && search()}
              className="flex-1 rounded-md border border-neutral-300 px-2 py-1 text-xs" />
            <button type="button" onClick={search} disabled={searching}
              className="px-2 py-1 rounded-md border border-neutral-300 text-xs bg-white hover:bg-neutral-50 disabled:opacity-50">
              {searching ? "…" : "Search"}
            </button>
          </div>
          <div className="max-h-56 overflow-y-auto rounded border border-border bg-card divide-y divide-neutral-100">
            {results.map((r) => (
              <label key={r.interest_id} className="flex items-center gap-2 px-2 py-1 text-xs cursor-pointer hover:bg-neutral-50">
                <input type="checkbox" checked={picked.has(r.name)}
                  onChange={(e) => { const nx = new Set(picked); e.target.checked ? nx.add(r.name) : nx.delete(r.name); setPicked(nx); }} />
                <span className="font-medium">{r.name}</span>
                <span className="text-neutral-400 text-[11px] truncate">{r.crumb}</span>
              </label>
            ))}
            {results.length === 0 && <div className="px-2 py-2 text-[11px] text-neutral-400">Search to find interests.</div>}
          </div>
          <div className="text-[11px] text-neutral-500">{picked.size} picked.</div>
        </div>
      }
      time={time} setTime={setTime} submitLabel="Add picks to candidate pool"
      onSubmit={async () => { if (picked.size === 0) throw new Error("Pick at least one interest."); await post(orgId, { action: "interest_picks", terms: Array.from(picked), time_spent_min: n(time) }); onDone(); }}
    />
  );
}

function CloakedForm({ orgId, onDone }: Props) {
  const [cloaked, setCloaked] = useState(false);
  const [notes, setNotes] = useState("");
  const [time, setTime] = useState("");
  const draft = useFormDraft(orgId, "P3.1.5", { cloaked, notes, time }, (d) => {
    if (typeof d.cloaked === "boolean") setCloaked(d.cloaked);
    if (typeof d.notes === "string") setNotes(d.notes);
    if (typeof d.time === "string") setTime(d.time);
  });

  return (
    <FormShell
      draft={draft}
      title="P3.1.5 — Cloaked niche?"
      body={
        <div className="space-y-2 text-xs">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={cloaked} onChange={(e) => setCloaked(e.target.checked)} />
            <span>This niche is cloaked — Pinterest hides autocomplete for it.</span>
          </label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional note (e.g. workaround plan)"
            className="w-full rounded-md border border-neutral-300 px-2 py-1 text-xs" />
        </div>
      }
      time={time} setTime={setTime} submitLabel="Save"
      onSubmit={async () => { await post(orgId, { action: "cloaked", cloaked, notes, time_spent_min: n(time) }); onDone(); }}
    />
  );
}

function ActionForm({ orgId, task, onDone, action, title, desc }: Props & { action: string; title: string; desc: string }) {
  const [time, setTime] = useState("");
  return (
    <FormShell
      title={`${task.task_id} — ${title}`}
      body={<div className="text-xs text-neutral-600">{desc}</div>}
      time={time} setTime={setTime} submitLabel="Run & mark done"
      onSubmit={async () => { await post(orgId, { action, time_spent_min: n(time) }); onDone(); }}
    />
  );
}

function PinClicksForm({ orgId, snapshot, onDone }: Props) {
  // Queue: cache misses for this org.
  const queued = snapshot.queue.filter((q) => q.status === "QUEUED");
  const [values, setValues] = useKeyedRows<{ volume: string; not_found: boolean }>(
    queued.map((q) => q.term),
    () => ({ volume: "", not_found: false }),
  );
  const [extra, setExtra] = useState("");
  const [time, setTime] = useState("");
  const draft = useFormDraft(orgId, "P3.1.8", { values, extra, time }, (d) => {
    if (d.values) setValues((cur) => ({ ...cur, ...(d.values as Record<string, { volume: string; not_found: boolean }>) }));
    if (typeof d.extra === "string") setExtra(d.extra);
    if (typeof d.time === "string") setTime(d.time);
  });
  if (queued.length === 0) {
    return <div className="rounded-md border border-border bg-muted px-3 py-2 text-xs text-foreground">No queue items. Run P3.1.7 first.</div>;
  }

  return (
    <FormShell
      draft={draft}
      title={`P3.1.8 — PinClicks session (${queued.length} lookups)`}
      body={
        <div className="space-y-2">
          <div className="max-h-72 overflow-y-auto rounded border border-border bg-card divide-y divide-neutral-100">
            {queued.map((q) => {
              const v = values[q.term] ?? { volume: "", not_found: false };
              return (
                <div key={q.term} className="grid grid-cols-12 gap-1 items-center px-2 py-1 text-[11px]">
                  <span className="col-span-6 truncate text-neutral-700">{q.term}</span>
                  <input type="number" value={v.volume} onChange={(e) => setValues({ ...values, [q.term]: { ...v, volume: e.target.value } })}
                    disabled={v.not_found} placeholder="volume"
                    className="col-span-3 rounded border border-neutral-300 px-2 py-1 text-xs tabular-nums disabled:opacity-50" />
                  <label className="col-span-3 flex items-center gap-1">
                    <input type="checkbox" checked={v.not_found} onChange={(e) => setValues({ ...values, [q.term]: { ...v, not_found: e.target.checked } })} />
                    <span>not found</span>
                  </label>
                </div>
              );
            })}
          </div>
          <div>
            <div className="text-[11px] text-neutral-600 mb-1">Related keywords found along the way (added to pool)</div>
            <TextList v={extra} on={setExtra} rows={2} placeholder="Comma-separated or one per line" />
          </div>
        </div>
      }
      time={time} setTime={setTime} submitLabel="Write to shared cache"
      onSubmit={async () => {
        const results = Object.entries(values).map(([term, v]) => ({ term, volume: v.volume ? Number(v.volume) : null, not_found: v.not_found }));
        const extra_finds = extra.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
        await post(orgId, { action: "pinclicks_submit", results, extra_finds, time_spent_min: n(time) });
        onDone();
      }}
    />
  );
}

function ParentInterestsForm({ orgId, onDone }: Props) {
  const [raw, setRaw] = useState("");
  const [time, setTime] = useState("");
  const list = raw.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
  const draft = useFormDraft(orgId, "P3.1.9", { raw, time }, (d) => {
    if (typeof d.raw === "string") setRaw(d.raw);
    if (typeof d.time === "string") setTime(d.time);
  });

  return (
    <FormShell
      draft={draft}
      title="P3.1.9 — Parent interests (≥5)"
      body={<>
        <TextList v={raw} on={setRaw} rows={4} placeholder="Home Decor, Living Room, Vanity Lighting, Small Bedroom, Interior Design" />
        <div className="text-[11px] text-neutral-500">{list.length} parsed · these become topics for coverage.</div>
      </>}
      time={time} setTime={setTime} submitLabel="Save (≥5 required)"
      onSubmit={async () => { if (list.length < 5) throw new Error("At least 5 parent interests required."); await post(orgId, { action: "parent_interests", terms: list, time_spent_min: n(time) }); onDone(); }}
    />
  );
}

function GenericTestForm({ orgId, snapshot, onDone }: Props) {
  // Present all keywords (non-parent, non-cluster) as candidates.
  const candidates = snapshot.keywords.filter((k) => k.type === "GENERIC").map((k) => k.term);
  const [pass, setPass] = useState<Set<string>>(new Set(snapshot.keywords.filter((k) => k.generic_applies_to_all).map((k) => k.term)));
  const [time, setTime] = useState("");
  const toggle = (t: string) => { const nx = new Set(pass); nx.has(t) ? nx.delete(t) : nx.add(t); setPass(nx); };
  const draft = useFormDraft(orgId, "P3.1.10", { pass: Array.from(pass), time }, (d) => {
    if (Array.isArray(d.pass)) setPass(new Set(d.pass as string[]));
    if (typeof d.time === "string") setTime(d.time);
  });

  return (
    <FormShell
      draft={draft}
      title={`P3.1.10 — Applies to every product? (5–10 pass)`}
      body={
        <div className="space-y-1">
          <div className="max-h-64 overflow-y-auto rounded border border-border bg-card divide-y divide-neutral-100">
            {candidates.map((t) => (
              <label key={t} className="flex items-center gap-2 px-2 py-1 text-xs cursor-pointer hover:bg-neutral-50">
                <input type="checkbox" checked={pass.has(t)} onChange={() => toggle(t)} />
                <span>{t}</span>
              </label>
            ))}
            {candidates.length === 0 && <div className="p-2 text-[11px] text-neutral-400">No generic candidates yet.</div>}
          </div>
          <div className="text-[11px] text-neutral-500">{pass.size} pass (need 5–10).</div>
        </div>
      }
      time={time} setTime={setTime} submitLabel="Save (5–10 required)"
      onSubmit={async () => {
        const decisions = candidates.map((t) => ({ term: t, applies_to_all: pass.has(t) }));
        await post(orgId, { action: "generic_test", decisions, time_spent_min: n(time) });
        onDone();
      }}
    />
  );
}

function ClustersForm({ orgId, onDone }: Props) {
  type Cl = { name: string; axis: string; keywords: string };
  const [rows, setRows] = useState<Cl[]>(Array.from({ length: 3 }, () => ({ name: "", axis: "MOMENT", keywords: "" })));
  const [time, setTime] = useState("");
  const set = (i: number, patch: Partial<Cl>) => setRows(rows.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  const draft = useFormDraft(orgId, "P3.1.11", { rows, time }, (d) => {
    if (Array.isArray(d.rows)) setRows(d.rows as Cl[]);
    if (typeof d.time === "string") setTime(d.time);
  });

  return (
    <FormShell
      draft={draft}
      title="P3.1.11 — Topic clusters (≥3, each 10–15 keywords)"
      body={
        <div className="space-y-2">
          {rows.map((r, i) => {
            const kws = r.keywords.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
            const bad = kws.length !== 0 && (kws.length < 10 || kws.length > 15);
            return (
              <div key={i} className="rounded border border-border bg-card p-2 space-y-1">
                <div className="flex gap-1">
                  <input value={r.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="Cluster name"
                    className="flex-1 rounded border border-neutral-300 px-2 py-1 text-xs" />
                  <select value={r.axis} onChange={(e) => set(i, { axis: e.target.value })}
                    className="rounded border border-neutral-300 px-1 py-1 text-xs bg-white">
                    {["PRODUCT","MOMENT","COLOR","SIZE","MATERIAL","SEASON","OTHER"].map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                  <button type="button" onClick={() => setRows(rows.filter((_, idx) => idx !== i))}
                    className="rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100">×</button>
                </div>
                <TextList v={r.keywords} on={(v) => set(i, { keywords: v })} rows={3} placeholder="10–15 keywords (comma-separated or per line)" />
                <div className={`text-[10px] tabular-nums ${bad ? "text-red-600" : "text-neutral-500"}`}>{kws.length} keywords{bad ? " — need 10–15" : ""}</div>
              </div>
            );
          })}
          <button type="button" onClick={() => setRows([...rows, { name: "", axis: "MOMENT", keywords: "" }])}
            className="text-[11px] text-primary hover:text-primary font-medium">+ Add cluster</button>
        </div>
      }
      time={time} setTime={setTime} submitLabel="Save clusters"
      onSubmit={async () => {
        const clusters = rows.filter((r) => r.name.trim()).map((r) => ({
          name: r.name.trim(),
          axis: r.axis as "PRODUCT"|"MOMENT"|"COLOR"|"SIZE"|"MATERIAL"|"SEASON"|"OTHER",
          keywords: r.keywords.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean),
        }));
        await post(orgId, { action: "clusters", clusters, time_spent_min: n(time) });
        onDone();
      }}
    />
  );
}

function SeasonalForm({ orgId, snapshot, onDone }: Props) {
  const terms = snapshot.keywords.map((k) => k.term);
  const seeded = useMemo(
    () => Object.fromEntries(snapshot.keywords.map((k) => [k.term, k.seasonal_type])),
    [snapshot.keywords],
  );
  const [pick, setPick] = useKeyedRows<{ type: string; start: string; end: string }>(
    terms,
    (t) => ({ type: seeded[t] ?? "", start: "", end: "" }),
  );
  const [time, setTime] = useState("");
  const set = (t: string, patch: Partial<{ type: string; start: string; end: string }>) => setPick({ ...pick, [t]: { ...pick[t], ...patch } });
  const classified = Object.values(pick).filter((v) => v.type).length;
  const draft = useFormDraft(orgId, "P3.1.12", { pick, time }, (d) => {
    if (d.pick) setPick((cur) => ({ ...cur, ...(d.pick as Record<string, { type: string; start: string; end: string }>) }));
    if (typeof d.time === "string") setTime(d.time);
  });

  return (
    <FormShell
      draft={draft}
      title={`P3.1.12 — Seasonal classification (${classified}/${terms.length} set)`}
      body={
        <div className="max-h-72 overflow-y-auto rounded border border-border bg-card divide-y divide-neutral-100 text-xs">
          {terms.map((t) => (
            <div key={t} className="grid grid-cols-12 gap-1 px-2 py-1 items-center">
              <span className="col-span-4 truncate text-neutral-700">{t}</span>
              <select value={pick[t]?.type ?? ""} onChange={(e) => set(t, { type: e.target.value })}
                className="col-span-3 rounded border border-neutral-300 px-1 py-0.5 bg-white">
                <option value="">—</option>
                {["EVERGREEN","SEASONAL","MICRO_TREND"].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <input type="date" value={pick[t]?.start ?? ""} onChange={(e) => set(t, { start: e.target.value })}
                disabled={pick[t]?.type !== "SEASONAL"}
                className="col-span-2 rounded border border-neutral-300 px-1 py-0.5 disabled:opacity-40" />
              <input type="date" value={pick[t]?.end ?? ""} onChange={(e) => set(t, { end: e.target.value })}
                disabled={pick[t]?.type !== "SEASONAL"}
                className="col-span-2 rounded border border-neutral-300 px-1 py-0.5 disabled:opacity-40" />
            </div>
          ))}
        </div>
      }
      time={time} setTime={setTime} submitLabel="Save seasonal classification"
      onSubmit={async () => {
        const list = Object.entries(pick).filter(([, v]) => v.type).map(([term, v]) => ({
          term, seasonal_type: v.type as "EVERGREEN"|"SEASONAL"|"MICRO_TREND",
          peak_start: v.start || null, peak_end: v.end || null,
        }));
        await post(orgId, { action: "seasonal", list, time_spent_min: n(time) });
        onDone();
      }}
    />
  );
}

function AlignmentForm({ orgId, onDone }: Props) {
  const [raw, setRaw] = useState("");
  const [notes, setNotes] = useState("");
  const [time, setTime] = useState("");
  const draft = useFormDraft(orgId, "P3.1.14", { raw, notes, time }, (d) => {
    if (typeof d.raw === "string") setRaw(d.raw);
    if (typeof d.notes === "string") setNotes(d.notes);
    if (typeof d.time === "string") setTime(d.time);
  });

  return (
    <FormShell
      draft={draft}
      title="P3.1.14 — Client alignment (forbidden terms)"
      body={<>
        <TextList v={raw} on={setRaw} rows={3} placeholder="Comma-separated or per line" />
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Note"
          className="w-full mt-1 rounded-md border border-neutral-300 px-2 py-1 text-xs" />
      </>}
      time={time} setTime={setTime} submitLabel="Save"
      onSubmit={async () => {
        const forbidden = raw.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
        await post(orgId, { action: "alignment", forbidden_terms: forbidden, notes, time_spent_min: n(time) });
        onDone();
      }}
    />
  );
}

function DisplayNameForm({ orgId, snapshot, onDone }: Props) {
  const [name, setName] = useState(snapshot.profile?.display_name ?? "");
  const [time, setTime] = useState("");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [genInfo, setGenInfo] = useState<{ attempts: number; failed_attempts: string[] } | null>(null);
  const [genLoading, setGenLoading] = useState(false);
  const [genErr, setGenErr] = useState<string | null>(null);

  async function propose() {
    setGenErr(null); setGenLoading(true);
    try {
      const brandName = prompt("Brand name?") || "";
      if (!brandName.trim()) return;
      const r = await post(orgId, { action: "draft_display_name", brand_name: brandName }) as { draft_id: string; text: string; attempts: number; failed_attempts: string[] };
      setName(r.text); setDraftId(r.draft_id); setGenInfo({ attempts: r.attempts, failed_attempts: r.failed_attempts });
    } catch (e) { setGenErr((e as Error).message); }
    finally { setGenLoading(false); }
  }

  const draft = useFormDraft(orgId, "P3.2.1", { name, time }, (d) => {
    if (typeof d.name === "string") setName(d.name);
    if (typeof d.time === "string") setTime(d.time);
  });

  return (
    <FormShell
      draft={draft}
      title={`P3.2.1 — Display name (${name.length}/65, must contain a volume-cached keyword)`}
      body={
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <button type="button" onClick={propose} disabled={genLoading}
              className="px-2 py-1 rounded border border-border bg-muted text-foreground text-[11px] font-medium hover:bg-muted disabled:opacity-50">
              {genLoading ? "Generating…" : "🤖 Generate proposal"}
            </button>
            {genInfo && <span className="text-[10px] text-neutral-500">AI: {genInfo.attempts} attempt(s), {genInfo.failed_attempts.length} rejected by validator</span>}
            {genErr && <span className="text-[11px] text-red-600 break-words">{genErr}</span>}
          </div>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={65}
            className="w-full rounded-md border border-neutral-300 px-2 py-1 text-sm" placeholder="Brand · broad keyword" />
        </div>
      }
      time={time} setTime={setTime} submitLabel={draftId ? "Approve & save" : "Save"}
      onSubmit={async () => {
        if (draftId) await post(orgId, { action: "approve_display_name", draft_id: draftId, approved_text: name, time_spent_min: n(time) });
        else await post(orgId, { action: "display_name", display_name: name, time_spent_min: n(time) });
        onDone();
      }}
    />
  );
}

function BioForm({ orgId, snapshot, onDone }: Props) {
  const [bio, setBio] = useState(snapshot.profile?.bio ?? "");
  const [time, setTime] = useState("");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [genInfo, setGenInfo] = useState<{ attempts: number } | null>(null);
  const [genLoading, setGenLoading] = useState(false);
  const [genErr, setGenErr] = useState<string | null>(null);

  async function propose() {
    setGenErr(null); setGenLoading(true);
    try {
      const brandName = prompt("Brand name?") || "";
      if (!brandName.trim()) return;
      const r = await post(orgId, { action: "draft_bio", brand_name: brandName }) as { draft_id: string; text: string; attempts: number };
      setBio(r.text); setDraftId(r.draft_id); setGenInfo({ attempts: r.attempts });
    } catch (e) { setGenErr((e as Error).message); }
    finally { setGenLoading(false); }
  }

  const draft = useFormDraft(orgId, "P3.2.2", { bio, time }, (d) => {
    if (typeof d.bio === "string") setBio(d.bio);
    if (typeof d.time === "string") setTime(d.time);
  });

  return (
    <FormShell
      draft={draft}
      title={`P3.2.2 — Bio (${bio.length}/500, ≥3 volume-cached keywords, CTA at end)`}
      body={
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <button type="button" onClick={propose} disabled={genLoading}
              className="px-2 py-1 rounded border border-border bg-muted text-foreground text-[11px] font-medium hover:bg-muted disabled:opacity-50">
              {genLoading ? "Generating…" : "🤖 Generate proposal"}
            </button>
            {genInfo && <span className="text-[10px] text-neutral-500">AI: {genInfo.attempts} attempt(s)</span>}
            {genErr && <span className="text-[11px] text-red-600 break-words">{genErr}</span>}
          </div>
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={500} rows={5}
            className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-xs" />
        </div>
      }
      time={time} setTime={setTime} submitLabel={draftId ? "Approve & save" : "Save"}
      onSubmit={async () => {
        if (draftId) await post(orgId, { action: "approve_bio", draft_id: draftId, approved_text: bio, time_spent_min: n(time) });
        else await post(orgId, { action: "bio", bio, time_spent_min: n(time) });
        onDone();
      }}
    />
  );
}

function BoardListForm({ orgId, snapshot, onDone }: Props) {
  type Row = { name: string; topic_name: string; primary_keyword: string; breadth: string };
  const seed = snapshot.boards.map((b) => ({
    name: b.name, topic_name: snapshot.topics.find((t) => t.id === b.topic_id)?.name ?? "",
    primary_keyword: b.primary_keyword ?? "", breadth: b.breadth,
  }));
  const [rows, setRows] = useState<Row[]>(seed.length > 0 ? seed : Array.from({ length: 20 }, () => ({ name: "", topic_name: "", primary_keyword: "", breadth: "BROAD" })));
  const [time, setTime] = useState("");
  const set = (i: number, patch: Partial<Row>) => setRows(rows.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  const draft = useFormDraft(orgId, "P3.3.1", { rows, time }, (d) => {
    if (Array.isArray(d.rows)) setRows(d.rows as Row[]);
    if (typeof d.time === "string") setTime(d.time);
  });

  return (
    <FormShell
      draft={draft}
      title={`P3.3.1 — Finalise board list (${rows.length}, must be 20–30)`}
      body={
        <div className="space-y-1 max-h-96 overflow-y-auto">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-12 gap-1 text-[11px] items-center">
              <input value={r.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="Board name"
                className="col-span-4 rounded border border-neutral-300 px-2 py-1" />
              <select value={r.topic_name} onChange={(e) => set(i, { topic_name: e.target.value })}
                className="col-span-3 rounded border border-neutral-300 px-1 py-1 bg-white">
                <option value="">— Topic —</option>
                {snapshot.topics.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
              </select>
              <input value={r.primary_keyword} onChange={(e) => set(i, { primary_keyword: e.target.value })} placeholder="Primary keyword"
                className="col-span-3 rounded border border-neutral-300 px-2 py-1" />
              <select value={r.breadth} onChange={(e) => set(i, { breadth: e.target.value })}
                className="col-span-1 rounded border border-neutral-300 px-1 py-1 bg-white">
                <option value="BROAD">B</option>
                <option value="NICHE">N</option>
              </select>
              <button type="button" onClick={() => setRows(rows.filter((_, idx) => idx !== i))}
                className="col-span-1 rounded border border-neutral-300 px-1 py-1 text-neutral-500 hover:bg-neutral-100">×</button>
            </div>
          ))}
          <button type="button" onClick={() => rows.length < 30 && setRows([...rows, { name: "", topic_name: "", primary_keyword: "", breadth: "BROAD" }])}
            className="mt-1 text-[11px] text-primary hover:text-primary font-medium disabled:opacity-40" disabled={rows.length >= 30}>
            + Add board ({rows.length}/30)
          </button>
        </div>
      }
      time={time} setTime={setTime} submitLabel="Save board list"
      onSubmit={async () => {
        const boards = rows.filter((r) => r.name.trim() && r.topic_name && r.primary_keyword.trim()).map((r) => ({
          name: r.name.trim(), topic_name: r.topic_name, primary_keyword: r.primary_keyword.trim(),
          keywords: [r.primary_keyword.trim()], breadth: r.breadth as "BROAD" | "NICHE",
        }));
        await post(orgId, { action: "board_list", boards, time_spent_min: n(time) });
        onDone();
      }}
    />
  );
}

/**
 * P3.3.3 — a description per board.
 *
 * Keyed on the board id, not built once from a snapshot array: P3.3.1
 * (finalise the board list) sits on this same step page and creates the very
 * boards this form is about, so its `router.refresh()` hands this form a
 * longer list while it is still mounted. Built at mount, the new boards
 * simply never appeared here and the title kept reporting the old count —
 * the quiet half of the bug that made the grid form crash (04-09-2026).
 */
function DescriptionsForm({ orgId, snapshot, onDone }: Props) {
  type Row = { description: string; draft_id: string | null; generating: boolean; err: string | null };
  const seeded = useMemo(
    () => Object.fromEntries(snapshot.boards.map((b) => [b.id, b.description ?? ""])),
    [snapshot.boards],
  );
  const [rows, setRows] = useKeyedRows<Row>(
    snapshot.boards.map((b) => b.id),
    (id) => ({ description: seeded[id] ?? "", draft_id: null, generating: false, err: null }),
  );
  const [time, setTime] = useState("");
  const draft = useFormDraft(orgId, "P3.3.3", { rows, time }, (d) => {
    if (d.rows) setRows((cur) => ({ ...cur, ...(d.rows as Record<string, Row>) }));
    if (typeof d.time === "string") setTime(d.time);
  });
  const set = (id: string, patch: Partial<Row>) =>
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  async function generateOne(id: string) {
    set(id, { generating: true, err: null });
    try {
      const r = await post(orgId, { action: "draft_board_description", board_id: id }) as { draft_id: string; text: string; attempts: number };
      set(id, { description: r.text, draft_id: r.draft_id, generating: false });
    } catch (e) { set(id, { err: (e as Error).message, generating: false }); }
  }

  async function generateAll() {
    for (const b of snapshot.boards) {
      if (!rows[b.id]?.draft_id) await generateOne(b.id);
    }
  }

  const filled = snapshot.boards.filter((b) => rows[b.id]?.description.trim()).length;
  return (
    <FormShell
      draft={draft}
      title={`P3.3.3 — Board descriptions (${filled}/${snapshot.boards.length} written; 400–480 chars, name in first sentence)`}
      body={
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <button type="button" onClick={generateAll}
              className="px-2 py-1 rounded border border-border bg-muted text-foreground text-[11px] font-medium hover:bg-muted">
              🤖 Generate all missing (batches through the boards)
            </button>
            <span className="text-[10px] text-neutral-500">Each proposal is regenerated up to 3× until it satisfies the validators.</span>
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {snapshot.boards.map((b) => {
              const r = rows[b.id];
              const len = r.description.length;
              const lenOk = len >= 400 && len <= 480;
              return (
                <div key={b.id} className="rounded border border-border bg-card p-2">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-[11px] font-medium text-neutral-800">{b.name}</div>
                    <button type="button" onClick={() => generateOne(b.id)} disabled={r.generating}
                      className="text-[10px] px-1.5 py-0.5 rounded border border-border text-foreground hover:bg-muted disabled:opacity-50">
                      {r.generating ? "…" : r.draft_id ? "↻ Regenerate" : "🤖 Generate"}
                    </button>
                  </div>
                  <textarea value={r.description} onChange={(e) => set(b.id, { description: e.target.value })} rows={3}
                    className="w-full rounded border border-neutral-300 px-2 py-1 text-[11px]" />
                  <div className={`text-[10px] tabular-nums ${lenOk ? "text-neutral-500" : "text-red-600"}`}>
                    {len}/480 · target 400–480 {r.draft_id && "· ✓ AI drafted"}
                  </div>
                  {r.err && <div className="text-[10px] text-red-600">{r.err}</div>}
                </div>
              );
            })}
          </div>
        </div>
      }
      time={time} setTime={setTime} submitLabel="Save descriptions (approves any AI drafts too)"
      onSubmit={async () => {
        // For rows with a draft_id, call approve_board_description; for others, the generic save.
        for (const b of snapshot.boards) {
          const r = rows[b.id];
          if (!r?.description.trim()) continue;
          if (r.draft_id) {
            await post(orgId, { action: "approve_board_description", draft_id: r.draft_id, board_name: b.name, approved_text: r.description });
          }
        }
        // Then also fire the generic save for anything missed.
        const rowsToSend = snapshot.boards
          .filter((b) => rows[b.id]?.description.trim())
          .map((b) => ({ name: b.name, description: rows[b.id].description }));
        if (rowsToSend.length > 0) await post(orgId, { action: "descriptions", rows: rowsToSend, time_spent_min: n(time) });
        onDone();
        const open = snapshot.boards.length - rowsToSend.length;
        return open === 0
          ? `Saved ${rowsToSend.length} description(s) — every board has one.`
          : `Saved ${rowsToSend.length} description(s); ${open} board(s) still without one.`;
      }}
    />
  );
}

function CreateBoardsForm({ orgId, task, onDone }: Props) {
  const [dryRun, setDryRun] = useState(true);
  const [time, setTime] = useState("");
  return (
    <FormShell
      title={`${task.task_id} — Create boards (max 3/day, enforced by DB trigger)`}
      body={
        <div className="text-xs text-neutral-600 space-y-2">
          <div>Creates today&#39;s eligible boards on Pinterest as SECRET, then updates the board row with the returned Pinterest ID.</div>
          <label className="flex items-center gap-2 text-[11px]">
            <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
            <span>Dry-run (flip locally only, no Pinterest API call)</span>
          </label>
        </div>
      }
      time={time} setTime={setTime} submitLabel="Create today's slot"
      onSubmit={async () => { await post(orgId, { action: "create_boards", dry_run: dryRun, time_spent_min: n(time) }); onDone(); }}
    />
  );
}
