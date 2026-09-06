"use client";

import { useState } from "react";
import { useFormDraft } from "./useFormDraft";
import { DraftHint, DraftBanner } from "./DraftBanner";
import type { TaskRow, ViabilityRow, ViabilityVerdict } from "@/lib/organic/types";

/**
 * The signals still asked, and only those.
 *
 * The columns for the retired ones stay on organic.client_viability — a
 * store assessed under the old set was genuinely assessed and its answers
 * are part of that record. They are simply no longer put to anyone.
 * Kept in step with the checklists in task-fields.ts: the same question
 * appearing in one place and not the other is how two people end up
 * scoring the same store differently.
 */
const GOOD_FIT_FIELDS: { key: keyof ViabilityRow; label: string }[] = [
  { key: "more_than_5_products", label: "More than 5 products or ideas" },
  { key: "url_volume", label: "Sufficient URL volume (target > 20)" },
  { key: "existing_assets", label: "Existing visual assets available" },
];

const RED_FLAG_FIELDS: { key: keyof ViabilityRow; label: string }[] = [
  { key: "rf_single_landing", label: "Single landing page site" },
  { key: "rf_restricted_niche", label: "Restricted / sensitive niche" },
];

interface FormBaseProps {
  orgId: string;
  task: TaskRow;
  viability: ViabilityRow | null;
  onDone: () => void;
}

/** Router — returns the right form for a given task_id, or null when there
 *  isn't a custom form and the generic complete-with-time flow should be used. */
export function TaskFormFor(props: FormBaseProps): React.ReactNode {
  const id = props.task.task_id;
  if (id === "P1.0.1") return <GoodFitForm {...props} />;
  if (id === "P1.0.2") return <RedFlagForm {...props} />;
  if (id === "P1.0.3") return <SitemapCountForm {...props} />;
  if (id === "P1.0.4") return <VerdictForm {...props} />;
  if (id === "P1.2.13") return <AnalyticsBaselineForm {...props} />;
  return null;
}

// --- P1.0.1 -----------------------------------------------------------------

function GoodFitForm({ orgId, task, viability, onDone }: FormBaseProps) {
  const [state, setState] = useState(() =>
    Object.fromEntries(GOOD_FIT_FIELDS.map((f) => [f.key, !!viability?.[f.key]])) as Record<string, boolean>
  );
  const [time, setTime] = useState("");
  return (
    <FormShell
      title="Good-fit signals"
      time={time}
      setTime={setTime}
      submitLabel={task.status === "DONE" ? "Update" : "Save & mark done"}
      body={
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {GOOD_FIT_FIELDS.map((f) => (
            <label key={f.key} className="flex items-start gap-2 text-xs text-neutral-800 cursor-pointer">
              <input
                type="checkbox"
                checked={state[f.key as string]}
                onChange={(e) => setState({ ...state, [f.key]: e.target.checked })}
                className="mt-0.5"
              />
              <span>{f.label}</span>
            </label>
          ))}
          <div className="text-[11px] text-neutral-500 col-span-full mt-1">
            More boxes ticked = stronger fit. {Object.values(state).filter(Boolean).length}/{GOOD_FIT_FIELDS.length} ticked.
          </div>
        </div>
      }
      onSubmit={async () => {
        await postSection(orgId, "good_fit", { ...state, time_spent_min: parseTime(time) });
        onDone();
      }}
    />
  );
}

// --- P1.0.2 -----------------------------------------------------------------

