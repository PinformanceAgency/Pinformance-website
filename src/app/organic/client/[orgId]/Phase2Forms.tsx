"use client";

import { useMemo, useState } from "react";
import type { TaskRow } from "@/lib/organic/types";

export interface Phase2Snapshot {
  keywords: string[];
  grid_analyses: GridRow[];
  competitors: CompetitorRow[];
  taste_graph: TasteGraphRow | null;
  market_items: MarketItem[];
  client_settings: { daily_pin_target: number; urls_per_month: number | null } | null;
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

export function Phase2FormFor(p: Props): React.ReactNode {
  switch (p.task.task_id) {
    case "P2.1.1": return <SeedKeywordsForm {...p} />;
    case "P2.1.3": return <GridForm {...p} />;
    case "P2.1.4": return <HexForm {...p} />;
    case "P2.1.5": return <CompetitorsForm {...p} />;
    case "P2.1.6": return <ImportPinsForm {...p} />;
    case "P2.2.1": return <GenerateAIForm {...p} />;
    case "P2.2.2": return <ReviewInsightsForm {...p} />;
    case "P2.3.1": return <TasteGraphForm {...p} />;
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
  const list = text.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
  return (
    <FormShell
      title="Seed keywords (5–10)"
      body={
        <>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5}
            placeholder="one per line — e.g. modern living room&#10;vanity lighting&#10;home decor inspiration"
            className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-xs" />
          <div className="text-[11px] text-neutral-500 mt-1">{list.length}/10 entered · minimum 5.</div>
        </>
      }
      time={time} setTime={setTime}
      submitLabel="Save seed keywords"
      onSubmit={() => post(orgId, { action: "seed_keywords", keywords: list, time_spent_min: n(time) }).then(onDone)}
    />
  );
}

// ---------- P2.1.3 (grid) ---------------------------------------------------

function GridForm({ orgId, snapshot, onDone }: Props) {
  const keywords = snapshot.keywords;
  const seeded = useMemo(() => Object.fromEntries(snapshot.grid_analyses.map((g) => [g.target_keyword, g])), [snapshot.grid_analyses]);
  type Row = {
    fmt_simple_pins: boolean; fmt_infographics: boolean; fmt_video_916: boolean;
    fmt_pure_aesthetic: boolean; fmt_text_heavy: boolean; has_visible_ctas: boolean;
    text_overlay_bucket: string; look_and_feel: string;
  };
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(keywords.map((k) => [k, {
      fmt_simple_pins:    !!seeded[k]?.fmt_simple_pins,
      fmt_infographics:   !!seeded[k]?.fmt_infographics,
      fmt_video_916:      !!seeded[k]?.fmt_video_916,
      fmt_pure_aesthetic: !!seeded[k]?.fmt_pure_aesthetic,
      fmt_text_heavy:     !!seeded[k]?.fmt_text_heavy,
      has_visible_ctas:   !!seeded[k]?.has_visible_ctas,
      text_overlay_bucket: seeded[k]?.text_overlay_bucket ?? "",
      look_and_feel:       seeded[k]?.look_and_feel ?? "",
    }]))
  );
  const [time, setTime] = useState("");
  if (keywords.length === 0) {
    return <Notice>Save seed keywords first (P2.1.1).</Notice>;
  }
  const buckets = ["NONE","MINIMAL","HALF","MOST","ALL"] as const;
  return (
    <FormShell
      title={`Grid record per keyword (${keywords.length})`}
      body={
        <div className="space-y-2">
          {keywords.map((k) => {
            const r = rows[k];
            const setRow = (patch: Partial<Row>) => setRows({ ...rows, [k]: { ...r, ...patch } });
            return (
              <div key={k} className="rounded border border-border bg-card p-2 space-y-1.5">
                <div className="text-xs font-medium text-neutral-800">{k}</div>
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
              </div>
            );
          })}
        </div>
      }
      time={time} setTime={setTime}
      submitLabel="Save grid records"
      onSubmit={() => {
        const records = keywords.map((k) => {
          const r = rows[k];
          if (!r.text_overlay_bucket) throw new Error(`"${k}": pick a text-overlay bucket`);
          return { target_keyword: k, ...r, text_overlay_bucket: r.text_overlay_bucket as "NONE"|"MINIMAL"|"HALF"|"MOST"|"ALL" };
        });
        return post(orgId, { action: "grid_records", records, time_spent_min: n(time) }).then(onDone);
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
  const [rows, setRows] = useState<Record<string, [string, string, string]>>(() =>
    Object.fromEntries(keywords.map((k) => [k, [
      seeded[k]?.hex_1 ?? "",
      seeded[k]?.hex_2 ?? "",
      seeded[k]?.hex_3 ?? "",
    ] as [string, string, string]]))
  );
  const [time, setTime] = useState("");
  if (keywords.length === 0) return <Notice>Save seed keywords first (P2.1.1).</Notice>;

  return (
    <FormShell
      title={`Dominant hex codes per keyword (${keywords.length})`}
      body={
        <div className="space-y-1.5">
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
              </div>
            );
          })}
        </div>
      }
      time={time} setTime={setTime}
      submitLabel="Save hex codes"
      onSubmit={() => {
        const records = keywords.map((k) => {
          const [h1, h2, h3] = rows[k];
          if (![h1, h2, h3].every((h) => HEX_RE.test(h))) {
            throw new Error(`"${k}": three valid hex codes required (6 hex digits each)`);
          }
          return { target_keyword: k, hex_1: h1, hex_2: h2, hex_3: h3 };
        });
        return post(orgId, { action: "hexes", records, time_spent_min: n(time) }).then(onDone);
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
  const set = (i: number, patch: Partial<Row>) => setRows(rows.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  return (
    <FormShell
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

// ---------- P2.1.6 (import CSV) ---------------------------------------------

function ImportPinsForm({ orgId, snapshot, onDone }: Props) {
  const [profile, setProfile] = useState(snapshot.competitors[0]?.profile_url ?? "");
  const [csv, setCsv] = useState("");
  const [time, setTime] = useState("");
  const [result, setResult] = useState<{ imported: number } | null>(null);
  if (snapshot.competitors.length === 0) return <Notice>Save competitors first (P2.1.5).</Notice>;
  return (
    <FormShell
      title="Import PinInspector CSV"
      body={
        <div className="space-y-2">
          <select value={profile} onChange={(e) => setProfile(e.target.value)}
            className="w-full max-w-md rounded border border-neutral-300 px-2 py-1 text-xs bg-white">
            {snapshot.competitors.map((c) => (
              <option key={c.id} value={c.profile_url}>{c.name || c.profile_url}</option>
            ))}
          </select>
          <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={6}
            placeholder="Paste PinInspector CSV export here — first row = column headers."
            className="w-full rounded border border-neutral-300 px-2 py-1 text-[10px] font-mono" />
          {result && (
            <div className="rounded border border-foreground bg-foreground text-white px-2 py-1 text-xs">
              Imported <strong>{result.imported}</strong> rows.
            </div>
          )}
        </div>
      }
      time={time} setTime={setTime}
      submitLabel="Parse & import"
      onSubmit={async () => {
        const r = await post(orgId, { action: "import_pins", profile_url: profile, csv, time_spent_min: n(time) });
        setResult(r as { imported: number });
        onDone();
      }}
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
  const [items, setItems] = useState(snapshot.market_items);
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
    setItems((prev) => prev.map((it) => it.id === id ? { ...it, status, reject_reason: reason ?? null } : it));
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
  const csv = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
  return (
    <FormShell
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
  const [rows, setRows] = useState<Record<string, string>>(() =>
    Object.fromEntries(snapshot.competitors.map((c) => [c.profile_url, c.pins_per_day_4mo?.toString() ?? ""]))
  );
  const [time, setTime] = useState("");
  if (snapshot.competitors.length === 0) return <Notice>Add competitors first (P2.1.5).</Notice>;
  return (
    <FormShell
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
  title, body, time, setTime, submitLabel, onSubmit,
}: {
  title: string;
  body: React.ReactNode;
  time: string;
  setTime: (v: string) => void;
  submitLabel: string;
  onSubmit: () => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function go() {
    setErr(null); setSubmitting(true);
    try { await onSubmit(); }
    catch (e) { setErr((e as Error).message); }
    finally { setSubmitting(false); }
  }
  return (
    <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 space-y-3">
      <div className="text-[11px] font-semibold text-neutral-600 uppercase tracking-wide">{title}</div>
      {body}
      <div className="flex items-center gap-2 pt-1 border-t border-neutral-200">
        <label className="text-[11px] text-neutral-600 flex items-center gap-1.5">
          Time (min):
          <input type="number" min={1} value={time} onChange={(e) => setTime(e.target.value)}
            className="w-20 rounded-md border border-neutral-300 px-2 py-1 text-xs tabular-nums" placeholder="15" />
        </label>
        <span className="flex-1" />
        {err && <span className="text-xs text-red-600 mr-2 break-words max-w-md">{err}</span>}
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
