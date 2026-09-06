"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useKeyedRows } from "./useKeyedRows";
import { useFormDraft, type FormDraft } from "./useFormDraft";
import { DraftHint, DraftBanner } from "./DraftBanner";
import type { TaskRow } from "@/lib/organic/types";
import { cn } from "@/lib/utils";

export interface Phase2Snapshot {
  keywords: string[];
  grid_analyses: GridRow[];
  competitors: CompetitorRow[];
  taste_graph: TasteGraphRow | null;
  market_items: MarketItem[];
  client_settings: { daily_pin_target: number; urls_per_month: number | null } | null;
  /** Every keyword the store holds, seeds and imported bank together. */
  keyword_bank_size?: number;
}
interface GridRow {
  target_keyword: string;
  fmt_simple_pins: boolean | null;
  fmt_infographics: boolean | null;
  fmt_video_916: boolean | null;
  fmt_pure_aesthetic: boolean | null;
  fmt_text_heavy: boolean | null;
  has_visible_ctas: boolean | null;
  text_overlay_bucket: string | null;
  look_and_feel: string | null;
  hex_1: string | null; hex_2: string | null; hex_3: string | null;
}
interface CompetitorRow {
  id: string;
  name: string | null;
  handle: string | null;
  profile_url: string;
  niche_fit: string | null;
  pins_per_day_4mo: number | null;
  pin_export_path: string | null;
  /** How many rows are already in competitor_pins for this competitor —
   *  the upload screen's "done / not done" signal. */
  pins_imported: number | null;
}
interface TasteGraphRow {
  core_products: string[] | null;
  spaces_context: string[] | null;
  aesthetic_worlds: string[] | null;
  moments_seasons: string[] | null;
  functional_outcome: string[] | null;
  aspirational_outcome: string[] | null;
  related_interests: string[] | null;
  content_angles: string[] | null;
  visual_worlds: string[] | null;
  key_moments: string[] | null;
}
interface MarketItem {
  id: string;
  kind: "STEAL_LIST" | "BOARD_GAP" | "CONTENT_ANGLE";
  title: string;
  detail: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reject_reason: string | null;
}

interface Props {
  orgId: string;
  task: TaskRow;
  snapshot: Phase2Snapshot;
  onDone: () => void;
}

/**
 * Which phase-2 tasks have a form of their own — the single source both
 * boards read. It used to be typed out twice, in PhaseBoard and again in
 * TasksBoard, and the two drifted: P2.1.7 and P2.3.2 were added to one and
 * not the other, so on the client overview those tasks had no "Open form"
 * button at all. Add a case below and both surfaces get it.
 */
export const PHASE2_FORM_TASKS = [
  "P2.1.1", "P2.1.3", "P2.1.4", "P2.1.5", "P2.1.6", "P2.1.7",
  "P2.2.1", "P2.2.2", "P2.3.1", "P2.3.2", "P2.3.3", "P2.4.1", "P2.4.2",
] as const;

export function Phase2FormFor(p: Props): React.ReactNode {
  switch (p.task.task_id) {
    case "P2.1.1": return <SeedKeywordsForm {...p} />;
    case "P2.1.3": return <GridForm {...p} />;
    case "P2.1.4": return <HexForm {...p} />;
    case "P2.1.5": return <CompetitorsForm {...p} />;
    case "P2.1.6": return <ImportPinsForm {...p} />;
    case "P2.1.7": return <TopPinDesignsForm {...p} />;
    case "P2.2.1": return <GenerateAIForm {...p} />;
    case "P2.2.2": return <ReviewInsightsForm {...p} />;
    case "P2.3.1": return <TasteGraphForm {...p} />;
    case "P2.3.2": return <AudienceAffinitiesForm {...p} />;
    case "P2.3.3": return <ThreeAWMForm {...p} />;
    case "P2.4.1": return <VelocityForm {...p} />;
    case "P2.4.2": return <FrequencyForm {...p} />;
    default: return null;
  }
}

// ---------- P2.1.1 ----------------------------------------------------------

function SeedKeywordsForm({ orgId, snapshot, onDone }: Props) {
  const [text, setText] = useState(snapshot.keywords.join("\n"));
  const [time, setTime] = useState("");
  const draft = useFormDraft(orgId, "P2.1.1", { text, time }, (d) => {
    if (typeof d.text === "string") setText(d.text);
    if (typeof d.time === "string") setTime(d.time);
  });
  const list = text.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
  // A store whose keyword bank was imported by the main dashboard opens this
  // form empty, which reads as data loss unless the bank is mentioned.
  const bank = snapshot.keyword_bank_size ?? 0;
  const extra = Math.max(0, bank - snapshot.keywords.length);
  return (
    <FormShell
      draft={draft}
      title="Seed keywords (5–10)"
      body={
        <>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5}
            placeholder="one per line — e.g. modern living room&#10;vanity lighting&#10;home decor inspiration"
            className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-xs" />
          <div className="text-[11px] text-neutral-500 mt-1">
            {list.length}/10 entered · minimum 5.
            {extra > 0 && (
              <> · This store also holds {extra.toLocaleString("en-US")} keyword(s) imported from the dashboard.
                Those stay in the bank; phase 2 asks its questions about the seeds you name here.</>
            )}
          </div>
        </>
      }
      time={time} setTime={setTime}
      submitLabel="Save seed keywords"
      onSubmit={() => post(orgId, { action: "seed_keywords", keywords: list, time_spent_min: n(time) }).then(onDone)}
    />
  );
}

// ---------- P2.1.3 (grid) ---------------------------------------------------

type GridRowState = {
  fmt_simple_pins: boolean; fmt_infographics: boolean; fmt_video_916: boolean;
  fmt_pure_aesthetic: boolean; fmt_text_heavy: boolean; has_visible_ctas: boolean;
  text_overlay_bucket: string; look_and_feel: string;
};

/**
 * The grid record, one card per seed keyword.
 *
 * Three rules here are the answer to how a day of research went missing:
 * a keyword can be saved on its own, the bottom Save takes everything that
 * is filled in rather than refusing the form over a blank row, and what is
 * typed is mirrored into a draft while it is being typed.
 */
