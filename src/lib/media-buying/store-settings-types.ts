import type { Department, ZoneThresholds } from "./config";

/** The store_settings row as it lives in the DB (nullable everywhere except id). */
export interface StoreSettings {
  org_id: string;
  ad_account_id: string | null;
  department: Department | null;
  niche: string | null;
  country: string | null;
  media_buyer: string | null;
  breakeven_roas: number | null;
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
  country?: string | null;
  media_buyer?: string | null;
  breakeven_roas?: number | null;
  zone_thresholds?: Partial<ZoneThresholds> | null;
  is_active?: boolean;
  notes?: string | null;
}