function RedFlagForm({ orgId, task, viability, onDone }: FormBaseProps) {
  const [state, setState] = useState(() =>
    Object.fromEntries(RED_FLAG_FIELDS.map((f) => [f.key, !!viability?.[f.key]])) as Record<string, boolean>
  );
  const [time, setTime] = useState("");
  return (
    <FormShell
      title="Red-flag signals"
      time={time}
      setTime={setTime}
      submitLabel={task.status === "DONE" ? "Update" : "Save & mark done"}
      body={
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {RED_FLAG_FIELDS.map((f) => (
            <label key={f.key} className="flex items-start gap-2 text-xs text-neutral-800 cursor-pointer">
              <input
                type="checkbox"
                checked={state[f.key as string]}
                onChange={(e) => setState({ ...state, [f.key]: e.target.checked })}
                className="mt-0.5"
              />
              <span>{f.label}</span>
            </label>
          ))}
          <div className="text-[11px] text-neutral-500 col-span-full mt-1">
            One red flag is not fatal, both together are. {Object.values(state).filter(Boolean).length}/{RED_FLAG_FIELDS.length} flagged.
          </div>
        </div>
      }
      onSubmit={async () => {
        await postSection(orgId, "red_flags", { ...state, time_spent_min: parseTime(time) });
        onDone();
      }}
    />
  );
}

// --- P1.0.3 -----------------------------------------------------------------

function SitemapCountForm({ orgId, viability, onDone }: FormBaseProps) {
  const [domain, setDomain] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ total: number; under: boolean } | null>(
    viability?.total_urls_found != null
      ? { total: viability.total_urls_found, under: viability.total_urls_found < 10 }
      : null
  );
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    if (!domain.trim()) { setErr("Enter a domain first."); return; }
    setErr(null);
    setRunning(true);
    try {
      const res = await fetch(`/api/organic/viability/${orgId}/count-urls`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ domain, time_spent_min: 1 }),
        redirect: "error",
      });
      const text = await res.text();
      let data: { total_urls_found?: number; under_threshold?: boolean; error?: string } = {};
      try { data = JSON.parse(text); } catch { /* keep text */ }
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status} — ${text.slice(0, 120)}`);
      setResult({ total: data.total_urls_found ?? 0, under: !!data.under_threshold });
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-2 text-xs">
      <label className="block">
        <span className="text-neutral-600">Domain</span>
        <input
          type="text"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="example.com"
          className="mt-1 w-full max-w-md rounded-md border border-neutral-300 px-2 py-1"
        />
      </label>
      <button
        onClick={run}
        disabled={running}
        className="px-3 py-1.5 rounded-md bg-neutral-900 text-white font-medium hover:bg-neutral-800 disabled:opacity-50"
      >
        {running ? "Fetching sitemap…" : "Count URLs from sitemap"}
      </button>
      {result && (
        <div className={`rounded-md border px-3 py-2 text-xs ${result.under ? "bg-red-50 border-red-200 text-red-800" : "bg-foreground border-foreground text-white"}`}>
          <span className="font-semibold">{result.total} URLs</span> found in sitemap
          {result.under ? " — under 10 is a red flag." : "."}
        </div>
      )}
      {err && <div className="text-red-600">{err}</div>}
      <SitemapUrlList orgId={orgId} />
    </div>
  );
}

/**
 * The list itself, not only how many there were.
 *
 * P1.0.3 counted the sitemap and threw the URLs away, so every later task
 * that says "the URL pool from P1.0.3" pointed at something that did not
 * exist yet — reported on the flow test as "point 2 talks about the sitemap,
 * but the sitemap itself is missing at this step" (06-09-2026).
 *
 * It runs the same import phase 4 uses (`import_sitemap` proposes,
 * `accept_urls` writes through upsertUrl), so there is no second, laxer path
 * into the pool: locale variants are folded, shorteners refused, types
 * classified. Importing here rather than in phase 4 only means it happens
 * earlier — the pool dedupes, so a later import adds what is new.
 */
function SitemapUrlList({ orgId }: { orgId: string }) {
  const [state, setState] = useState<{
    proposals: Array<{ url: string; name: string; type: string; reason: string }>;
    scanned: number; pinnable: number; folded: number; source: string;
  } | null>(null);
  const [busy, setBusy] = useState<"fetch" | "add" | null>(null);
  const [added, setAdded] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function call(body: Record<string, unknown>) {
    const res = await fetch(`/api/organic/phase4/${orgId}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await res.json() as Record<string, unknown> & { error?: string };
    if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
    return j;
  }

  async function fetchList() {
    setBusy("fetch"); setErr(null); setAdded(null);
    try {
      const j = await call({ action: "import_sitemap" }) as {
        proposals: Array<{ url: string; name: string; type: string; reason: string }>;
        scanned: number; pinnable: number; locale_variants_folded: number; source: string;
      };
      setState({
        proposals: j.proposals ?? [], scanned: j.scanned, pinnable: j.pinnable,
        folded: j.locale_variants_folded, source: j.source,
      });
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(null); }
  }

  async function addAll() {
    if (!state) return;
    setBusy("add"); setErr(null);
    try {
      const j = await call({
        action: "accept_urls",
        urls: state.proposals.map(({ url, name, type, reason }) => ({ url, name, type, reason })),
      }) as { added: number; errors: Array<{ url: string; message: string }> };
      setAdded(j.added);
      if (j.errors?.length) setErr(`${j.errors.length} URL(s) were refused: ${j.errors[0].message}`);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(null); }
  }

  return (
    <div className="rounded-md border border-border bg-muted/30 p-2 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={fetchList} disabled={busy !== null}
          className="o-btn text-xs disabled:opacity-50">
          {busy === "fetch" ? "Reading the sitemap…" : "Show the URL list"}
        </button>
        <span className="text-[11px] text-muted-foreground">
          The count answers the viability question; the list is what phase 4 later selects from.
        </span>
      </div>
      {state && (
        <>
          <div className="text-[11px] text-neutral-600">
            {state.pinnable.toLocaleString("en-US")} pinnable of {state.scanned.toLocaleString("en-US")} scanned
            {state.folded > 0 && <> · {state.folded} locale variant(s) folded into their main URL</>}
            {state.source && <> · {state.source}</>}
          </div>
          <div className="max-h-48 overflow-y-auto rounded border border-border bg-card divide-y divide-neutral-100">
            {state.proposals.slice(0, 200).map((p) => (
              <div key={p.url} className="flex items-center gap-2 px-2 py-1 text-[11px]">
                <span className="w-20 shrink-0 text-neutral-500">{p.type}</span>
                <span className="truncate text-neutral-700">{p.url}</span>
              </div>
            ))}
            {state.proposals.length === 0 && (
              <div className="px-2 py-2 text-[11px] text-neutral-500">
                Nothing pinnable came back. Check the domain on the client settings — the sitemap is read from there.
              </div>
            )}
          </div>
          {state.proposals.length > 0 && (
            <button onClick={addAll} disabled={busy !== null}
              className="o-btn text-xs disabled:opacity-50">
              {busy === "add" ? "Adding…" : `Add these ${state.proposals.length} to the URL pool`}
            </button>
          )}
          {added != null && (
            <div className="text-[11px] text-emerald-700">
              {added} URL(s) in the pool. Already-known URLs keep what was recorded about them.
            </div>
          )}
        </>
      )}
      {err && <div className="text-[11px] text-red-600">{err}</div>}
    </div>
  );
}