function GridForm({ orgId, snapshot, onDone }: Props) {
  const keywords = snapshot.keywords;
  const seeded = useMemo(() => Object.fromEntries(snapshot.grid_analyses.map((g) => [g.target_keyword, g])), [snapshot.grid_analyses]);
  const [rows, setRows] = useKeyedRows<GridRowState>(keywords, (k) => ({
    fmt_simple_pins:    !!seeded[k]?.fmt_simple_pins,
    fmt_infographics:   !!seeded[k]?.fmt_infographics,
    fmt_video_916:      !!seeded[k]?.fmt_video_916,
    fmt_pure_aesthetic: !!seeded[k]?.fmt_pure_aesthetic,
    fmt_text_heavy:     !!seeded[k]?.fmt_text_heavy,
    has_visible_ctas:   !!seeded[k]?.has_visible_ctas,
    text_overlay_bucket: seeded[k]?.text_overlay_bucket ?? "",
    look_and_feel:       seeded[k]?.look_and_feel ?? "",
  }));
  const [time, setTime] = useState("");
  // Which keywords are in the database right now — seeded from the snapshot,
  // then updated by each per-keyword save so the ticks are honest without a
  // page refresh.
  const [stored, setStored] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(snapshot.grid_analyses.filter((g) => g.text_overlay_bucket).map((g) => [g.target_keyword, true])));
  const [busy, setBusy] = useState<string | null>(null);
  const [rowErr, setRowErr] = useState<Record<string, string>>({});
  const draft = useFormDraft(orgId, "P2.1.3", { rows, time }, (d) => {
    if (d.rows) setRows((cur) => ({ ...cur, ...(d.rows as Record<string, GridRowState>) }));
    if (typeof d.time === "string") setTime(d.time);
  });

  if (keywords.length === 0) {
    return <Notice>Save seed keywords first (P2.1.1) — the grid is recorded per seed keyword.</Notice>;
  }
  const buckets = ["NONE","MINIMAL","HALF","MOST","ALL"] as const;
  const filled = (k: string) => !!rows[k]?.text_overlay_bucket;
  const recordFor = (k: string) => ({
    target_keyword: k, ...rows[k],
    text_overlay_bucket: rows[k].text_overlay_bucket as "NONE"|"MINIMAL"|"HALF"|"MOST"|"ALL",
  });

  /** One keyword, on its own, without a time entry — the point is that
   *  finishing a card is enough to make it safe. */
  async function saveOne(k: string) {
    setRowErr((e) => ({ ...e, [k]: "" }));
    setBusy(k);
    try {
      await post(orgId, { action: "grid_records", records: [recordFor(k)], time_spent_min: 0 });
      setStored((v) => ({ ...v, [k]: true }));
    } catch (e) {
      setRowErr((v) => ({ ...v, [k]: (e as Error).message }));
    } finally { setBusy(null); }
  }

  const openCount = keywords.filter((k) => !filled(k)).length;
  return (
    <FormShell
      draft={draft}
      title={`Grid record per keyword (${keywords.length - openCount}/${keywords.length} filled in)`}
      body={
        <div className="space-y-2 max-h-[34rem] overflow-y-auto">
          {keywords.map((k) => {
            const r = rows[k];
            const setRow = (patch: Partial<GridRowState>) => setRows({ ...rows, [k]: { ...r, ...patch } });
            return (
              <div key={k} className="rounded border border-border bg-card p-2 space-y-1.5">
                <div className="flex items-center gap-2">
                  <div className="text-xs font-medium text-neutral-800 flex-1">{k}</div>
                  {stored[k] && <span className="text-[10px] text-emerald-700">✓ saved</span>}
                  <button type="button" onClick={() => saveOne(k)} disabled={!filled(k) || busy === k}
                    title={filled(k) ? "Save just this keyword" : "Pick a text-overlay bucket first"}
                    className="text-[10px] px-1.5 py-0.5 rounded border border-border text-foreground hover:bg-muted disabled:opacity-40">
                    {busy === k ? "…" : stored[k] ? "Save again" : "Save keyword"}
                  </button>
                </div>
                <div className="flex flex-wrap gap-3 text-[11px]">
                  <FormatToggle label="2:3 simple" v={r.fmt_simple_pins} on={(x) => setRow({ fmt_simple_pins: x })} />
                  <FormatToggle label="Infographic" v={r.fmt_infographics} on={(x) => setRow({ fmt_infographics: x })} />
                  <FormatToggle label="9:16 video" v={r.fmt_video_916} on={(x) => setRow({ fmt_video_916: x })} />
                  <FormatToggle label="Pure aesthetic" v={r.fmt_pure_aesthetic} on={(x) => setRow({ fmt_pure_aesthetic: x })} />
                  <FormatToggle label="Text-heavy" v={r.fmt_text_heavy} on={(x) => setRow({ fmt_text_heavy: x })} />
                </div>
                <div className="flex items-center gap-3 text-[11px]">
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" checked={r.has_visible_ctas} onChange={(e) => setRow({ has_visible_ctas: e.target.checked })} />
                    Visible CTAs
                  </label>
                  <label className="flex items-center gap-1.5">
                    Text overlay:
                    <select value={r.text_overlay_bucket} onChange={(e) => setRow({ text_overlay_bucket: e.target.value })}
                      className="rounded border border-neutral-300 px-1.5 py-0.5 text-[11px] bg-white">
                      <option value="">—</option>
                      {buckets.map((b) => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </label>
                </div>
                <input value={r.look_and_feel} onChange={(e) => setRow({ look_and_feel: e.target.value })}
                  placeholder="One-line impression of page 1 — colours, mood, subject"
                  className="w-full rounded border border-neutral-300 px-2 py-1 text-xs" />
                {rowErr[k] && <div className="text-[10px] text-red-600">{rowErr[k]}</div>}
              </div>
            );
          })}
        </div>
      }
      time={time} setTime={setTime}
      submitLabel={openCount > 0 ? `Save ${keywords.length - openCount} filled-in keyword(s)` : "Save grid records"}
      onSubmit={async () => {
        const records = keywords.filter(filled).map(recordFor);
        if (records.length === 0) {
          throw new Error("Nothing to save yet — pick a text-overlay bucket for at least one keyword.");
        }
        const r = await post(orgId, { action: "grid_records", records, time_spent_min: n(time) }) as
          { count: number; remaining: string[]; done: boolean };
        setStored(Object.fromEntries(records.map((x) => [x.target_keyword, true])));
        onDone();
        return r.done
          ? `Saved ${r.count} keyword(s) — the grid is complete and P2.1.3 is done.`
          : `Saved ${r.count} keyword(s). Still open: ${r.remaining.join(", ")}. The task stays in progress.`;
      }}
    />
  );
}

function FormatToggle({ label, v, on }: { label: string; v: boolean; on: (v: boolean) => void }) {
  return (
    <label className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 cursor-pointer ${v ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground"}`}>
      <input type="checkbox" checked={v} onChange={(e) => on(e.target.checked)} className="sr-only" />
      {label}
    </label>
  );
}

// ---------- P2.1.4 (hex) ----------------------------------------------------

const HEX_RE = /^#?[0-9a-fA-F]{6}$/;

function HexForm({ orgId, snapshot, onDone }: Props) {
  const keywords = snapshot.keywords;
  const seeded = useMemo(() => Object.fromEntries(snapshot.grid_analyses.map((g) => [g.target_keyword, g])), [snapshot.grid_analyses]);
  const [rows, setRows] = useKeyedRows<[string, string, string]>(keywords, (k) => [
    seeded[k]?.hex_1 ?? "",
    seeded[k]?.hex_2 ?? "",
    seeded[k]?.hex_3 ?? "",
  ]);
  const [time, setTime] = useState("");
  const [stored, setStored] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(snapshot.grid_analyses.filter((g) => g.hex_1).map((g) => [g.target_keyword, true])));
  const [busy, setBusy] = useState<string | null>(null);
  const draft = useFormDraft(orgId, "P2.1.4", { rows, time }, (d) => {
    if (d.rows) setRows((cur) => ({ ...cur, ...(d.rows as Record<string, [string, string, string]>) }));
    if (typeof d.time === "string") setTime(d.time);
  });
  if (keywords.length === 0) return <Notice>Save seed keywords first (P2.1.1).</Notice>;

  const complete = (k: string) => (rows[k] ?? []).every((h) => HEX_RE.test(h));
  const started = (k: string) => (rows[k] ?? []).some((h) => h.trim() !== "");
  const recordFor = (k: string) => {
    const [h1, h2, h3] = rows[k];
    return { target_keyword: k, hex_1: h1, hex_2: h2, hex_3: h3 };
  };

  async function saveOne(k: string) {
    setBusy(k);
    try {
      await post(orgId, { action: "hexes", records: [recordFor(k)], time_spent_min: 0 });
      setStored((v) => ({ ...v, [k]: true }));
    } finally { setBusy(null); }
  }

  const filledCount = keywords.filter(complete).length;
  return (
    <FormShell
      draft={draft}
      title={`Dominant hex codes per keyword (${filledCount}/${keywords.length} filled in)`}
      body={
        <div className="space-y-1.5 max-h-[34rem] overflow-y-auto">
          {keywords.map((k) => {
            const trio = rows[k];
            return (
              <div key={k} className="flex items-center gap-2 text-xs">
                <span className="w-40 text-neutral-700 shrink-0">{k}</span>
                {[0, 1, 2].map((i) => {
                  const v = trio[i];
                  const valid = !v || HEX_RE.test(v);
                  return (
                    <div key={i} className="flex items-center gap-1">
                      <input value={v}
                        onChange={(e) => {
                          const next = [...trio] as [string, string, string];
                          next[i] = e.target.value;
                          setRows({ ...rows, [k]: next });
                        }}
                        placeholder="#a1b2c3"
                        className={`w-24 rounded border px-2 py-1 text-[11px] tabular-nums ${valid ? "border-neutral-300" : "border-red-400 bg-red-50"}`}
                      />
                      {valid && v && (
                        <span className="w-5 h-5 rounded border border-neutral-300"
                          style={{ backgroundColor: v.startsWith("#") ? v : "#" + v }} />
                      )}
                    </div>
                  );
                })}
                {stored[k] && <span className="text-[10px] text-emerald-700">✓</span>}
                <button type="button" onClick={() => saveOne(k)} disabled={!complete(k) || busy === k}
                  title={complete(k) ? "Save just this keyword" : "Three valid hex codes first"}
                  className="text-[10px] px-1.5 py-0.5 rounded border border-border text-foreground hover:bg-muted disabled:opacity-40">
                  {busy === k ? "…" : "Save"}
                </button>
              </div>
            );
          })}
        </div>
      }
      time={time} setTime={setTime}
      submitLabel={filledCount < keywords.length ? `Save ${filledCount} filled-in keyword(s)` : "Save hex codes"}
      onSubmit={async () => {
        // A half-typed row is an error and is named; an untouched one is
        // simply not done yet. Neither may cost the rows that are finished.
        const halfTyped = keywords.filter((k) => started(k) && !complete(k));
        if (halfTyped.length > 0) {
          throw new Error(`Three valid 6-digit hex codes needed for: ${halfTyped.join(", ")}. Nothing was saved — correct or clear those and save again.`);
        }
        const records = keywords.filter(complete).map(recordFor);
        if (records.length === 0) throw new Error("Nothing to save yet — fill in the three hex codes for at least one keyword.");
        const r = await post(orgId, { action: "hexes", records, time_spent_min: n(time) }) as
          { count: number; remaining: string[]; done: boolean };
        setStored(Object.fromEntries(records.map((x) => [x.target_keyword, true])));
        onDone();
        return r.done
          ? `Saved ${r.count} keyword(s) — all seed keywords have their colours.`
          : `Saved ${r.count} keyword(s). Still open: ${r.remaining.join(", ")}. The task stays in progress.`;
      }}
    />
  );
}

// ---------- P2.1.5 (competitors) --------------------------------------------

function CompetitorsForm({ orgId, snapshot, onDone }: Props) {
  type Row = { name: string; handle: string; profile_url: string; niche_fit: string };
  const [rows, setRows] = useState<Row[]>(() =>
    snapshot.competitors.length > 0
      ? snapshot.competitors.map((c) => ({
          name: c.name ?? "", handle: c.handle ?? "", profile_url: c.profile_url,
          niche_fit: c.niche_fit ?? "PARTIAL",
        }))
      : Array.from({ length: 5 }, () => ({ name: "", handle: "", profile_url: "", niche_fit: "PARTIAL" }))
  );
  const [time, setTime] = useState("");
  const draft = useFormDraft(orgId, "P2.1.5", { rows, time }, (d) => {
    if (Array.isArray(d.rows)) setRows(d.rows as Row[]);
    if (typeof d.time === "string") setTime(d.time);
  });
  const set = (i: number, patch: Partial<Row>) => setRows(rows.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  return (
    <FormShell
      draft={draft}
      title={`Competitors (5–10) — currently ${rows.length}`}
      body={
        <div className="space-y-1">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-12 gap-1 text-[11px]">
              <input value={r.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="Name"
                className="col-span-3 rounded border border-neutral-300 px-2 py-1" />
              <input value={r.handle} onChange={(e) => set(i, { handle: e.target.value })} placeholder="@handle"
                className="col-span-2 rounded border border-neutral-300 px-2 py-1" />
              <input value={r.profile_url} onChange={(e) => set(i, { profile_url: e.target.value })} placeholder="https://pinterest.com/…"
                className="col-span-5 rounded border border-neutral-300 px-2 py-1" />
              <select value={r.niche_fit} onChange={(e) => set(i, { niche_fit: e.target.value })}
                className="col-span-1 rounded border border-neutral-300 px-1 py-1 bg-white">
                <option value="STRONG">STRONG</option>
                <option value="PARTIAL">PARTIAL</option>
                <option value="WEAK">WEAK</option>
              </select>
              <button type="button" onClick={() => setRows(rows.filter((_, idx) => idx !== i))}
                className="col-span-1 rounded border border-neutral-300 px-1 py-1 text-neutral-500 hover:bg-neutral-100">×</button>
            </div>
          ))}
          <button type="button" onClick={() => rows.length < 10 && setRows([...rows, { name: "", handle: "", profile_url: "", niche_fit: "PARTIAL" }])}
            className="mt-1 text-[11px] text-primary hover:text-primary font-medium disabled:opacity-40" disabled={rows.length >= 10}>
            + Add competitor ({rows.length}/10)
          </button>
        </div>
      }
      time={time} setTime={setTime}
      submitLabel="Save competitors"
      onSubmit={() => {
        const list = rows
          .map((r) => ({ ...r, name: r.name.trim(), profile_url: r.profile_url.trim() }))
          .filter((r) => r.name && r.profile_url);
        return post(orgId, { action: "competitors", list, time_spent_min: n(time) }).then(onDone);
      }}
    />
  );
}

