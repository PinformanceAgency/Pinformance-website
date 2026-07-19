/**
 * PUT /api/media-buying/store-settings/[orgId]
 *
 * Upsert store_settings for a single org. Only agency_admin may write —
 * enforced server-side here (belt) and via RLS (suspenders).
 *
 * The endpoint also caches the org's ad_account_id from organizations.settings
 * into store_settings.ad_account_id so downstream hub queries can filter
 * without joining through the JSON blob.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEPARTMENTS,
  ATTRIBUTION_OPTIONS,
  COUNTRY_OPTIONS,
  type AttributionWindow,
  type Department,
  type ZoneThresholds,
} from "@/lib/media-buying/config";
import type { StoreSettingsUpsertInput } from "@/lib/media-buying/store-settings-types";

function parseZoneThresholds(
  v: unknown
): Partial<ZoneThresholds> | null | undefined {
  if (v === undefined) return undefined; // don't touch
  if (v === null) return null;
  if (typeof v !== "object") return undefined;
  const obj = v as Record<string, unknown>;
  const out: Partial<ZoneThresholds> = {};
  if (typeof obj.orange_ratio === "number") out.orange_ratio = obj.orange_ratio;
  if (typeof obj.green_ratio === "number") out.green_ratio = obj.green_ratio;
  if (typeof obj.min_weekly_revenue === "number")
    out.min_weekly_revenue = obj.min_weekly_revenue;
  return Object.keys(out).length ? out : null;
}

const ATTRIBUTION_VALUES = new Set(ATTRIBUTION_OPTIONS.map((o) => o.value as string));
const COUNTRY_CODES = new Set(COUNTRY_OPTIONS.map((c) => c.code));

function parseInput(body: unknown): StoreSettingsUpsertInput | { error: string } {
  if (!body || typeof body !== "object") return { error: "Invalid body" };
  const b = body as Record<string, unknown>;
  const out: StoreSettingsUpsertInput = {};

  if ("department" in b) {
    const d = b.department;
    if (d === null || d === "") out.department = null;
    else if (typeof d === "string" && (DEPARTMENTS as readonly string[]).includes(d)) {
      out.department = d as Department;
    } else {
      return { error: `Invalid department: ${String(d)}` };
    }
  }
  if ("niche" in b) out.niche = b.niche == null || b.niche === "" ? null : String(b.niche);
  // `countries` is the source of truth; a plain `country` write is still
  // accepted for backwards compatibility and becomes a one-element array.
  if ("countries" in b) {
    const raw = b.countries;
    if (raw === null) {
      out.countries = null;
    } else if (Array.isArray(raw)) {
      const cleaned: string[] = [];
      const seen = new Set<string>();
      for (const item of raw) {
        if (typeof item !== "string") continue;
        const code = item.trim().toUpperCase();
        if (!code || seen.has(code)) continue;
        if (!COUNTRY_CODES.has(code)) {
          return { error: `Invalid country code: ${item}` };
        }
        seen.add(code);
        cleaned.push(code);
      }
      out.countries = cleaned.length ? cleaned : null;
    } else {
      return { error: "countries must be an array of country codes" };
    }
  }
  if ("country" in b) out.country = b.country == null || b.country === "" ? null : String(b.country);
  if ("media_buyer" in b) {
    out.media_buyer = b.media_buyer == null || b.media_buyer === "" ? null : String(b.media_buyer);
  }
  if ("breakeven_roas" in b) {
    const v = b.breakeven_roas;
    if (v === null || v === "") out.breakeven_roas = null;
    else {
      const n = Number(v);
      if (!isFinite(n) || n <= 0) return { error: "breakeven_roas must be > 0" };
      out.breakeven_roas = n;
    }
  }
  if ("invoice_roas" in b) {
    const v = b.invoice_roas;
    if (v === null || v === "") out.invoice_roas = null;
    else {
      const n = Number(v);
      if (!isFinite(n) || n <= 0) return { error: "invoice_roas must be > 0" };
      out.invoice_roas = n;
    }
  }
  if ("attribution_setting" in b) {
    const v = b.attribution_setting;
    if (v === null || v === "") out.attribution_setting = null;
    else if (typeof v === "string" && ATTRIBUTION_VALUES.has(v)) {
      out.attribution_setting = v as AttributionWindow;
    } else {
      return { error: `Invalid attribution_setting: ${String(v)}` };
    }
  }
  if ("zone_thresholds" in b) {
    const z = parseZoneThresholds(b.zone_thresholds);
    if (z !== undefined) out.zone_thresholds = z;
  }
  if ("is_active" in b) out.is_active = Boolean(b.is_active);
  if ("notes" in b) out.notes = b.notes == null || b.notes === "" ? null : String(b.notes);

  return out;
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  if (!orgId || typeof orgId !== "string") {
    return NextResponse.json({ error: "Missing orgId" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role !== "agency_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = parseInput(body);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  // Look up the org's current ad_account_id so we can cache it on the row.
  const admin = createAdminClient();
  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .select("id, settings")
    .eq("id", orgId)
    .single();
  if (orgErr || !org) {
    return NextResponse.json({ error: "Org not found" }, { status: 404 });
  }
  const cachedAdAccountId =
    (org.settings as { pinterest_ad_account_id?: string | null } | null)
      ?.pinterest_ad_account_id ?? null;

  // Keep the singular `country` column in sync with countries[0] so older
  // code paths (deep-dive modal, existing filters) don't need to change in
  // one atomic go. If the caller sent both, `countries` wins.
  const upsertRow: Record<string, unknown> = {
    org_id: orgId,
    ad_account_id: cachedAdAccountId,
    ...parsed,
  };
  if ("countries" in parsed) {
    const arr = parsed.countries;
    upsertRow.country = arr && arr.length > 0 ? arr[0] : null;
  }

  const { data: row, error: upErr } = await admin
    .from("store_settings")
    .upsert(upsertRow, { onConflict: "org_id" })
    .select("*")
    .single();
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ settings: row });
}