// --- P1.0.4 -----------------------------------------------------------------

function VerdictForm({ orgId, task, viability, onDone }: FormBaseProps) {
  const [verdict, setVerdict] = useState<ViabilityVerdict | "">(viability?.verdict ?? "");
  const [rationale, setRationale] = useState(viability?.rationale ?? "");
  const [time, setTime] = useState("");
  return (
    <FormShell
      title="Viability verdict"
      time={time}
      setTime={setTime}
      submitLabel={task.status === "DONE" ? "Update verdict" : "Record verdict & unlock phase 1"}
      body={
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2 text-xs">
            {(["STRONG_FIT","MODERATE_FIT","WEAK_FIT"] as ViabilityVerdict[]).map((v) => (
              <label key={v} className={`flex items-center gap-2 rounded-md border px-2.5 py-1 cursor-pointer ${verdict === v ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-foreground"}`}>
                <input type="radio" name="verdict" value={v} checked={verdict === v} onChange={() => setVerdict(v)} />
                <span className="font-medium">{v.replace("_", " ")}</span>
              </label>
            ))}
          </div>
          <label className="block text-xs">
            <span className="text-neutral-600">Reasoning (required)</span>
            <textarea
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              rows={3}
              placeholder="On weak fit: advise building blog / SEO content first before Pinterest makes sense."
              className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-xs"
            />
          </label>
        </div>
      }
      onSubmit={async () => {
        if (!verdict) throw new Error("Pick a verdict first.");
        if (!rationale.trim()) throw new Error("Enter reasoning first.");
        await postSection(orgId, "verdict", { verdict, rationale, time_spent_min: parseTime(time) });
        onDone();
      }}
    />
  );
}

