/**
 * Intake form — P1.1.1 through P1.1.11.
 *
 * One submit writes:
 *   - organic.client_intake       (structured client info)
 *   - organic.client_access       (Pinterest / GA4 / GSC / CMS)
 *   - organic.client_settings     (niche + account_created_date + last_activity_date
 *                                  + domain; then recompute_account_classes())
 *
 * All 11 P1.1.* tasks are marked DONE with a share of the supplied total
 * time_spent_min (rounded up, min 1 per task — matches the SOP: total time
 * for the intake is what the operator tracks).
 */
import { organicPool } from "./db";
import { completeTaskByDefinition, recomputeAfter } from "./complete";
import { autoLinkAsset } from "./assets-auto";
import type { AccessRow, IntakeRow } from "./types";

export interface IntakePayload {
  // client_intake
  contact_name?: string | null;
  contact_email?: string | null;
  contact_preference?: string | null;
  business_story?: string | null;
  products_services?: string | null;
  value_proposition?: string | null;
  geo_scale?: string | null;
  target_markets?: string[] | null;
  ideal_audience?: string | null;
  client_named_competitors?: string[] | null;
  current_marketing?: string | null;
  traffic_sources?: string | null;
  social_presence?: string | null;
  available_content?: string | null;
  best_performing_content?: string | null;
  brand_personality?: string | null;
  existing_pinterest?: string | null;
  primary_goals?: string[] | null;
  success_measure?: string | null;
  campaigns_to_support?: string | null;
  evergreen_topics?: string[] | null;
  seasonal_promos?: string[] | null;
  content_approach?: string | null;
  open_to_ads?: boolean | null;

  // client_access
  pinterest_login: boolean;
  pinterest_login_until?: string | null; // required when pinterest_login=true
  ga4_access: boolean;
  gsc_access: boolean;
  cms_access: boolean;
  cms_platform?: string | null;
  product_feed_url?: string | null;
  access_notes?: string | null;

  // client_settings write-through
  niche?: string | null;
  account_created_date?: string | null;
  last_activity_date?: string | null;
  domain?: string | null;

  // time tracking — total minutes for the whole intake, distributed across P1.1.*
  total_time_min: number;
}

const P1_1_TASKS = [
  "P1.1.1","P1.1.2","P1.1.3","P1.1.4","P1.1.5","P1.1.6",
  "P1.1.7","P1.1.8","P1.1.9","P1.1.10","P1.1.11",
];

