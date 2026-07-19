import type { AttributionWindow, Department, ZoneThresholds } from "./config";

/** The store_settings row as it lives in the DB (nullable everywhere except id). */
export interface StoreSettings {
  org_id: string;
  ad_account_id: string | null;
  department: Department | null;
  niche: string | null;
  /** @deprecated Use `countries` (multi). Kept as a mirror of `countries[0]`
   *  for backwards compatibility with older filter code paths. */
  country: string | null;
  /** All countries this store runs in — source of truth going forward. */
  countries: string[] | null;
  media_buyer: string | null;
  breakeven_roas: number | null;
  /** ROAS at which the store is "green" (usually higher than BER because it
   *  covers COGS/fees, not just ad spend). Null → falls back to
   *  BER × green_ratio for backwards compatibility. */
  invoice_roas: number | null;
  /** Pinterest attribution setting this store's numbers are measured with. */
  attribution_setting: AttributionWindow | null;
  zone_thresholds: Partial<ZoneThresholds> | null;
  is_active: boolean;
  notes: string | null;
  configured_at: string | null;
  created_at: string;
  updated_at: string;
}

/** One row as returned by GET /api/media-buying/store-settings — a store
 *  (organization) merged with its settings, plus derived flags for the UI. */
export interface StoreSettingsRow {
  org_id: string;
  store_name: string;
  ad_account_id: string | null;
  pinterest_connected: boolean;
  settings: StoreSettings | null;
  /** True when department AND breakeven_roas are set — the two fields
   *  required before the zone engine will look at this store. */
  configured: boolean;
}

/** Payload accepted by PUT /api/media-buying/store-settings/[orgId]. */
export interface StoreSettingsUpsertInput {
  department?: Department | null;
  niche?: string | null;
  /** @deprecated single-country writes are still accepted but callers should
   *  prefer `countries` for stores that run in multiple markets. */
  country?: string | null;
  countries?: string[] | null;
  media_buyer?: string | null;
  breakeven_roas?: number | null;
  invoice_roas?: number | null;
  attribution_setting?: AttributionWindow | null;
  zone_thresholds?: Partial<ZoneThresholds> | null;
  is_active?: boolean;
  notes?: string | null;
}
