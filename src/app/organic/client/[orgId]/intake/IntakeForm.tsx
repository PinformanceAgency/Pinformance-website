"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AccessRow, IntakeRow } from "@/lib/organic/types";

type Values = {
  // Contact
  contact_name: string;
  contact_email: string;
  contact_preference: string;
  // Business
  business_story: string;
  products_services: string;
  value_proposition: string;
  geo_scale: string;
  target_markets: string;
  ideal_audience: string;
  client_named_competitors: string;
  // Marketing
  current_marketing: string;
  traffic_sources: string;
  social_presence: string;
  available_content: string;
  best_performing_content: string;
  brand_personality: string;
  // Pinterest goals
  existing_pinterest: string;
  primary_goals: string;
  success_measure: string;
  campaigns_to_support: string;
  evergreen_topics: string;
  seasonal_promos: string;
  content_approach: string;
  open_to_ads: "" | "true" | "false";
  // Access
  pinterest_login: boolean;
  pinterest_login_until: string;
  ga4_access: boolean;
  gsc_access: boolean;
  cms_access: boolean;
  cms_platform: string;
  product_feed_url: string;
  access_notes: string;
  // Settings write-through
  niche: string;
  account_created_date: string;
  last_activity_date: string;
  domain: string;
  // Time
  total_time_min: string;
};

const CONTACT_PREF = ["EMAIL", "SLACK", "PHONE", "WHATSAPP"];
const GEO_SCALES = ["LOCAL", "NATIONAL", "EU", "GLOBAL"];
const CMS_PLATFORMS = ["SHOPIFY", "WOOCOMMERCE", "SQUARESPACE", "WEBFLOW", "MAGENTO", "CUSTOM"];
const PRIMARY_GOALS = ["TRAFFIC", "SALES", "AWARENESS", "LEADS", "ENGAGEMENT"];
const CONTENT_APPROACH = ["OWN_ONLY", "AI_ONLY", "MIX"];

function csv(s: string): string[] | null {
  const arr = s.split(",").map((x) => x.trim()).filter(Boolean);
  return arr.length ? arr : null;
}