// ---------- P2.1.6 (upload the PinInspector exports) -------------------------

/** What the server reports back per file. */
interface ImportPinsResult {
  parsed: number;
  imported: number;
  duplicates: number;
  skipped_no_url: number;
  columns: Record<string, string | null>;
  covered: number;
  total_competitors: number;
  total_pins: number;
}
type RowState =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "done"; result: ImportPinsResult }
  | { kind: "error"; message: string };

/** Vercel refuses a request body over 4.5MB, and the failure arrives as an
 *  opaque 413 rather than as anything about CSVs. Caught here so the file
 *  that is too big is named, with the count that makes it too big. */
const MAX_CSV_BYTES = 4_000_000;

/** Strip everything that differs between a brand's name and its export's
 *  file name — case, @, spaces, punctuation — so "@LuluAndGeorgia" matches
 *  "lulu_and_georgia_pins_2026-08.csv". */
function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function ImportPinsForm({ orgId, snapshot, onDone }: Props) {
  const competitors = snapshot.competitors;
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [state, setState] = useState<Record<string, RowState>>({});
  const [unmatched, setUnmatched] = useState<File[]>([]);
  const [time, setTime] = useState("");

  if (competitors.length === 0) return <Notice>Save competitors first (P2.1.5).</Notice>;

  const covered = competitors.filter((c) => (c.pins_imported ?? 0) > 0).length;
  const queued = competitors.filter((c) => files[c.id]).length;

  /** Drop several exports at once and let each find its competitor. A file
   *  that matches nobody is not silently discarded — it is listed with a
   *  picker, because a name that does not match is the normal case for a
   *  brand whose handle differs from its own name. */
  function takeFiles(list: FileList | null) {
    if (!list?.length) return;
    const next = { ...files };
    const leftover: File[] = [];
    for (const f of Array.from(list)) {
      const name = slug(f.name);
      const hit = competitors.find((c) => {
        const keys = [c.handle, c.name].filter(Boolean).map((k) => slug(String(k)));
        return keys.some((k) => k.length >= 3 && name.includes(k));
      });
      if (hit && !next[hit.id]) next[hit.id] = f;
      else leftover.push(f);
    }
    setFiles(next);
    setUnmatched(leftover);
  }

  function assign(compId: string, f: File) {
    setFiles((prev) => ({ ...prev, [compId]: f }));
    setUnmatched((prev) => prev.filter((x) => x !== f));
  }

  async function importAll() {
    const todo = competitors.filter((c) => files[c.id]);
    if (todo.length === 0) throw new Error("Pick at least one CSV first.");
    const minutes = n(time);
    let first = true;
    let failures = 0;

    for (const c of todo) {
      const file = files[c.id]!;
      setState((s) => ({ ...s, [c.id]: { kind: "busy" } }));
      try {
        const text = await file.text();
        if (text.length > MAX_CSV_BYTES) {
          throw new Error(
            `${(text.length / 1_000_000).toFixed(1)}MB is over the 4MB upload limit — ` +
            `export this competitor in two halves and import both.`
          );
        }
        // The batch's time is booked once, on the first file: the manager
        // spent it on the export run, not on each upload.
        const r = (await post(orgId, {
          action: "import_pins",
          profile_url: c.profile_url,
          csv: text,
          file_name: file.name,
          time_spent_min: first ? minutes : 0,
        })) as ImportPinsResult;
        first = false;
        setState((s) => ({ ...s, [c.id]: { kind: "done", result: r } }));
      } catch (e) {
        failures++;
        setState((s) => ({ ...s, [c.id]: { kind: "error", message: (e as Error).message } }));
      }
    }
    onDone();
    if (failures > 0) throw new Error(`${failures} of ${todo.length} file(s) failed — see the rows above.`);
  }

  return (
    <FormShell
      title="Upload the PinInspector exports"
      body={
        <div className="space-y-3">
          <div className="text-[11px] text-neutral-600">
            One CSV per competitor, 700–1000 pins each. Drop them all at once — each file
            looks for its competitor by name. Re-importing the same export is safe:
            rows already stored are counted as duplicates, not written again.
          </div>

          <label className="block rounded-md border border-dashed border-neutral-300 bg-white px-3 py-4 text-center cursor-pointer hover:border-neutral-400">
            <input type="file" accept=".csv,text/csv,text/plain" multiple className="hidden"
              onChange={(e) => { takeFiles(e.target.files); e.target.value = ""; }} />
            <span className="text-xs font-medium text-neutral-700">Choose CSV files</span>
            <span className="block text-[11px] text-neutral-500 mt-0.5">
              comma, semicolon or tab-separated — detected per file
            </span>
          </label>

          {unmatched.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 space-y-1.5">
              <div className="text-[11px] font-medium text-amber-900">
                {unmatched.length} file(s) matched no competitor by name — assign them:
              </div>
              {unmatched.map((f, i) => (
                <div key={`${f.name}-${i}`} className="flex items-center gap-2">
                  <span className="text-[11px] text-neutral-700 truncate flex-1">{f.name}</span>
                  <select defaultValue="" onChange={(e) => e.target.value && assign(e.target.value, f)}
                    className="rounded border border-neutral-300 px-1.5 py-0.5 text-[11px] bg-white">
                    <option value="" disabled>assign to…</option>
                    {competitors.map((c) => (
                      <option key={c.id} value={c.id}>{c.name || c.profile_url}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}

          <ul className="space-y-1">
            {competitors.map((c) => {
              const st = state[c.id] ?? { kind: "idle" as const };
              const picked = files[c.id];
              const already = c.pins_imported ?? 0;
              return (
                <li key={c.id} className="rounded-md border border-neutral-200 bg-white px-2.5 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-neutral-800 truncate flex-1">
                      {c.name || c.profile_url}
                      {c.handle && <span className="text-neutral-400 font-normal"> · {c.handle}</span>}
                    </span>
                    <span className={cn(
                      "text-[11px] tabular-nums shrink-0",
                      already > 0 ? "text-neutral-600" : "text-amber-700"
                    )}>
                      {already > 0 ? `${already.toLocaleString("en-US")} pins` : "no export yet"}
                    </span>
                    <label className="shrink-0 text-[11px] text-primary hover:underline cursor-pointer">
                      <input type="file" accept=".csv,text/csv,text/plain" className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) assign(c.id, f); e.target.value = ""; }} />
                      {picked ? "replace" : "choose file"}
                    </label>
                  </div>

                  {picked && st.kind !== "done" && (
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-neutral-500">
                      <span className="truncate">{picked.name}</span>
                      <span className="tabular-nums shrink-0">{(picked.size / 1024).toFixed(0)} KB</span>
                      {st.kind === "busy" && <span className="text-neutral-700 shrink-0">importing…</span>}
                    </div>
                  )}

                  {st.kind === "done" && (
                    <div className="mt-1 text-[11px] text-neutral-600">
                      <span className="font-medium text-neutral-800">
                        {st.result.imported.toLocaleString("en-US")} new
                      </span>
                      {" · "}{st.result.parsed.toLocaleString("en-US")} rows read
                      {st.result.duplicates > 0 && <> · {st.result.duplicates.toLocaleString("en-US")} already stored</>}
                      {st.result.skipped_no_url > 0 && <> · {st.result.skipped_no_url} without a URL</>}
                      <div className="text-neutral-400">
                        read from: {Object.entries(st.result.columns)
                          .map(([field, col]) => `${field} ← ${col ?? "—"}`).join(", ")}
                      </div>
                    </div>
                  )}

                  {st.kind === "error" && (
                    <div className="mt-1 text-[11px] text-red-600 break-words">{st.message}</div>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="text-[11px] text-neutral-500">
            {covered}/{competitors.length} competitors have an export.
            {covered < competitors.length && " The task closes itself once every one does."}
          </div>
        </div>
      }
      time={time} setTime={setTime}
      submitLabel={queued > 0 ? `Import ${queued} file(s)` : "Import"}
      onSubmit={importAll}
    />
  );
}

// ---------- P2.2.1 (generate AI) --------------------------------------------

function GenerateAIForm({ orgId, snapshot, onDone }: Props) {
  const [time, setTime] = useState("");
  const pending = snapshot.market_items.filter((i) => i.status === "PENDING").length;
  return (
    <FormShell
      title="Generate AI market analysis"
      body={
        <div className="text-xs text-neutral-600 space-y-1">
          <div>Prompt is assembled server-side from intake, taste graph, grid analyses and competitor data — nothing to paste.</div>
          <div>Output: Steal List + Board Gap + Content Angles, each item approvable individually in P2.2.2.</div>
          {snapshot.market_items.length > 0 && (
            <div className="text-neutral-500">Currently {snapshot.market_items.length} item(s) in the review queue ({pending} pending).</div>
          )}
        </div>
      }
      time={time} setTime={setTime}
      submitLabel="Run AI analysis"
      onSubmit={() => post(orgId, { action: "generate_analysis", time_spent_min: n(time) }).then(onDone)}
    />
  );
}

// ---------- P2.2.2 (review insights) ----------------------------------------

function ReviewInsightsForm({ orgId, snapshot, onDone }: Props) {
  // The list is DERIVED from the snapshot, never copied into state, and this
  // is the whole reason P2.2.2 read "No AI items yet. Run P2.2.1 first." on a
  // store that had just generated twenty of them. Every task with a form and
  // a status of TODO opens expanded on page load, so this form mounts before
  // the analysis exists; `useState(snapshot.market_items)` then froze the
  // empty list, and the router.refresh() fired after P2.2.1 handed it fresh
  // props that useState ignores by definition. Only a hard reload fixed it —
  // and nothing on screen suggested a reload was what was missing.
  //
  // Approving is still optimistic: the verdict is held per id and merged over
  // the server rows, so a click shows immediately and a later refresh cannot
  // undo it either.
  const [verdicts, setVerdicts] = useState<Record<string, { status: MarketItem["status"]; reject_reason: string | null }>>({});
  const items = snapshot.market_items.map((it) => verdicts[it.id] ? { ...it, ...verdicts[it.id] } : it);
  const [time, setTime] = useState("");

  async function review(id: string, status: "APPROVED" | "REJECTED", reason?: string) {
    const res = await fetch(`/api/organic/market-items/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status, reject_reason: reason }),
      redirect: "error",
    });
    const text = await res.text();
    let data: { error?: string } = {};
    try { data = JSON.parse(text); } catch { /* keep raw */ }
    if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status} — ${text.slice(0, 140)}`);
    setVerdicts((prev) => ({ ...prev, [id]: { status, reject_reason: reason ?? null } }));
  }

  const grouped: Record<string, MarketItem[]> = { STEAL_LIST: [], BOARD_GAP: [], CONTENT_ANGLE: [] };
  for (const it of items) grouped[it.kind].push(it);

  if (items.length === 0) {
    return <Notice>No AI items yet. Run P2.2.1 first.</Notice>;
  }

  return (
    <FormShell
      title={`Review market analysis (${items.length} items)`}
      body={
        <div className="space-y-3">
          {(["STEAL_LIST","BOARD_GAP","CONTENT_ANGLE"] as const).map((kind) => (
            <div key={kind}>
              <div className="text-[10px] uppercase tracking-wide text-neutral-500 font-semibold mb-1">
                {kind.replace("_", " ")} ({grouped[kind].length})
              </div>
              <div className="space-y-1">
                {grouped[kind].map((it) => <ReviewItem key={it.id} it={it} onReview={review} />)}
                {grouped[kind].length === 0 && <div className="text-[11px] text-neutral-400">—</div>}
              </div>
            </div>
          ))}
        </div>
      }
      time={time} setTime={setTime}
      submitLabel="Mark review complete"
      onSubmit={() => post(orgId, { action: "review_complete", time_spent_min: n(time) }).then(onDone)}
    />
  );
}

function ReviewItem({ it, onReview }: { it: MarketItem; onReview: (id: string, status: "APPROVED" | "REJECTED", reason?: string) => Promise<void> }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className={`rounded border px-2 py-1.5 text-xs ${it.status === "APPROVED" ? "border-foreground/20 bg-muted" : it.status === "REJECTED" ? "border-border bg-muted opacity-60" : "border-border bg-card"}`}>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-medium">{it.title}</div>
          {it.detail && <div className="text-neutral-500 text-[11px] mt-0.5">{it.detail}</div>}
          {it.status === "REJECTED" && it.reject_reason && (
            <div className="text-red-600 text-[11px] mt-0.5">Rejected: {it.reject_reason}</div>
          )}
        </div>
        {it.status === "PENDING" && (
          <div className="flex gap-1 shrink-0">
            <button type="button" onClick={() => onReview(it.id, "APPROVED").catch((e) => setErr(String(e.message)))}
              className="text-[11px] px-2 py-0.5 rounded border border-foreground/30 text-foreground hover:bg-muted">Approve</button>
            <button type="button" onClick={() => setRejecting(true)}
              className="text-[11px] px-2 py-0.5 rounded border border-neutral-300 text-neutral-700 hover:bg-neutral-100">Reject</button>
          </div>
        )}
      </div>
      {rejecting && (
        <div className="mt-2 flex gap-1">
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)"
            className="flex-1 rounded border border-neutral-300 px-2 py-0.5 text-[11px]" />
          <button type="button" onClick={async () => {
            if (!reason.trim()) { setErr("Reason required."); return; }
            try { await onReview(it.id, "REJECTED", reason); setRejecting(false); setReason(""); }
            catch (e) { setErr((e as Error).message); }
          }} className="text-[11px] px-2 py-0.5 rounded bg-neutral-800 text-white">Confirm</button>
          <button type="button" onClick={() => setRejecting(false)} className="text-[11px] px-2 py-0.5 rounded border border-neutral-300">Cancel</button>
        </div>
      )}
      {err && <div className="mt-1 text-[11px] text-red-600">{err}</div>}
    </div>
  );
}

// ---------- P2.3.1 (taste graph) --------------------------------------------

function TasteGraphForm({ orgId, snapshot, onDone }: Props) {
  const t = snapshot.taste_graph;
  const [v, setV] = useState({
    core_products: (t?.core_products ?? []).join(", "),
    spaces_context: (t?.spaces_context ?? []).join(", "),
    aesthetic_worlds: (t?.aesthetic_worlds ?? []).join(", "),
    moments_seasons: (t?.moments_seasons ?? []).join(", "),
    functional_outcome: (t?.functional_outcome ?? []).join(", "),
    aspirational_outcome: (t?.aspirational_outcome ?? []).join(", "),
    related_interests: (t?.related_interests ?? []).join(", "),
  });
  const [time, setTime] = useState("");
  const draft = useFormDraft(orgId, "P2.3.1", { v, time }, (d) => {
    if (d.v && typeof d.v === "object") setV((cur) => ({ ...cur, ...(d.v as typeof v) }));
    if (typeof d.time === "string") setTime(d.time);
  });
  const csv = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
  return (
    <FormShell
      draft={draft}
      title="Taste graph — 7 fields, multiple entries each (comma-separated)"
      body={
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          {([
            ["core_products", "Core products"],
            ["spaces_context", "Spaces / context"],
            ["aesthetic_worlds", "Aesthetic worlds"],
            ["moments_seasons", "Moments / seasons"],
            ["functional_outcome", "Functional outcome"],
            ["aspirational_outcome", "Aspirational outcome"],
            ["related_interests", "Related interests"],
          ] as const).map(([k, label]) => (
            <label key={k} className="block">
              <span className="text-neutral-500 block mb-0.5">{label}</span>
              <input value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })}
                className="w-full rounded border border-neutral-300 px-2 py-1" />
            </label>
          ))}
        </div>
      }
      time={time} setTime={setTime}
      submitLabel="Save taste graph"
      onSubmit={() => post(orgId, {
        action: "taste_graph",
        core_products: csv(v.core_products),
        spaces_context: csv(v.spaces_context),
        aesthetic_worlds: csv(v.aesthetic_worlds),
        moments_seasons: csv(v.moments_seasons),
        functional_outcome: csv(v.functional_outcome),
        aspirational_outcome: csv(v.aspirational_outcome),
        related_interests: csv(v.related_interests),
        time_spent_min: n(time),
      }).then(onDone)}
    />
  );
}

// ---------- P2.3.3 (3 angles, 3 worlds, 3 moments) --------------------------

function ThreeAWMForm({ orgId, snapshot, onDone }: Props) {
  const t = snapshot.taste_graph;
  const init = (arr: string[] | null | undefined): [string, string, string] => {
    const a = (arr ?? []).slice(0, 3);
    while (a.length < 3) a.push("");
    return [a[0], a[1], a[2]];
  };
  const [angles, setAngles] = useState(init(t?.content_angles));
  const [worlds, setWorlds] = useState(init(t?.visual_worlds));
  const [moments, setMoments] = useState(init(t?.key_moments));
  const [time, setTime] = useState("");
  const draft = useFormDraft(orgId, "P2.3.3", { angles, worlds, moments, time }, (d) => {
    if (Array.isArray(d.angles)) setAngles(d.angles as [string, string, string]);
    if (Array.isArray(d.worlds)) setWorlds(d.worlds as [string, string, string]);
    if (Array.isArray(d.moments)) setMoments(d.moments as [string, string, string]);
    if (typeof d.time === "string") setTime(d.time);
  });
  const Row = ({ label, values, on }: { label: string; values: [string, string, string]; on: (v: [string,string,string]) => void }) => (
    <div>
      <div className="text-[11px] font-semibold text-neutral-600 mb-1">{label}</div>
      <div className="grid grid-cols-3 gap-1">
        {values.map((val, i) => (
          <input key={i} value={val} onChange={(e) => { const next = [...values] as [string,string,string]; next[i] = e.target.value; on(next); }}
            className="rounded border border-neutral-300 px-2 py-1 text-xs" placeholder={`#${i+1}`} />
        ))}
      </div>
    </div>
  );
  return (
    <FormShell
      draft={draft}
      title="3 angles · 3 worlds · 3 moments (feeds boards + prompts)"
      body={
        <div className="space-y-3">
          <Row label="Content angles" values={angles} on={setAngles} />
          <Row label="Visual worlds" values={worlds} on={setWorlds} />
          <Row label="Key moments" values={moments} on={setMoments} />
        </div>
      }
      time={time} setTime={setTime}
      submitLabel="Save (exactly 3 each)"
      onSubmit={() => post(orgId, {
        action: "three_awm",
        content_angles: angles,
        visual_worlds: worlds,
        key_moments: moments,
        time_spent_min: n(time),
      }).then(onDone)}
    />
  );
}

// ---------- P2.4.1 (velocity) -----------------------------------------------

function VelocityForm({ orgId, snapshot, onDone }: Props) {
  const seeded = useMemo(
    () => Object.fromEntries(snapshot.competitors.map((c) => [c.profile_url, c.pins_per_day_4mo])),
    [snapshot.competitors],
  );
  const [rows, setRows] = useKeyedRows<string>(
    snapshot.competitors.map((c) => c.profile_url),
    (u) => seeded[u]?.toString() ?? "",
  );
  const [time, setTime] = useState("");
  const draft = useFormDraft(orgId, "P2.4.1", { rows, time }, (d) => {
    if (d.rows) setRows((cur) => ({ ...cur, ...(d.rows as Record<string, string>) }));
    if (typeof d.time === "string") setTime(d.time);
  });
  if (snapshot.competitors.length === 0) return <Notice>Add competitors first (P2.1.5).</Notice>;
  return (
    <FormShell
      draft={draft}
      title="Competitor velocity — pins/day averaged over 4 months"
      body={
        <div className="space-y-1">
          {snapshot.competitors.map((c) => (
            <div key={c.id} className="flex items-center gap-2 text-xs">
              <span className="w-56 text-neutral-700 shrink-0 truncate">{c.name || c.profile_url}</span>
              <input value={rows[c.profile_url] ?? ""} onChange={(e) => setRows({ ...rows, [c.profile_url]: e.target.value })}
                type="number" step="0.1" min={0}
                className="w-24 rounded border border-neutral-300 px-2 py-1 text-xs tabular-nums" />
              <span className="text-neutral-500 text-[11px]">pins/day</span>
            </div>
          ))}
        </div>
      }
      time={time} setTime={setTime}
      submitLabel="Save velocity"
      onSubmit={() => {
        const entries = Object.entries(rows)
          .filter(([, v]) => v !== "")
          .map(([profile_url, v]) => ({ profile_url, pins_per_day: Number(v) }));
        if (entries.length === 0) throw new Error("enter at least one competitor pins/day");
        return post(orgId, { action: "velocity", entries, time_spent_min: n(time) }).then(onDone);
      }}
    />
  );
}

// ---------- P2.4.2 (frequency) ----------------------------------------------

const PINS_PER_URL = 16;

function FrequencyForm({ orgId, snapshot, onDone }: Props) {
  const daily = snapshot.client_settings?.daily_pin_target ?? 0;
  const monthly = daily * 30;
  const urls = Math.ceil(monthly / PINS_PER_URL);
  const [time, setTime] = useState("");
  return (
    <FormShell
      title="Set frequency — the 16-pin math"
      body={
        <div className="text-xs text-neutral-700 space-y-1">
          <div className="font-mono bg-white border border-neutral-200 rounded p-2 text-[11px]">
            daily_pin_target ({daily}) × 30 days ÷ {PINS_PER_URL} pins/URL
            <br />= {monthly} pins/month ÷ {PINS_PER_URL} = {(monthly / PINS_PER_URL).toFixed(2)}
            <br />→ ceil() = <span className="font-bold text-foreground">{urls} URLs/month</span>
          </div>
          <div className="text-neutral-500 text-[11px]">
            One URL yields 16 pin variants (design × copy). Two per day for a year beats ten per day for a week.
          </div>
          {snapshot.client_settings?.urls_per_month != null && (
            <div className="text-[11px] text-neutral-600">
              Current stored value: <strong>{snapshot.client_settings.urls_per_month}</strong> URLs/month.
            </div>
          )}
        </div>
      }
      time={time} setTime={setTime}
      submitLabel="Compute & save"
      onSubmit={() => post(orgId, { action: "frequency", time_spent_min: n(time) }).then(onDone)}
    />
  );
}

// ---------- shared ----------------------------------------------------------

function FormShell({
  title, body, time, setTime, submitLabel, onSubmit, draft,
}: {
  title: string;
  body: React.ReactNode;
  time: string;
  setTime: (v: string) => void;
  submitLabel: string;
  /** A returned string is shown as the result of the save — what landed and
   *  what is still open — instead of the form going quiet on success. */
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
      // The record now holds it, so the draft has done its job.
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
      {/* The result of a save belongs where the eye already is, not only at
          the bottom of a form that can be several screens long. */}
      {(err || ok) && (
        <div className={`rounded border px-2 py-1.5 text-[11px] ${err
          ? "border-red-300 bg-red-50 text-red-700"
          : "border-emerald-300 bg-emerald-50 text-emerald-800"}`}>
          {err ?? ok}
        </div>
      )}
      {body}
      <div className="flex items-center gap-2 pt-1 border-t border-neutral-200">
        <label className="text-[11px] text-neutral-600 flex items-center gap-1.5">
          Time (min):
          <input type="number" min={1} value={time} onChange={(e) => setTime(e.target.value)}
            className="w-20 rounded-md border border-neutral-300 px-2 py-1 text-xs tabular-nums" placeholder="15" />
        </label>
        <span className="flex-1" />
        {!time && <span className="text-[11px] text-neutral-500 mr-2">Enter the time spent to save.</span>}
        <button onClick={go} disabled={submitting || !time}
          className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 disabled:opacity-50">
          {submitting ? "Saving…" : submitLabel}
        </button>
      </div>
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-muted px-3 py-2 text-xs text-foreground">{children}</div>
  );
}

function n(s: string): number {
  const x = Number(s);
  if (!isFinite(x) || x <= 0) throw new Error("Enter a positive time value.");
  return Math.round(x);
}

async function post(orgId: string, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`/api/organic/phase2/${orgId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    redirect: "error",
  });
  const text = await res.text();
  let data: { error?: string; ok?: boolean } & Record<string, unknown> = {};
  try { data = JSON.parse(text); } catch { /* keep raw */ }
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status} — ${text.slice(0, 160)}`);
  return data;
}


/* ------------------------------------------------------------------ *
 * P2.1.7 · Collect top pin designs
 * ------------------------------------------------------------------ */

interface TopPinRow {
  keyword: string; pin_url: string; title: string; description: string;
  annotations: string; hex_1: string; hex_2: string; hex_3: string;
}
const EMPTY_PIN: TopPinRow = {
  keyword: "", pin_url: "", title: "", description: "",
  annotations: "", hex_1: "", hex_2: "", hex_3: "",
};

/**
 * A repeater, not a note box.
 *
 * The task asks for pin URL, title, description, annotations and colours
 * per keyword — five structured fields — and it was a free-text field, so
 * the material the AI market analysis is supposed to read existed as prose
 * and reached nothing.
 *
 * Annotations are comma-separated on purpose. They come out of PinClicks
 * as a list, and an annotation is research only: it is not a keyword until
 * it passes a volume check, so nothing here writes to the keyword bank.
 */
function TopPinDesignsForm({ orgId, onDone }: Props) {
  const [rows, setRows] = useState<TopPinRow[]>([{ ...EMPTY_PIN }]);
  const [time, setTime] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  // Load on mount, not behind a button. The list used to open on an
  // "Open the pin list" gate, so re-opening the form after a save showed a
  // single empty row and read as if everything typed had been lost.
  const load = useCallback(async () => {
    setLoading(true); setLoadErr(null);
    try {
      const d = await post(orgId, { action: "load_top_pin_designs" }) as {
        rows: Array<{ keyword: string; pin_url: string; title: string | null; description: string | null;
                      annotations: string[]; hex_1: string | null; hex_2: string | null; hex_3: string | null }>;
      };
      setRows(d.rows.length ? d.rows.map((r) => ({
        keyword: r.keyword, pin_url: r.pin_url, title: r.title ?? "", description: r.description ?? "",
        annotations: (r.annotations ?? []).join(", "),
        hex_1: r.hex_1 ?? "", hex_2: r.hex_2 ?? "", hex_3: r.hex_3 ?? "",
      })) : [{ ...EMPTY_PIN }]);
    } catch (e) { setLoadErr((e as Error).message); }
    finally { setLoading(false); }
  }, [orgId]);
  useEffect(() => { void load(); }, [load]);

  const draft = useFormDraft(orgId, "P2.1.7", { rows, time }, (d) => {
    if (Array.isArray(d.rows)) setRows(d.rows as TopPinRow[]);
    if (typeof d.time === "string") setTime(d.time);
  }, { enabled: !loading });

  const set = (i: number, k: keyof TopPinRow, v: string) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  const filled = rows.filter((r) => !blankPin(r));
  // Named here as well as on the server, so the row that is missing
  // something says so before the save is attempted rather than after.
  const incomplete = filled
    .map((r, i) => ({ n: i + 1, r }))
    .filter(({ r }) => !r.keyword.trim() || !r.pin_url.trim());

  if (loading) {
    return <div className="text-xs text-neutral-500">Loading the pin list…</div>;
  }

  return (
    <FormShell
      draft={draft}
      title="Top pin designs per keyword"
      body={
        <div className="space-y-2 text-xs">
          <div className="text-[11px] text-neutral-500">
            Per keyword: the pin, its copy, the annotations PinClicks returned, and the three dominant
            colours from View Page Source. Material for the AI market analysis — an annotation is not a
            keyword until it has a volume.
          </div>
          {loadErr && <div className="text-red-600">Could not load what was saved: {loadErr}</div>}
          {rows.map((r, i) => {
            const missing = !blankPin(r) && (!r.keyword.trim() || !r.pin_url.trim());
            return (
              <div key={i} className={cn("rounded-md border p-2 space-y-1.5",
                missing ? "border-red-300 bg-red-50/50" : "border-neutral-200")}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  <input value={r.keyword} onChange={(e) => set(i, "keyword", e.target.value)}
                         placeholder="Keyword" className="o-input text-xs" />
                  <input value={r.pin_url} onChange={(e) => set(i, "pin_url", e.target.value)}
                         placeholder="https://pinterest.com/pin/…" className="o-input text-xs" />
                </div>
                {missing && (
                  <div className="text-[11px] text-red-600">
                    Both the keyword and the pin URL are needed — this row cannot be saved without them.
                  </div>
                )}
                <input value={r.title} onChange={(e) => set(i, "title", e.target.value)}
                       placeholder="Pin title" className="o-input text-xs" />
                <textarea value={r.description} onChange={(e) => set(i, "description", e.target.value)}
                          rows={2} placeholder="Pin description" className="o-input text-xs" />
                <input value={r.annotations} onChange={(e) => set(i, "annotations", e.target.value)}
                       placeholder="Annotations, comma separated" className="o-input text-xs" />
                <div className="grid grid-cols-3 gap-1.5">
                  {(["hex_1", "hex_2", "hex_3"] as const).map((k, n) => (
                    <input key={k} value={r[k]} onChange={(e) => set(i, k, e.target.value)}
                           placeholder={`Colour ${n + 1}`} className="o-input text-xs" />
                  ))}
                </div>
                {rows.length > 1 && (
                  <button onClick={() => setRows(rows.filter((_, j) => j !== i))}
                          className="text-[11px] text-neutral-500 hover:text-foreground underline underline-offset-2">
                    remove
                  </button>
                )}
              </div>
            );
          })}
          <div className="flex items-center gap-3">
            <button onClick={() => setRows([...rows, { ...EMPTY_PIN }])}
                    className="text-[11px] text-primary hover:underline">+ Add pin</button>
            <span className="text-[11px] text-neutral-500">
              {filled.length} pin{filled.length === 1 ? "" : "s"} to save
              {incomplete.length ? ` · ${incomplete.length} incomplete` : ""}
            </span>
          </div>
        </div>
      }
      time={time} setTime={setTime}
      submitLabel="Save pin designs"
      onSubmit={async () => {
        if (incomplete.length) {
          throw new Error(`Row ${incomplete.map(({ n }) => n).join(", ")} still needs a keyword and a pin URL.`);
        }
        await post(orgId, {
          action: "top_pin_designs",
          time_spent_min: n(time),
          rows: filled.map((r) => ({
            ...r, annotations: r.annotations.split(",").map((x) => x.trim()).filter(Boolean),
          })),
        });
        onDone();
      }}
    />
  );
}

function blankPin(r: TopPinRow): boolean {
  return !Object.values(r).some((v) => v.trim());
}

/* ------------------------------------------------------------------ *
 * P2.3.2 · Read Audience Insights
 * ------------------------------------------------------------------ */

interface AffinityRow { name: string; affinity_index: string; is_surprising: boolean; note: string }
const EMPTY_AFF: AffinityRow = { name: "", affinity_index: "", is_surprising: false, note: "" };

/**
 * The "surprising" box is the point of this task.
 *
 * A predictable affinity confirms what the brand already knew and changes
 * nothing. A surprising correlation is where a content angle comes from,
 * and it is the thing that gets lost when this is a paragraph of notes.
 */
function AudienceAffinitiesForm({ orgId, onDone }: Props) {
  const [rows, setRows] = useState<AffinityRow[]>([{ ...EMPTY_AFF }]);
  const [time, setTime] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setLoadErr(null);
    try {
      const d = await post(orgId, { action: "load_audience_affinities" }) as {
        rows: Array<{ name: string; affinity_index: number | null; is_surprising: boolean; note: string | null }>;
      };
      setRows(d.rows.length ? d.rows.map((r) => ({
        name: r.name, affinity_index: r.affinity_index == null ? "" : String(r.affinity_index),
        is_surprising: r.is_surprising, note: r.note ?? "",
      })) : [{ ...EMPTY_AFF }]);
    } catch (e) { setLoadErr((e as Error).message); }
    finally { setLoading(false); }
  }, [orgId]);
  useEffect(() => { void load(); }, [load]);

  const draft = useFormDraft(orgId, "P2.3.2", { rows, time }, (d) => {
    if (Array.isArray(d.rows)) setRows(d.rows as AffinityRow[]);
    if (typeof d.time === "string") setTime(d.time);
  }, { enabled: !loading });

  const set = (i: number, patch: Partial<AffinityRow>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const filled = rows.filter((r) => !blankAffinity(r));
  const unnamed = filled.map((r, i) => ({ n: i + 1, r })).filter(({ r }) => !r.name.trim());

  if (loading) {
    return <div className="text-xs text-neutral-500">Loading the affinity list…</div>;
  }

  return (
    <FormShell
      draft={draft}
      title="Audience affinities"
      body={
        <div className="space-y-2 text-xs">
          <div className="text-[11px] text-neutral-500">
            Affinities of the engaged audience, from Pinterest Audience Insights. Tick the ones that
            surprised you — those are where the content angles come from.
          </div>
          {loadErr && <div className="text-red-600">Could not load what was saved: {loadErr}</div>}
          {rows.map((r, i) => {
            const missing = !blankAffinity(r) && !r.name.trim();
            return (
              <div key={i} className={cn("grid grid-cols-1 sm:grid-cols-[1fr_5rem_auto_1fr_auto] gap-1.5 items-center",
                missing && "rounded-md ring-1 ring-red-300 bg-red-50/50 p-1")}>
                <input value={r.name} onChange={(e) => set(i, { name: e.target.value })}
                       placeholder={missing ? "Name is required" : "Affinity"} className="o-input text-xs" />
                <input value={r.affinity_index} onChange={(e) => set(i, { affinity_index: e.target.value })}
                       placeholder="Index" className="o-input text-xs" />
                <label className="flex items-center gap-1.5 whitespace-nowrap text-[11px] text-neutral-700">
                  <input type="checkbox" checked={r.is_surprising}
                         onChange={(e) => set(i, { is_surprising: e.target.checked })} />
                  surprising
                </label>
                <input value={r.note} onChange={(e) => set(i, { note: e.target.value })}
                       placeholder="What it suggests" className="o-input text-xs" />
                {rows.length > 1 && (
                  <button onClick={() => setRows(rows.filter((_, j) => j !== i))}
                          className="text-[11px] text-neutral-500 hover:text-foreground">×</button>
                )}
              </div>
            );
          })}
          <div className="flex items-center gap-3">
            <button onClick={() => setRows([...rows, { ...EMPTY_AFF }])}
                    className="text-[11px] text-primary hover:underline">+ Add affinity</button>
            <span className="text-[11px] text-neutral-500">
              {filled.length} to save{unnamed.length ? ` · ${unnamed.length} without a name` : ""}
            </span>
          </div>
        </div>
      }
      time={time} setTime={setTime}
      submitLabel="Save affinities"
      onSubmit={async () => {
        if (unnamed.length) {
          throw new Error(`Row ${unnamed.map(({ n }) => n).join(", ")} still needs a name.`);
        }
        await post(orgId, {
          action: "audience_affinities",
          time_spent_min: n(time),
          rows: filled.map((r) => ({
            name: r.name, is_surprising: r.is_surprising, note: r.note || null,
            affinity_index: r.affinity_index.trim() === "" ? null : Number(r.affinity_index),
          })),
        });
        onDone();
      }}
    />
  );
}

function blankAffinity(r: AffinityRow): boolean {
  return !r.name.trim() && !r.affinity_index.trim() && !r.note.trim() && !r.is_surprising;
}
