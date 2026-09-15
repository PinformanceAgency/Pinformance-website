"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useKeyedRows } from "./useKeyedRows";
import { mergeDraftRows, useFormDraft, type FormDraft } from "./useFormDraft";
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
    case "P3.3.5": return <CreateBoardsPanel {...p} />;
    case "P3.3.6": return <SeedPlanPanel {...p} />;
    case "P3.3.7": return <SeedingStatusPanel {...p} />;
    case "P3.3.8": return <ActionForm {...p} action="flip_public" title="Make boards public at 10 pins" desc="Every board the method built that holds ten pins on Pinterest goes public — on Pinterest, not only here. Pins added by hand with the website widget count too. Safe to run repeatedly; the seeding cron does the same per board as it goes." />;
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
    if (d.values) setValues((cur) => mergeDraftRows(cur, d.values as Record<string, { volume: string; not_found: boolean }>));
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
    if (d.pick) setPick((cur) => mergeDraftRows(cur, d.pick as Record<string, { type: string; start: string; end: string }>));
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
    if (d.rows) setRows((cur) => mergeDraftRows(cur, d.rows as Record<string, Row>));
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

interface CreationRow {
  board_id: string; name: string; topic_name: string | null; description_chars: number;
  due: string | null; due_today: boolean; live_pins: number;
  clash: { id: string; privacy: string; pins: number } | null;
}
interface CreationPlan {
  today: string; pace: number; created_today: number; live_count: number;
  remaining: number; account_unreachable: string | null; rows: CreationRow[];
}

/**
 * P3.3.5 — the creation queue, checked against the account, before it runs.
 *
 * This was one button over a black box. You pressed "Create today's slot" and
 * found out afterwards, from a note, what had happened — and the note is the
 * last run's log, so The Longevity store kept showing *"1 failed: Vitamins —
 * you already have a board with this name"* long after that board had been
 * adopted. A stale log line in the place people look for current state reads
 * as a fault that will not go away.
 *
 * The queue is now visible before anything is created: which boards are due,
 * which ones the client already has under that name, how many pins are held
 * up by each, and whether the description the SOP asks for is there. Each row
 * can be linked to the existing board or taken out of the plan. Creating is
 * still one button, and it still cannot make a duplicate — the pre-flight
 * adopts an exact name match and a clash reported by Pinterest itself is
 * linked rather than counted as a failure.
 */