// --- P1.2.13 -----------------------------------------------------------------

const BASELINE_KPIS = [
  "impressions", "engagements", "engagement_rate",
  "outbound_clicks", "pin_saves", "profile_visits",
  "monthly_views", "followers_start", "followers_end",
  "top_click_pin_clicks", "top_save_pin_saves",
  "audience_top_country_pct", "audience_top_age_bracket",
];

/**
 * P1.2.13 — the three-month baseline every phase-5 figure is measured against.
 *
 * Thirteen empty boxes with the store's Pinterest account connected two
 * screens away is work we were asking somebody to do twice. Five of them come
 * from the API now; the other eight say where they come from instead of
 * looking like something that failed to load.
 */
function AnalyticsBaselineForm({ orgId, task, onDone }: FormBaseProps) {
  const [numbers, setNumbers] = useState<Record<string, string>>({});
  const [time, setTime] = useState("");
  const [pulling, setPulling] = useState(false);
  const [pullErr, setPullErr] = useState<string | null>(null);
  const [pulled, setPulled] = useState<{ from: string; to: string; keys: string[]; manual: Record<string, string> } | null>(null);
  const draft = useFormDraft(orgId, "P1.2.13", { numbers }, (d) => {
    if (d.numbers && typeof d.numbers === "object") {
      setNumbers((cur) => ({ ...cur, ...(d.numbers as Record<string, string>) }));
    }
  });

  async function pull() {
    setPulling(true); setPullErr(null);
    try {
      const res = await fetch(`/api/organic/baseline/${orgId}`, { method: "POST" });
      const j = await res.json() as {
        error?: string; measured_from: string; measured_to: string;
        values: Record<string, number>; manual: Array<{ key: string; reason: string }>;
      };
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      // Fill what is empty; never overwrite a figure somebody typed.
      setNumbers((cur) => {
        const next = { ...cur };
        for (const [k, v] of Object.entries(j.values)) {
          if (!next[k]) next[k] = String(v);
        }
        return next;
      });
      setPulled({
        from: j.measured_from, to: j.measured_to,
        keys: Object.keys(j.values),
        manual: Object.fromEntries(j.manual.map((m) => [m.key, m.reason])),
      });
    } catch (e) { setPullErr((e as Error).message); }
    finally { setPulling(false); }
  }

  return (
    <FormShell
      draft={draft}
      title="Thirteen KPIs — three-month baseline"
      time={time}
      setTime={setTime}
      submitLabel={task.status === "DONE" ? "Update" : "Save & mark done"}
      body={
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={pull} disabled={pulling}
              className="o-btn text-xs disabled:opacity-50">
              {pulling ? "Asking Pinterest…" : "Load what Pinterest knows"}
            </button>
            <span className="text-[11px] text-muted-foreground">
              Fills impressions, engagements, engagement rate, outbound clicks, saves and follower count. Never overwrites a box you already filled in.
            </span>
          </div>
          {pullErr && <div className="text-xs text-red-600">{pullErr}</div>}
          {pulled && (
            <div className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1.5 text-[11px] text-emerald-900">
              Loaded {pulled.from} → {pulled.to}. That is 90 days, not three months: Pinterest
              refuses anything older on this endpoint, so the last month of a true three-month
              baseline has to come off the Pinterest screen by hand if you need it. The API also
              applies the organic filter but has no claimed-domain filter, so these can sit slightly
              above what the screen shows with the task&apos;s own filters — check before saving.
              Follower count is today&apos;s; Pinterest keeps no history, so followers at the start
              stays manual.
            </div>
          )}
          <div className="text-[11px] text-neutral-500">
            Filters in Pinterest analytics: Organic, Claimed Domain, Your Pins. Untick realtime.
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {BASELINE_KPIS.map((k) => (
              <label key={k} className="text-[11px] text-neutral-700">
                <span className="block text-neutral-500 mb-0.5">
                  {k.replace(/_/g, " ")}
                  {pulled?.keys.includes(k) && <span className="text-emerald-700"> · from Pinterest</span>}
                </span>
                <input
                  type="text"
                  value={numbers[k] ?? ""}
                  onChange={(e) => setNumbers({ ...numbers, [k]: e.target.value })}
                  className="w-full rounded-md border border-neutral-300 px-2 py-1 text-xs tabular-nums"
                />
                {pulled?.manual[k] && (
                  <span className="block text-[10px] text-neutral-400 mt-0.5">{pulled.manual[k]}</span>
                )}
              </label>
            ))}
          </div>
        </div>
      }
      onSubmit={async () => {
        const filled = Object.entries(numbers).filter(([, v]) => v);
        // Submitting nothing used to close the task and write a note that was
        // only its own header. Phase 5 reads that note as the baseline, so the
        // store ended up DONE on "record the baseline" with no baseline at all.
        if (filled.length === 0) {
          throw new Error("Fill in at least one KPI — this task is the baseline every phase-5 figure is measured against.");
        }
        const notes = "Baseline KPIs (3mo):\n" +
          filled.map(([k, v]) => `  ${k}: ${v}`).join("\n");
        // Complete via generic status PATCH — this is note-only; phase 5
        // parses the note into organic.baseline_kpis when it first needs it.
        await genericComplete(task.client_task_id, parseTime(time), notes);
        await draft.clear();
        onDone();
      }}
    />
  );
}

