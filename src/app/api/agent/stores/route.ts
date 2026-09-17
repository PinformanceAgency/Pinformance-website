/**
 * GET /api/agent/stores — the store book, with the fee model on it.
 *
 * This is the endpoint that answers the question Viktor actually asked for:
 * which model is a store on, what does it invoice at, what is its break-even,
 * and which currency does it bill in. Those four live in three different
 * places in the app, which is why an agent reading tables on its own gets it
 * wrong:
 *
 *  - invoice ROAS, break-even ROAS and the invoicing model are in
 *    `store_settings` (the Store Settings screen),
 *  - the currency is NOT a setting at all — it is whatever the Pinterest ad
 *    account reports, read here from the newest metrics snapshot. The label
 *    on the Monday board is a label: on 31-08-2026 Kateandwendy sat on `$`
 *    while Pinterest was billing it in EUR, and Tola Jewelry **US** bills in
 *    **EUR**. Never infer a currency from a store's name.
 *  - the volume target that belongs to the fee model is neither: it comes
 *    from `scaleFloorFor()`, the same helper the zone engine classifies on,
 *    so what this endpoint reports and what the dashboard paints can never
 *    drift apart.
 *
 * Offboarded stores are excluded unless `?include_inactive=1`. Offboarding
 * here is a soft delete (`store_settings.is_active = false`) and those stores
 * disappear from every other surface, so including them by default would let
 * an agent report on work nobody is doing.
 */
import { NextRequest } from "next/server";
import { organicPool } from "@/lib/organic/db";
import { requireAgentKey, agentJson, agentError, num } from "@/lib/agent/auth";
import {
  scaleFloorFor,
  INVOICING_MODEL_LABELS,
  DEFAULT_ATTRIBUTION_SETTING,
  type InvoicingModel,
  type ZoneThresholds,
} from "@/lib/media-buying/config";

export const runtime = "nodejs";
export const maxDuration = 60;

interface Row {
  org_id: string;
  store: string;
  ad_account_id: string | null;
  department: string | null;
  niche: string | null;
  country: string | null;
  countries: string[] | null;
  media_buyer: string | null;
  breakeven_roas: string | null;
  invoice_roas: string | null;
  invoicing_model: string | null;
  min_monthly_spend: string | null;
  attribution_setting: string | null;
  zone_thresholds: Partial<ZoneThresholds> | null;
  is_active: boolean | null;
  configured_at: string | null;
  notes: string | null;
  currency: string | null;
  last_snapshot: string | null;
}

export async function GET(request: NextRequest) {
  const auth = requireAgentKey(request);
  if (!auth.ok) return auth.response;

  const includeInactive =
    new URL(request.url).searchParams.get("include_inactive") === "1";

  try {
    const pool = organicPool();
    // The organic pool is reused deliberately rather than opening a second
    // one: it talks to the TRANSACTION pooler (:6543), where the client cap
    // is in the hundreds, while the session pooler allows 15 clients for the
    // whole project — shared by every Vercel instance, every cron and every
    // dev machine. A new pool for one read endpoint is exactly the kind of
    // thing that surfaces later as an unrelated 500 on a page that is fine.
    const { rows } = await pool.query<Row>(
      `SELECT o.id::text                       AS org_id,
              o.name                           AS store,
              -- store_settings.ad_account_id is a cache that almost nobody
              -- fills in (2 of 72 rows), and organizations.settings holds it
              -- for 7 more. The snapshot tables are where it actually lives —
              -- same source dashboardLinks() maps ad account to org from.
              COALESCE(s.ad_account_id,
                       o.settings->>'pinterest_ad_account_id',
                       c.ad_account_id) AS ad_account_id,
              s.department, s.niche, s.country, s.countries, s.media_buyer,
              s.breakeven_roas, s.invoice_roas, s.invoicing_model,
              s.min_monthly_spend, s.attribution_setting, s.zone_thresholds,
              s.is_active, s.configured_at::text, s.notes,
              c.currency,
              c.snapshot_date::text            AS last_snapshot
         FROM public.organizations o
         LEFT JOIN public.store_settings s ON s.org_id = o.id
         -- Currency comes from the ad account, and only that table carries
         -- it (pinterest_entity_snapshots does not). Newest row wins; the
         -- 60-day window keeps this off a full scan of ~1.5M rows.
         LEFT JOIN LATERAL (
              SELECT m.currency, m.snapshot_date, m.ad_account_id
                FROM public.pinterest_metrics_snapshots m
               WHERE m.org_id = o.id
                 AND m.currency IS NOT NULL
                 AND m.snapshot_date >= CURRENT_DATE - INTERVAL '60 days'
               ORDER BY m.snapshot_date DESC, m.id DESC
               LIMIT 1
         ) c ON TRUE
        ORDER BY o.name`
    );

    const stores = rows
      .filter((r) => includeInactive || r.is_active !== false)
      .map((r) => {
        const model = (r.invoicing_model as InvoicingModel | null) ?? null;
        const minMonthlySpend = num(r.min_monthly_spend);
        // The volume target that belongs to the fee model, in euros — the
        // full month, never pro-rated, because this is the store's standing
        // target rather than where it stands today. /api/agent/zones carries
        // the pro-rated one for the month in progress.
        const floor = scaleFloorFor({
          invoicingModel: model,
          minMonthlySpend,
          overrides: r.zone_thresholds,
          scaleBasis: "month",
          monthProgress: 1,
        });
        const configured =
          !!r.department && num(r.breakeven_roas) !== null;
        return {
          org_id: r.org_id,
          store: r.store,
          ad_account_id: r.ad_account_id,
          currency: r.currency,
          currency_source: r.currency
            ? `pinterest ad account, as of ${r.last_snapshot}`
            : "unknown — no ad-account snapshot in the last 60 days",
          is_active: r.is_active !== false,
          configured,
          department: r.department,
          niche: r.niche,
          countries: r.countries ?? (r.country ? [r.country] : null),
          media_buyer: r.media_buyer,
          breakeven_roas: num(r.breakeven_roas),
          invoice_roas: num(r.invoice_roas),
          fee_model: {
            model,
            label: model ? INVOICING_MODEL_LABELS[model] : null,
            /** Which figure the volume target applies to. */
            metric: floor.metric,
            /** Full-month target in EUR. Thresholds are always euros. */
            monthly_target_eur: floor.floor_eur,
            min_monthly_spend_eur: minMonthlySpend,
          },
          attribution_setting:
            r.attribution_setting ?? DEFAULT_ATTRIBUTION_SETTING,
          zone_thresholds: r.zone_thresholds,
          configured_at: r.configured_at,
          notes: r.notes,
        };
      });

    return agentJson({
      count: stores.length,
      active_only: !includeInactive,
      stores,
      note:
        "Amounts elsewhere in this API are in each store's own `currency` and are never converted. " +
        "`fee_model.monthly_target_eur` is a threshold, so it is in euros by design.",
    });
  } catch (err) {
    console.error("[agent/stores]", err);
    return agentError(
      err instanceof Error ? err.message : "Could not read the store book",
      500
    );
  }
}