function CreateBoardsPanel({ orgId, onDone }: Props) {
  const [plan, setPlan] = useState<CreationPlan | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const r = await post(orgId, { action: "board_creation_plan" }) as { plan: CreationPlan };
      setPlan(r.plan);
    } catch (e) { setErr((e as Error).message); }
  }, [orgId]);

  useEffect(() => { void load(); }, [load]);

  async function act(key: string, body: Record<string, unknown>, done: (r: Record<string, unknown>) => string) {
    setBusy(key); setMsg(null);
    try {
      const r = await post(orgId, body);
      setMsg({ ok: true, text: done(r) });
      await load(); onDone();
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    finally { setBusy(null); }
  }

  const rows = plan?.rows ?? [];
  const dueNow = rows.filter((r) => r.due_today);
  const clashes = rows.filter((r) => r.clash);
  const undated = rows.filter((r) => !r.due);
  const roomToday = plan ? Math.max(0, plan.pace - plan.created_today) : 0;

  return (
    <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 space-y-3">
      <div className="text-[11px] font-semibold text-neutral-600 uppercase tracking-wide">
        P3.3.5 — Create boards
      </div>
      <div className="text-xs text-neutral-600">
        Three a night, enforced by the database — that pace is what keeps a young account out of trouble,
        so it is not a setting. Nothing here can create a board the client already has: an exact name match
        is linked instead, and a clash Pinterest reports is linked too.
      </div>

      {!plan && !err && <div className="text-xs text-neutral-500">Reading the queue and the account…</div>}
      {err && <div className="text-xs text-red-600">Could not read the queue: {err}</div>}

      {plan && (
        <>
          <div className="text-xs text-neutral-700">
            <strong>{plan.remaining}</strong> still to create · <strong>{plan.live_count}</strong> live on the account ·{" "}
            {plan.created_today} of {plan.pace} used today
            {plan.remaining === 0 && " · the architecture is live"}
          </div>

          {plan.account_unreachable && (
            <div className="text-xs rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-amber-800">
              Pinterest could not be read ({plan.account_unreachable}), so duplicates cannot be checked for
              from here. Creating is still safe — a clash is linked rather than failed — but this list cannot
              tell you in advance which ones those are.
            </div>
          )}

          {clashes.length > 0 && (
            <div className="text-xs rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-amber-800">
              {clashes.length} planned board{clashes.length === 1 ? "" : "s"} already exist on the account under that
              exact name. Link them, or take them out of the plan — creating them is not possible and never was.
            </div>
          )}

          {undated.length > 0 && (
            <div className="text-xs text-neutral-600">
              {undated.length} board{undated.length === 1 ? " has" : "s have"} no planned date, which means they are
              outside the queue entirely. Creating picks them up automatically, or run P3.3.4 to reschedule.
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-neutral-500">
                  <th className="py-1 pr-2 font-medium">Board</th>
                  <th className="py-1 pr-2 font-medium">Due</th>
                  <th className="py-1 pr-2 font-medium text-right">Pins waiting</th>
                  <th className="py-1 pr-2 font-medium">Description</th>
                  <th className="py-1 pr-2 font-medium">On the account</th>
                  <th className="py-1" />
                </tr>
              </thead>
              <tbody className="align-top">
                {rows.slice(0, 15).map((r) => (
                  <tr key={r.board_id} className="border-t border-neutral-200">
                    <td className="py-1.5 pr-2">
                      <div className="text-neutral-900">{r.name}</div>
                      {r.topic_name && <div className="text-[10px] text-neutral-500">{r.topic_name}</div>}
                    </td>
                    <td className="py-1.5 pr-2 whitespace-nowrap">
                      {r.due ?? <span className="text-amber-700">not queued</span>}
                      {r.due_today && <span className="ml-1 text-emerald-700">· due</span>}
                    </td>
                    <td className="py-1.5 pr-2 text-right">
                      {r.live_pins > 0
                        ? <span className="font-semibold text-neutral-900">{r.live_pins}</span>
                        : <span className="text-neutral-400">—</span>}
                    </td>
                    <td className="py-1.5 pr-2 whitespace-nowrap">
                      {/* 400-480 is the build reference's hard rule (section 2).
                          A board created without one is legal on Pinterest and
                          wrong by the method, and this is the last moment it is
                          cheap to fix. */}
                      {r.description_chars === 0
                        ? <span className="text-red-600">missing — P3.3.3</span>
                        : r.description_chars < 400 || r.description_chars > 480
                          ? <span className="text-amber-700">{r.description_chars} chars</span>
                          : <span className="text-neutral-500">{r.description_chars} chars</span>}
                    </td>
                    <td className="py-1.5 pr-2 whitespace-nowrap">
                      {r.clash
                        ? <span className="text-amber-700">
                            exists · {r.clash.privacy.toLowerCase()} · {r.clash.pins} pins
                          </span>
                        : <span className="text-neutral-400">—</span>}
                    </td>
                    <td className="py-1.5 text-right whitespace-nowrap">
                      {r.clash && (
                        <button type="button" disabled={!!busy}
                          onClick={() => act(`link-${r.board_id}`,
                            { action: "link_board", board_id: r.board_id, pinterest_board_id: r.clash!.id },
                            () => `"${r.name}" is now linked to the board already on the account.`)}
                          className="mr-1 px-2 py-1 rounded border border-neutral-300 bg-white font-medium hover:bg-neutral-100 disabled:opacity-50">
                          {busy === `link-${r.board_id}` ? "Linking…" : "Link"}
                        </button>
                      )}
                      <button type="button" disabled={!!busy}
                        onClick={() => {
                          if (!window.confirm(
                            `Take "${r.name}" out of the plan?\n\nOnly the row goes — nothing is touched on Pinterest.`
                          )) return;
                          void act(`rm-${r.board_id}`, { action: "remove_board", board_id: r.board_id },
                            (x) => `"${x.removed}" is out of the plan.`);
                        }}
                        className="px-2 py-1 rounded border border-neutral-300 bg-white text-neutral-600 hover:bg-red-50 hover:text-red-700 disabled:opacity-50">
                        {busy === `rm-${r.board_id}` ? "Removing…" : "Remove"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 15 && (
            <div className="text-[11px] text-neutral-500">
              and {rows.length - 15} more further down the queue.
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" disabled={!!busy || plan.remaining === 0}
              onClick={() => act("create", { action: "create_boards", time_spent_min: 0 }, (r) => {
                const linked = (r.linked_by_name as string[] | undefined) ?? [];
                const errs = (r.errors as string[] | undefined) ?? [];
                return [
                  `Created ${r.created} board(s).`,
                  linked.length ? `Linked instead of duplicating: ${linked.join(", ")}.` : "",
                  r.scheduled ? `${r.scheduled} board(s) had no date and joined the queue.` : "",
                  errs.length ? `Failed: ${errs.join("; ")}` : "",
                  Number(r.remaining) > 0 ? `${r.remaining} still to create.` : "The architecture is live.",
                ].filter(Boolean).join(" ");
              })}
              className="px-3 py-1.5 rounded-md bg-neutral-900 text-white text-xs font-semibold hover:bg-neutral-800 disabled:opacity-50">
              {busy === "create"
                ? "Creating…"
                : dueNow.length > 0
                  ? `Create today's slot (${Math.min(dueNow.length, plan.pace)} due, ${roomToday} left in today's three)`
                  : "Create today's slot (nothing due today)"}
            </button>
            <button type="button" disabled={!!busy} onClick={() => void load()}
              className="px-3 py-1.5 rounded-md border border-neutral-300 bg-white text-xs font-medium hover:bg-neutral-100 disabled:opacity-50">
              Re-check the account
            </button>
          </div>

          {msg && (
            <div className={`text-xs ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</div>
          )}
        </>
      )}
    </div>
  );
}

// --- P3.3.6 / P3.3.7 — board warming ------------------------------------------
//
// Module 2 (Johanne): a new board stays private and is warmed with 10–15 of
// the client's own pins before it goes public — first pins already on the
// account, otherwise pinned from the website with the Pinterest widget. P3.3.6
// is the choosing, P3.3.7 the saving, which a cron does at ten a day.

interface SeedPin {
  id: string; pinterest_pin_id: string; pin_title: string | null; pin_image_url: string | null;
  rank: number; reason: string | null; status: string; error: string | null; saved_at: string | null;
}
interface SeedBoard {
  id: string; name: string; status: string; pin_count: number; on_pinterest: boolean;
  planned_creation_date: string | null; first_waterfall_pin: string | null;
  proposed: number; approved: number; saved: number; pins: SeedPin[];
  /** Has P3.3.6 ever produced a row for this board? */
  ever_proposed: boolean;
}
interface SeedState { per_day: number; public_at: number; target: number; saved_today: number; boards: SeedBoard[] }

function useSeedState(orgId: string) {
  const [state, setState] = useState<SeedState | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setState(await post(orgId, { action: "seed_state" }) as unknown as SeedState); setErr(null); }
    catch (e) { setErr((e as Error).message); }
  }, [orgId]);
  useEffect(() => { void load(); }, [load]);
  return { state, err, load };
}

function boardStage(b: SeedBoard, publicAt: number): { label: string; tone: string } {
  if (b.status === "PUBLIC") return { label: "public", tone: "bg-emerald-100 text-emerald-800" };
  if (!b.on_pinterest) return { label: b.planned_creation_date ? `created ${b.planned_creation_date}` : "not created yet", tone: "bg-neutral-100 text-neutral-600" };
  return { label: `hidden · ${b.pin_count}/${publicAt}`, tone: "bg-amber-100 text-amber-800" };
}

function SeedPlanPanel({ orgId, onDone }: Props) {
  const { state, err, load } = useSeedState(orgId);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function act(key: string, body: Record<string, unknown>, done?: (r: Record<string, unknown>) => string) {
    setBusy(key); setMsg(null);
    try {
      const r = await post(orgId, body);
      if (done) setMsg({ ok: true, text: done(r) });
      await load(); onDone();
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    finally { setBusy(null); }
  }

  const boards = (state?.boards ?? []).filter((b) => b.status !== "PUBLIC" || b.pins.length > 0);
  const proposed = boards.reduce((a, b) => a + b.proposed, 0);

  return (
    <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 space-y-3">
      <div className="text-[11px] font-semibold text-neutral-600 uppercase tracking-wide">P3.3.6 — Choose the seed pins</div>
      <div className="text-xs text-neutral-600">
        Up to {state?.target ?? 15} of the store&#39;s <strong>own</strong> pins per new board — only pins that link to the store&#39;s
        own website, never anybody else&#39;s. The system proposes the ones that genuinely fit each board; you approve or take
        pins out. Nothing goes to Pinterest until you approve it, and then at most {state?.per_day ?? 10} a day (P3.3.7).
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" disabled={!!busy}
          onClick={() => act("propose", { action: "select_seeds", time_spent_min: 0 },
            (r) => `${r.proposed} pins proposed across ${r.boards} boards, from ${r.candidates} of the store's own pins.` +
              ((r.short as string[] | undefined)?.length ? ` Short of ten: ${(r.short as string[]).join(", ")}.` : ""))}
          className="px-3 py-1.5 rounded-md bg-neutral-900 text-white text-xs font-semibold hover:bg-neutral-800 disabled:opacity-50">
          {busy === "propose" ? "Reading the account… (a minute or two)" : proposed > 0 ? "Propose again" : "Propose seed pins"}
        </button>
        {proposed > 0 && (
          <button type="button" disabled={!!busy}
            onClick={() => act("approve_all", { action: "approve_seeds" }, () => `${proposed} pins approved.`)}
            className="px-3 py-1.5 rounded-md bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50">
            {busy === "approve_all" ? "Approving…" : `Approve all ${proposed}`}
          </button>
        )}
      </div>
      {(err || msg) && (
        <div className={`rounded border px-2 py-1.5 text-[11px] ${err || (msg && !msg.ok)
          ? "border-red-300 bg-red-50 text-red-700" : "border-emerald-300 bg-emerald-50 text-emerald-800"}`}>
          {err ?? msg?.text}
        </div>
      )}
      {!state && !err && <div className="text-[11px] text-neutral-500">Loading…</div>}
      {boards.map((b) => {
        const stage = boardStage(b, state!.public_at);
        const reach = b.pin_count + b.approved + b.proposed;
        return (
          <div key={b.id} className="rounded border border-neutral-200 bg-white p-2 space-y-2">
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="font-medium text-neutral-800">{b.name}</span>
              <span className={`rounded px-1.5 py-0.5 text-[10px] ${stage.tone}`}>{stage.label}</span>
              {b.first_waterfall_pin && <span className="text-[10px] text-neutral-500">first waterfall pin {b.first_waterfall_pin}</span>}
              <span className="flex-1" />
              <span className="text-[10px] text-neutral-500">{b.saved} on board · {b.approved} approved · {b.proposed} proposed</span>
              {b.proposed > 0 && (
                <button type="button" disabled={!!busy}
                  onClick={() => act(`approve_${b.id}`, { action: "approve_seeds", board_id: b.id })}
                  className="px-2 py-0.5 rounded border border-emerald-300 text-emerald-700 text-[10px] font-semibold hover:bg-emerald-50 disabled:opacity-50">
                  Approve this board
                </button>
              )}
            </div>
            {b.status !== "PUBLIC" && reach < state!.public_at && (
              <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                Only {reach} of the {state!.public_at} this board needs can come from pins already on the account. Pin the rest
                from the store&#39;s website with the Pinterest widget (needs the account login) — module 2, month 1.
              </div>
            )}
            {b.pins.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                {b.pins.map((p) => (
                  <div key={p.id} className={`relative rounded border p-1 text-[10px] ${p.status === "SAVED"
                    ? "border-emerald-200 bg-emerald-50" : p.status === "FAILED" ? "border-red-200 bg-red-50" : "border-neutral-200"}`}>
                    {p.pin_image_url
                      ? <img src={p.pin_image_url} alt="" className="w-full h-24 object-cover rounded" />
                      : <div className="w-full h-24 rounded bg-neutral-100" />}
                    <div className="mt-1 line-clamp-2 text-neutral-800">{p.pin_title ?? p.pinterest_pin_id}</div>
                    <div className="line-clamp-2 text-neutral-500">{p.status === "FAILED" ? p.error : p.reason}</div>
                    <div className="mt-0.5 text-neutral-400">{p.status.toLowerCase()}</div>
                    {(p.status === "PROPOSED" || p.status === "APPROVED") && (
                      <button type="button" disabled={!!busy} title="Take this pin out"
                        onClick={() => act(`rm_${p.id}`, { action: "remove_seed", plan_id: p.id })}
                        className="absolute top-1 right-1 h-5 w-5 rounded-full bg-white/90 border border-neutral-300 text-neutral-600 hover:text-red-600 disabled:opacity-50">
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SeedingStatusPanel({ orgId }: Props) {
  const { state, err } = useSeedState(orgId);
  const boards = state?.boards ?? [];
  const live = boards.filter((b) => b.on_pinterest);
  const warm = live.filter((b) => b.status === "PUBLIC" || b.pin_count >= (state?.public_at ?? 10));
  // Proposed pins count towards what a board can reach: before anybody approves,
  // every hidden board read "needs the website widget" while fifteen of the
  // account's own pins were waiting for it in P3.3.6.
  const short = live.filter((b) => b.status !== "PUBLIC" && b.pin_count + b.approved + b.proposed < (state?.public_at ?? 10));
  // "The account has nothing that fits this board" and "nobody has looked yet"
  // are different facts, and the panel stated the first when it meant the
  // second. The Longevity store carried a P3.3.6 marked DONE by an older
  // version that wrote no rows at all, so two empty boards read as "needs the
  // website widget" — a person with the client's login, by hand — while
  // re-running the proposal found 247 of the store's own pins in a minute.
  const unproposed = short.filter((b) => !b.ever_proposed);
  const widget = short.filter((b) => b.ever_proposed);
  const unreviewed = boards.reduce((a, b) => a + b.proposed, 0);
  const waiting = boards.reduce((a, b) => a + b.approved, 0);
  return (
    <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 space-y-3">
      <div className="text-[11px] font-semibold text-neutral-600 uppercase tracking-wide">P3.3.7 — Board warming</div>
      <div className="text-xs text-neutral-600">
        Runs by itself: one approved pin an hour from 08:20 to 19:20 (Amsterdam), at most {state?.per_day ?? 10} a day,
        the boards a waterfall is about to publish onto first. A board goes public on Pinterest the moment it holds{" "}
        {state?.public_at ?? 10} pins. There is no button on purpose — a button is how ten a day becomes forty in an afternoon.
      </div>
      {err && <div className="rounded border border-red-300 bg-red-50 px-2 py-1.5 text-[11px] text-red-700">{err}</div>}
      {state && (
        <>
          <div className="text-xs text-neutral-700">
            Today {state.saved_today}/{state.per_day} saved · {waiting} approved pins waiting · {warm.length} of {live.length} live
            boards warm{boards.length > live.length ? ` · ${boards.length - live.length} boards not created yet` : ""}
          </div>
          {waiting === 0 && unreviewed > 0 && (
            <div className="text-[11px] text-amber-800">
              Nothing is approved yet — {unreviewed} proposed pins are waiting in P3.3.6. Approve them there and this starts within the hour.
            </div>
          )}
          {unproposed.length > 0 && (
            <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              No seed pins have been proposed for{" "}
              {unproposed.map((b) => b.name).join(", ")} yet — run <strong>Propose seed pins</strong> in P3.3.6
              first. Until that has run, there is no way to tell whether the account has pins that fit
              {unproposed.length === 1 ? " it" : " them"}.
            </div>
          )}
          {widget.length > 0 && (
            <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              Needs the website widget (not enough of the store&#39;s own pins fit):{" "}
              {widget.map((b) => `${b.name} (${b.pin_count + b.approved}/${state.public_at})`).join(", ")}.
              Pin the rest by hand from the store&#39;s website; this counts them from Pinterest.
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
            {live.map((b) => {
              const stage = boardStage(b, state.public_at);
              return (
                <div key={b.id} className="flex items-center gap-2 text-[11px] rounded border border-neutral-200 bg-white px-2 py-1">
                  <span className="truncate text-neutral-800">{b.name}</span>
                  <span className="flex-1" />
                  {b.approved > 0 && <span className="text-neutral-500">{b.approved} to come</span>}
                  <span className={`rounded px-1.5 py-0.5 text-[10px] ${stage.tone}`}>{stage.label}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