export async function saveIntake(orgId: string, p: IntakePayload) {
  if (!(p.total_time_min > 0)) {
    throw new Error("total_time_min must be positive");
  }
  if (p.pinterest_login && !p.pinterest_login_until) {
    throw new Error("pinterest_login_until (end date) is required when pinterest_login=true");
  }

  const pool = organicPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Upsert intake
    await client.query(
      `INSERT INTO organic.client_intake (
         org_id, contact_name, contact_email, contact_preference,
         business_story, products_services, value_proposition,
         geo_scale, target_markets, ideal_audience,
         client_named_competitors, current_marketing, traffic_sources,
         social_presence, available_content, best_performing_content,
         brand_personality, existing_pinterest, primary_goals,
         success_measure, campaigns_to_support, evergreen_topics,
         seasonal_promos, content_approach, open_to_ads, completed_at
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25, now())
       ON CONFLICT (org_id) DO UPDATE SET
         contact_name = EXCLUDED.contact_name,
         contact_email = EXCLUDED.contact_email,
         contact_preference = EXCLUDED.contact_preference,
         business_story = EXCLUDED.business_story,
         products_services = EXCLUDED.products_services,
         value_proposition = EXCLUDED.value_proposition,
         geo_scale = EXCLUDED.geo_scale,
         target_markets = EXCLUDED.target_markets,
         ideal_audience = EXCLUDED.ideal_audience,
         client_named_competitors = EXCLUDED.client_named_competitors,
         current_marketing = EXCLUDED.current_marketing,
         traffic_sources = EXCLUDED.traffic_sources,
         social_presence = EXCLUDED.social_presence,
         available_content = EXCLUDED.available_content,
         best_performing_content = EXCLUDED.best_performing_content,
         brand_personality = EXCLUDED.brand_personality,
         existing_pinterest = EXCLUDED.existing_pinterest,
         primary_goals = EXCLUDED.primary_goals,
         success_measure = EXCLUDED.success_measure,
         campaigns_to_support = EXCLUDED.campaigns_to_support,
         evergreen_topics = EXCLUDED.evergreen_topics,
         seasonal_promos = EXCLUDED.seasonal_promos,
         content_approach = EXCLUDED.content_approach,
         open_to_ads = EXCLUDED.open_to_ads,
         completed_at = now()`,
      [
        orgId,
        p.contact_name ?? null, p.contact_email ?? null, p.contact_preference ?? null,
        p.business_story ?? null, p.products_services ?? null, p.value_proposition ?? null,
        p.geo_scale ?? null, p.target_markets ?? null, p.ideal_audience ?? null,
        p.client_named_competitors ?? null, p.current_marketing ?? null, p.traffic_sources ?? null,
        p.social_presence ?? null, p.available_content ?? null, p.best_performing_content ?? null,
        p.brand_personality ?? null, p.existing_pinterest ?? null, p.primary_goals ?? null,
        p.success_measure ?? null, p.campaigns_to_support ?? null, p.evergreen_topics ?? null,
        p.seasonal_promos ?? null, p.content_approach ?? null, p.open_to_ads ?? null,
      ]
    );

    // 2. Upsert access
    await client.query(
      `INSERT INTO organic.client_access (
         org_id, pinterest_login, pinterest_login_until,
         ga4_access, gsc_access, cms_access, cms_platform, product_feed_url, notes
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (org_id) DO UPDATE SET
         pinterest_login = EXCLUDED.pinterest_login,
         pinterest_login_until = EXCLUDED.pinterest_login_until,
         ga4_access = EXCLUDED.ga4_access,
         gsc_access = EXCLUDED.gsc_access,
         cms_access = EXCLUDED.cms_access,
         cms_platform = EXCLUDED.cms_platform,
         product_feed_url = EXCLUDED.product_feed_url,
         notes = EXCLUDED.notes`,
      [
        orgId, p.pinterest_login, p.pinterest_login_until ?? null,
        p.ga4_access, p.gsc_access, p.cms_access,
        p.cms_platform ?? null, p.product_feed_url ?? null, p.access_notes ?? null,
      ]
    );

    // 3. Write-through to client_settings
    await client.query(
      `UPDATE organic.client_settings
          SET niche = COALESCE($1, niche),
              account_created_date = COALESCE($2::date, account_created_date),
              last_activity_date   = COALESCE($3::date, last_activity_date),
              domain = COALESCE($4, domain),
              updated_at = now()
        WHERE org_id = $5`,
      [p.niche ?? null, p.account_created_date ?? null, p.last_activity_date ?? null,
       p.domain ?? null, orgId]
    );

    // 4. Recompute account_class from the new dates
    await client.query(`SELECT organic.recompute_account_classes()`);

    // 5. Mark all 11 P1.1.* tasks DONE with a share of the total time
    const perTask = Math.max(1, Math.round(p.total_time_min / P1_1_TASKS.length));
    for (const tid of P1_1_TASKS) {
      // Use the same connection so it's transactional.
      await client.query(
        `UPDATE organic.client_tasks
            SET status = 'DONE'::organic.task_status,
                completed_at = now(),
                started_at = COALESCE(started_at, now()),
                time_spent_min = COALESCE(time_spent_min, $1)
          WHERE org_id = $2 AND task_id = $3 AND status <> 'DONE'`,
        [perTask, orgId, tid]
      );
    }

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  // Auto-capture URL-shaped intake fields as assets, linked to the task
  // that would have collected them. Manual entry stays as a fallback.
  const captured: string[] = [];
  const cap = async (url: string | null | undefined, taskId: string, title: string) => {
    if (!url) return;
    const id = await autoLinkAsset({ orgId, url, taskId, title });
    if (id) captured.push(id);
  };
  await cap(p.product_feed_url, "P1.1.11", "Product feed URL");
  await cap(p.existing_pinterest?.match(/^https?:\/\//) ? p.existing_pinterest! : null,
            "P1.1.5", "Existing Pinterest profile");

  const recomputed = await recomputeAfter(orgId);
  return { ok: true as const, recomputed, per_task_min: Math.max(1, Math.round(p.total_time_min / P1_1_TASKS.length)), assets_captured: captured.length };
}

// ----- read helpers ----------------------------------------------------------

export async function loadIntake(orgId: string): Promise<IntakeRow | null> {
  const r = await organicPool().query<IntakeRow>(
    `SELECT ci.*, cs.niche, cs.account_created_date::text AS account_created_date,
            cs.last_activity_date::text AS last_activity_date, cs.domain
       FROM organic.client_settings cs
       LEFT JOIN organic.client_intake ci ON ci.org_id = cs.org_id
      WHERE cs.org_id = $1`,
    [orgId]
  );
  return r.rows[0] ?? null;
}

export async function loadAccess(orgId: string): Promise<AccessRow | null> {
  const r = await organicPool().query<AccessRow>(
    `SELECT org_id::text, pinterest_login, pinterest_login_until::text AS pinterest_login_until,
            ga4_access, gsc_access, cms_access, cms_platform, product_feed_url, notes
       FROM organic.client_access WHERE org_id = $1`,
    [orgId]
  );
  return r.rows[0] ?? null;
}