// --- shared shell + helpers -------------------------------------------------

function FormShell({
  title, body, submitLabel, onSubmit, draft,
}: {
  title: string;
  body: React.ReactNode;
  /** Kept in the signature so the many call sites still compile; the
   *  field itself is gone. Time on task was mandatory to submit and told
   *  us nothing anyone acts on, so it stood between a manager and
   *  recording the work. */
  time?: string;
  setTime?: (v: string) => void;
  submitLabel: string;
  onSubmit: () => Promise<void>;
  draft?: import("./useFormDraft").FormDraft;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function go() {
    setErr(null);
    setSubmitting(true);
    try { await onSubmit(); }
    catch (e) { setErr((e as Error).message); }
    finally { setSubmitting(false); }
  }
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{title}</div>
        <span className="flex-1" />
        <DraftHint draft={draft} />
      </div>
      {draft?.restoredAt && <DraftBanner draft={draft} />}
      {body}
      <div className="flex items-center gap-2 pt-3 border-t border-border">
        {err && <span className="text-sm text-red-600 mr-2 break-words max-w-md">{err}</span>}
        <span className="flex-1" />
        <button
          onClick={go}
          disabled={submitting}
          className="o-btn o-btn-primary"
        >
          {submitting ? "Saving…" : submitLabel}
        </button>
      </div>
    </div>
  );
}

/** No longer collected. Returns 0 so the existing callers keep their
 *  shape; the API treats a falsy value as "not recorded" and leaves the
 *  column alone. */
function parseTime(_s: string): number {
  return 0;
}

async function postSection(orgId: string, section: string, payload: Record<string, unknown>) {
  const res = await fetch(`/api/organic/viability/${orgId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ section, ...payload }),
    redirect: "error",
  });
  const text = await res.text();
  let data: { error?: string } = {};
  try { data = JSON.parse(text); } catch { /* keep raw */ }
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status} — ${text.slice(0, 140)}`);
}

async function genericComplete(clientTaskId: string, timeSpentMin: number, notes: string) {
  const res = await fetch(`/api/organic/tasks/${clientTaskId}/status`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: "DONE", time_spent_min: timeSpentMin, notes }),
    redirect: "error",
  });
  const text = await res.text();
  let data: { error?: string } = {};
  try { data = JSON.parse(text); } catch { /* keep raw */ }
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status} — ${text.slice(0, 140)}`);
}