export function IntakeForm({
  orgId,
  initialIntake,
  initialAccess,
  initialDomain,
}: {
  orgId: string;
  initialIntake: IntakeRow | null;
  initialAccess: AccessRow | null;
  initialDomain: string | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [v, setV] = useState<Values>(() => ({
    contact_name: initialIntake?.contact_name ?? "",
    contact_email: initialIntake?.contact_email ?? "",
    contact_preference: initialIntake?.contact_preference ?? "",
    business_story: initialIntake?.business_story ?? "",
    products_services: initialIntake?.products_services ?? "",
    value_proposition: initialIntake?.value_proposition ?? "",
    geo_scale: initialIntake?.geo_scale ?? "",
    target_markets: (initialIntake?.target_markets ?? []).join(", "),
    ideal_audience: initialIntake?.ideal_audience ?? "",
    client_named_competitors: (initialIntake?.client_named_competitors ?? []).join(", "),
    current_marketing: initialIntake?.current_marketing ?? "",
    traffic_sources: initialIntake?.traffic_sources ?? "",
    social_presence: initialIntake?.social_presence ?? "",
    available_content: initialIntake?.available_content ?? "",
    best_performing_content: initialIntake?.best_performing_content ?? "",
    brand_personality: initialIntake?.brand_personality ?? "",
    existing_pinterest: initialIntake?.existing_pinterest ?? "",
    primary_goals: (initialIntake?.primary_goals ?? []).join(", "),
    success_measure: initialIntake?.success_measure ?? "",
    campaigns_to_support: initialIntake?.campaigns_to_support ?? "",
    evergreen_topics: (initialIntake?.evergreen_topics ?? []).join(", "),
    seasonal_promos: (initialIntake?.seasonal_promos ?? []).join(", "),
    content_approach: initialIntake?.content_approach ?? "",
    open_to_ads: initialIntake?.open_to_ads == null ? "" : initialIntake.open_to_ads ? "true" : "false",
    pinterest_login: initialAccess?.pinterest_login ?? false,
    pinterest_login_until: initialAccess?.pinterest_login_until ?? "",
    ga4_access: initialAccess?.ga4_access ?? false,
    gsc_access: initialAccess?.gsc_access ?? false,
    cms_access: initialAccess?.cms_access ?? false,
    cms_platform: initialAccess?.cms_platform ?? "",
    product_feed_url: initialAccess?.product_feed_url ?? "",
    access_notes: initialAccess?.notes ?? "",
    niche: initialIntake?.niche ?? "",
    account_created_date: initialIntake?.account_created_date ?? "",
    last_activity_date: initialIntake?.last_activity_date ?? "",
    domain: initialDomain ?? initialIntake?.domain ?? "",
    total_time_min: "",
  }));

  function set<K extends keyof Values>(k: K, val: Values[K]) {
    setV((s) => ({ ...s, [k]: val }));
  }

  async function submit() {
    setErr(null); setOk(null); setSubmitting(true);
    try {
      const totalTime = Number(v.total_time_min);
      if (!(totalTime > 0)) throw new Error("total_time_min (positive) is required.");
      if (v.pinterest_login && !v.pinterest_login_until) {
        throw new Error("Pinterest login end date is required when direct login is granted.");
      }

      const payload = {
        contact_name: v.contact_name || null,
        contact_email: v.contact_email || null,
        contact_preference: v.contact_preference || null,
        business_story: v.business_story || null,
        products_services: v.products_services || null,
        value_proposition: v.value_proposition || null,
        geo_scale: v.geo_scale || null,
        target_markets: csv(v.target_markets),
        ideal_audience: v.ideal_audience || null,
        client_named_competitors: csv(v.client_named_competitors),
        current_marketing: v.current_marketing || null,
        traffic_sources: v.traffic_sources || null,
        social_presence: v.social_presence || null,
        available_content: v.available_content || null,
        best_performing_content: v.best_performing_content || null,
        brand_personality: v.brand_personality || null,
        existing_pinterest: v.existing_pinterest || null,
        primary_goals: csv(v.primary_goals),
        success_measure: v.success_measure || null,
        campaigns_to_support: v.campaigns_to_support || null,
        evergreen_topics: csv(v.evergreen_topics),
        seasonal_promos: csv(v.seasonal_promos),
        content_approach: v.content_approach || null,
        open_to_ads: v.open_to_ads === "" ? null : v.open_to_ads === "true",
        pinterest_login: v.pinterest_login,
        pinterest_login_until: v.pinterest_login_until || null,
        ga4_access: v.ga4_access,
        gsc_access: v.gsc_access,
        cms_access: v.cms_access,
        cms_platform: v.cms_platform || null,
        product_feed_url: v.product_feed_url || null,
        access_notes: v.access_notes || null,
        niche: v.niche || null,
        account_created_date: v.account_created_date || null,
        last_activity_date: v.last_activity_date || null,
        domain: v.domain || null,
        total_time_min: totalTime,
      };

      const res = await fetch(`/api/organic/intake/${orgId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        redirect: "error",
      });
      const text = await res.text();
      let data: { error?: string; recomputed?: number; per_task_min?: number } = {};
      try { data = JSON.parse(text); } catch { /* keep raw */ }
      if (!res.ok) {
        const snippet = text ? text.replace(/\s+/g, " ").slice(0, 160) : "";
        throw new Error(data.error ?? `HTTP ${res.status}${snippet ? ` — ${snippet}` : ""}`);
      }
      setOk(`Saved. ${data.per_task_min ?? 0} min logged per P1.1 task; ${data.recomputed ?? 0} statuses updated.`);
      startTransition(() => router.refresh());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      {err && <Banner tone="err">{err}</Banner>}
      {ok && <Banner tone="ok">{ok}</Banner>}

      <Section title="Contact (P1.1.1)">
        <Grid>
          <Field label="Contact name"><Text v={v.contact_name} on={(x) => set("contact_name", x)} /></Field>
          <Field label="Contact email"><Text v={v.contact_email} on={(x) => set("contact_email", x)} type="email" /></Field>
          <Field label="Preference"><Select v={v.contact_preference} on={(x) => set("contact_preference", x)} opts={CONTACT_PREF} /></Field>
        </Grid>
      </Section>

      <Section title="Business (P1.1.1)">
        <Grid>
          <Field label="Business story" span={3}><TextArea v={v.business_story} on={(x) => set("business_story", x)} /></Field>
          <Field label="Products / services" span={2}><TextArea v={v.products_services} on={(x) => set("products_services", x)} /></Field>
          <Field label="Value proposition"><TextArea v={v.value_proposition} on={(x) => set("value_proposition", x)} /></Field>
          <Field label="Geo scale"><Select v={v.geo_scale} on={(x) => set("geo_scale", x)} opts={GEO_SCALES} /></Field>
          <Field label="Target markets (comma-sep)"><Text v={v.target_markets} on={(x) => set("target_markets", x)} placeholder="NL, DE, UK" /></Field>
          <Field label="Ideal audience"><Text v={v.ideal_audience} on={(x) => set("ideal_audience", x)} /></Field>
          <Field label="Competitors (comma-sep)" span={3}><Text v={v.client_named_competitors} on={(x) => set("client_named_competitors", x)} /></Field>
        </Grid>
      </Section>

      <Section title="Current marketing">
        <Grid>
          <Field label="Current marketing"><TextArea v={v.current_marketing} on={(x) => set("current_marketing", x)} /></Field>
          <Field label="Traffic sources"><Text v={v.traffic_sources} on={(x) => set("traffic_sources", x)} placeholder="google, meta, tiktok" /></Field>
          <Field label="Social presence"><Text v={v.social_presence} on={(x) => set("social_presence", x)} /></Field>
          <Field label="Available content"><TextArea v={v.available_content} on={(x) => set("available_content", x)} /></Field>
          <Field label="Best-performing content"><TextArea v={v.best_performing_content} on={(x) => set("best_performing_content", x)} /></Field>
          <Field label="Brand personality"><Text v={v.brand_personality} on={(x) => set("brand_personality", x)} /></Field>
        </Grid>
      </Section>

      <Section title="Pinterest goals">
        <Grid>
          <Field label="Existing Pinterest"><Text v={v.existing_pinterest} on={(x) => set("existing_pinterest", x)} placeholder="handle or URL" /></Field>
          <Field label="Primary goals (comma-sep, max 2)"><Text v={v.primary_goals} on={(x) => set("primary_goals", x)} placeholder={PRIMARY_GOALS.join(", ")} /></Field>
          <Field label="Success measure"><Text v={v.success_measure} on={(x) => set("success_measure", x)} /></Field>
          <Field label="Campaigns to support"><Text v={v.campaigns_to_support} on={(x) => set("campaigns_to_support", x)} /></Field>
          <Field label="Evergreen topics (comma-sep)" span={2}><Text v={v.evergreen_topics} on={(x) => set("evergreen_topics", x)} /></Field>
          <Field label="Seasonal promos (comma-sep)" span={2}><Text v={v.seasonal_promos} on={(x) => set("seasonal_promos", x)} /></Field>
          <Field label="Content approach"><Select v={v.content_approach} on={(x) => set("content_approach", x)} opts={CONTENT_APPROACH} /></Field>
          <Field label="Open to ads?"><Select v={v.open_to_ads} on={(x) => set("open_to_ads", x as Values["open_to_ads"])} opts={["true","false"]} /></Field>
        </Grid>
      </Section>

      <Section title="Access (P1.1.2 – P1.1.5, P1.1.11)">
        <Grid>
          <Field label="Pinterest login (P1.1.2)"><Bool v={v.pinterest_login} on={(x) => set("pinterest_login", x)} /></Field>
          <Field label="Login end date (required if granted)">
            <input type="date" value={v.pinterest_login_until} onChange={(e) => set("pinterest_login_until", e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-2 py-1 text-xs" />
          </Field>
          <Field label="GA4 (P1.1.3)"><Bool v={v.ga4_access} on={(x) => set("ga4_access", x)} /></Field>
          <Field label="GSC (P1.1.4)"><Bool v={v.gsc_access} on={(x) => set("gsc_access", x)} /></Field>
          <Field label="CMS access (P1.1.5)"><Bool v={v.cms_access} on={(x) => set("cms_access", x)} /></Field>
          <Field label="CMS platform"><Select v={v.cms_platform} on={(x) => set("cms_platform", x)} opts={CMS_PLATFORMS} /></Field>
          <Field label="Product feed URL (P1.1.11)" span={3}><Text v={v.product_feed_url} on={(x) => set("product_feed_url", x)} placeholder="https://.../feed.xml" /></Field>
          <Field label="Access notes" span={3}><TextArea v={v.access_notes} on={(x) => set("access_notes", x)} /></Field>
        </Grid>
      </Section>

      <Section title="Settings write-through">
        <Grid>
          <Field label="Domain"><Text v={v.domain} on={(x) => set("domain", x)} placeholder="example.com" /></Field>
          <Field label="Niche"><Text v={v.niche} on={(x) => set("niche", x)} placeholder="home decor" /></Field>
          <Field label="Account created date">
            <input type="date" value={v.account_created_date} onChange={(e) => set("account_created_date", e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-2 py-1 text-xs" />
          </Field>
          <Field label="Last activity date">
            <input type="date" value={v.last_activity_date} onChange={(e) => set("last_activity_date", e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-2 py-1 text-xs" />
          </Field>
        </Grid>
        <p className="text-[11px] text-neutral-500 mt-2">
          On save: niche + dates + domain write through to client_settings and account_class is recomputed
          (NEW if the account is under 1 year or silent &gt; 6 months, else ESTABLISHED).
        </p>
      </Section>

      <div className="sticky bottom-0 bg-white border-t border-neutral-200 -mx-6 px-6 py-3 flex items-center gap-3 mt-6">
        <label className="text-xs text-neutral-600 flex items-center gap-2">
          Total time spent (min):
          <input
            type="number" min={1}
            value={v.total_time_min}
            onChange={(e) => set("total_time_min", e.target.value)}
            className="w-24 rounded-md border border-neutral-300 px-2 py-1 text-xs tabular-nums"
            placeholder="60"
          />
        </label>
        <span className="text-[11px] text-neutral-500">
          Distributed across the 11 P1.1 tasks (min 1 min each).
        </span>
        <span className="flex-1" />
        <button
          onClick={submit}
          disabled={submitting || !v.total_time_min}
          className="px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Save intake & complete P1.1"}
        </button>
      </div>
    </div>
  );
}

// --- primitives -------------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-3">{title}</h2>
      {children}
    </section>
  );
}
function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">{children}</div>;
}
function Field({ label, span = 1, children }: { label: string; span?: 1 | 2 | 3; children: React.ReactNode }) {
  const cls = span === 3 ? "sm:col-span-3" : span === 2 ? "sm:col-span-2" : "";
  return (
    <label className={`block text-xs ${cls}`}>
      <span className="block text-neutral-500 mb-1">{label}</span>
      {children}
    </label>
  );
}
function Text({ v, on, placeholder, type = "text" }: { v: string; on: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <input type={type} value={v} onChange={(e) => on(e.target.value)} placeholder={placeholder}
      className="w-full rounded-md border border-neutral-300 px-2 py-1 text-xs" />
  );
}
function TextArea({ v, on }: { v: string; on: (v: string) => void }) {
  return (
    <textarea value={v} onChange={(e) => on(e.target.value)} rows={2}
      className="w-full rounded-md border border-neutral-300 px-2 py-1 text-xs" />
  );
}
function Select({ v, on, opts }: { v: string; on: (v: string) => void; opts: string[] }) {
  return (
    <select value={v} onChange={(e) => on(e.target.value)} className="w-full rounded-md border border-neutral-300 px-2 py-1 text-xs bg-white">
      <option value="">—</option>
      {opts.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}
function Bool({ v, on }: { v: boolean; on: (v: boolean) => void }) {
  return (
    <label className="inline-flex items-center gap-2 text-xs">
      <input type="checkbox" checked={v} onChange={(e) => on(e.target.checked)} />
      <span>{v ? "Yes" : "No"}</span>
    </label>
  );
}
function Banner({ tone, children }: { tone: "ok" | "err"; children: React.ReactNode }) {
  const cls = tone === "ok" ? "border-foreground/20 bg-muted text-foreground" : "border-red-200 bg-red-50 text-red-900";
  return <div className={`rounded-md border px-3 py-2 text-xs ${cls}`} role="alert">{children}</div>;
}
