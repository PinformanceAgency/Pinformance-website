"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { StoreSettings } from "@/lib/organic/workspace";
import { Panel, Label } from "@/components/organic/primitives";
import { cn } from "@/lib/utils";

const ENGAGEMENT = ["PROSPECT", "ONBOARDING", "ACTIVE", "PAUSED", "CHURNED"];
const ACCOUNT_CLASS = ["NEW", "WARM", "ESTABLISHED"];
const CURRENCIES = ["EUR", "USD", "GBP", "CHF"];

type Field =
  | { key: keyof StoreSettings; label: string; kind: "text" | "number" | "date" | "textarea"; hint?: string; step?: string }
  | { key: keyof StoreSettings; label: string; kind: "select"; options: string[]; hint?: string };

const GROUPS: Array<{ title: string; note?: string; fields: Field[] }> = [
  {
    title: "Engagement",
    fields: [
      { key: "engagement_status", label: "Status", kind: "select", options: ENGAGEMENT,
        hint: "Drives which stores appear in agency execution and risk." },
      { key: "niche", label: "Niche", kind: "text" },
      { key: "onboarded_date", label: "Onboarded", kind: "date",
        hint: "Sets tenure, which sets the cohort every portfolio comparison uses." },
      { key: "domain", label: "Domain", kind: "text" },
    ],
  },
  {
    title: "Publishing",
    note: "Changing the target does not reschedule pins that already exist.",
    fields: [
      { key: "account_class", label: "Account class", kind: "select", options: ACCOUNT_CLASS },
      { key: "spacing_hours", label: "Spacing (hours)", kind: "number" },
      { key: "daily_pin_target", label: "Daily pin target", kind: "number" },
      { key: "urls_per_month", label: "URLs per month", kind: "number" },
      { key: "url_cooldown_days", label: "URL cooldown (days)", kind: "number" },
    ],
  },
  {
    title: "Commercials",
    note: "Left blank, margin is not computed at all — never treated as zero.",
    fields: [
      { key: "monthly_retainer", label: "Monthly retainer", kind: "number", step: "0.01" },
      { key: "retainer_currency", label: "Currency", kind: "select", options: CURRENCIES },
      { key: "hourly_cost", label: "Hourly delivery cost", kind: "number", step: "0.01" },
    ],
  },
  {
    title: "Pinterest profile",
    fields: [
      { key: "display_name", label: "Display name", kind: "text" },
      { key: "bio", label: "Bio", kind: "textarea" },
    ],
  },
];

export function SettingsForm({ initial }: { initial: StoreSettings }) {
  const router = useRouter();
  const [form, setForm] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    for (const g of GROUPS) for (const f of g.fields) {
      const v = initial[f.key];
      o[f.key as string] = v == null ? "" : String(v);
    }
    return o;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = GROUPS.some((g) => g.fields.some((f) => {
    const v = initial[f.key];
    return form[f.key as string] !== (v == null ? "" : String(v));
  }));

  async function save() {
    setSaving(true); setError(null); setSaved(false);
    try {
      const res = await fetch(`/api/organic/settings/${initial.org_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
        redirect: "error",
      });
      // Read as text first — an HTML error page would throw inside
      // res.json() and the failure would vanish into a swallowed
      // SyntaxError instead of reaching the screen.
      const text = await res.text();
      let data: { error?: string } = {};
      try { data = JSON.parse(text); } catch { /* leave empty */ }
      if (!res.ok) throw new Error(data.error || text.slice(0, 200) || `HTTP ${res.status}`);
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "w-full rounded-md border border-o-hairline-firm bg-o-surface px-2.5 py-1.5 " +
    "text-[length:var(--text-o-body)] text-o-ink " +
    "focus:outline-none focus:border-o-accent/60";

  return (
    <div className="space-y-5">
      {GROUPS.map((g) => (
        <Panel key={g.title} className="px-5 py-5">
          <Label>{g.title}</Label>
          {g.note && (
            <p className="mt-1 text-[length:var(--text-o-label)] text-o-ink-3 leading-relaxed">{g.note}</p>
          )}
          <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
            {g.fields.map((f) => (
              <div key={f.key as string} className={f.kind === "textarea" ? "sm:col-span-2 lg:col-span-3" : ""}>
                <label className="block text-[length:var(--text-o-label)] text-o-ink-2 mb-1">
                  {f.label}
                </label>
                {f.kind === "select" ? (
                  <select
                    className={inputCls}
                    value={form[f.key as string] ?? ""}
                    onChange={(e) => setForm((s) => ({ ...s, [f.key as string]: e.target.value }))}
                  >
                    <option value="">—</option>
                    {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : f.kind === "textarea" ? (
                  <textarea
                    rows={3}
                    className={inputCls}
                    value={form[f.key as string] ?? ""}
                    onChange={(e) => setForm((s) => ({ ...s, [f.key as string]: e.target.value }))}
                  />
                ) : (
                  <input
                    type={f.kind === "number" ? "number" : f.kind === "date" ? "date" : "text"}
                    step={"step" in f ? f.step : undefined}
                    className={inputCls}
                    value={form[f.key as string] ?? ""}
                    onChange={(e) => setForm((s) => ({ ...s, [f.key as string]: e.target.value }))}
                  />
                )}
                {"hint" in f && f.hint && (
                  <p className="mt-1 text-[length:var(--text-o-label)] text-o-ink-3 leading-snug">{f.hint}</p>
                )}
              </div>
            ))}
          </div>
        </Panel>
      ))}

      {error && (
        <Panel className="px-5 py-4 border-o-neg/30">
          <p className="text-[length:var(--text-o-body)] text-o-neg">{error}</p>
        </Panel>
      )}

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className={cn(
            "rounded-md px-4 py-2 text-[length:var(--text-o-body)] font-medium transition-colors",
            dirty && !saving
              ? "bg-o-accent text-white hover:bg-o-accent/90"
              : "bg-o-sunk text-o-ink-3 cursor-not-allowed"
          )}
        >
          {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
        </button>
        {saved && !dirty && (
          <span className="text-[length:var(--text-o-body)] text-o-pos">Settings updated.</span>
        )}
      </div>
    </div>
  );
}
