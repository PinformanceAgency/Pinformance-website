"use client";

import { useState } from "react";
import type { TaskRow, ViabilityRow, ViabilityVerdict } from "@/lib/organic/types";

const GOOD_FIT_FIELDS: { key: keyof ViabilityRow; label: string }[] = [
  { key: "visual_first", label: "Visual product (photogenic and inspiring)" },
  { key: "more_than_5_products", label: "More than 5 products or ideas" },
  { key: "url_volume", label: "Sufficient URL volume (target > 20)" },
  { key: "high_aov", label: "High average order value" },
  { key: "existing_assets", label: "Existing visual assets available" },
  { key: "longterm_mindset", label: "Long-term mindset (Pinterest is 3–6 months)" },
];

const RED_FLAG_FIELDS: { key: keyof ViabilityRow; label: string }[] = [
  { key: "rf_technical_b2b", label: "Technical B2B" },
  { key: "rf_local_only", label: "Local services only" },
  { key: "rf_single_landing", label: "Single landing page site" },
  { key: "rf_needs_sales_now", label: "'Results tomorrow' mindset" },
  { key: "rf_low_effort_ds", label: "Low-effort dropshipping" },
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
      title="Six good-fit signals"
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
            More boxes ticked = stronger fit. {Object.values(state).filter(Boolean).length}/6 ticked.
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
      title="Six red-flag signals"
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
            One red flag is not fatal, several are. {Object.values(state).filter(Boolean).length}/6 flagged.
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

function AnalyticsBaselineForm({ orgId, task, onDone }: FormBaseProps) {
  const [numbers, setNumbers] = useState<Record<string, string>>({});
  const [time, setTime] = useState("");
  const kpis = [
    "impressions", "engagements", "engagement_rate",
    "outbound_clicks", "pin_saves", "profile_visits",
    "monthly_views", "followers_start", "followers_end",
    "top_click_pin_clicks", "top_save_pin_saves",
    "audience_top_country_pct", "audience_top_age_bracket",
  ];
  return (
    <FormShell
      title="Thirteen KPIs — three-month baseline"
      time={time}
      setTime={setTime}
      submitLabel={task.status === "DONE" ? "Update" : "Save & mark done"}
      body={
        <div className="space-y-2">
          <div className="text-[11px] text-neutral-500">
            Filters in Pinterest analytics: Organic, Claimed Domain, Your Pins. Untick realtime.
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {kpis.map((k) => (
              <label key={k} className="text-[11px] text-neutral-700">
                <span className="block text-neutral-500 mb-0.5">{k.replace(/_/g, " ")}</span>
                <input
                  type="text"
                  value={numbers[k] ?? ""}
                  onChange={(e) => setNumbers({ ...numbers, [k]: e.target.value })}
                  className="w-full rounded-md border border-neutral-300 px-2 py-1 text-xs tabular-nums"
                />
              </label>
            ))}
          </div>
        </div>
      }
      onSubmit={async () => {
        const notes = "Baseline KPIs (3mo):\n" +
          Object.entries(numbers).filter(([, v]) => v).map(([k, v]) => `  ${k}: ${v}`).join("\n");
        // Complete via generic status PATCH — this is note-only, no dedicated table yet.
        await genericComplete(task.client_task_id, parseTime(time), notes);
        onDone();
      }}
    />
  );
}

// --- shared shell + helpers -------------------------------------------------

function FormShell({
  title, body, submitLabel, onSubmit,
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
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{title}</div>
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
