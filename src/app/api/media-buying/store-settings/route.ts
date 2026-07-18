/**
 * GET /api/media-buying/store-settings
 *
 * Lists every "store" (= org) with a Pinterest connection, merged with its
 * store_settings row. Orgs that connected Pinterest but never had their
 * settings filled in come back with `settings = null` and `configured = false`
 * so the UI can surface them at the top as "Needs setup".
 *
 * Auth:
 *   - agency_admin sees every org with pinterest_user_id set.
 *   - Other roles see only their own org (via RLS).
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type {
  StoreSettings,
  StoreSettingsRow,
} from "@/lib/media-buying/store-settings-types";

interface OrgRow {
  id: string;
  name: string;
  pinterest_user_id: string | null;
  settings: { pinterest_ad_account_id?: string | null } | null;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // RLS on `organizations` already restricts non-admins to their own org, so
  // this select does the right thing for every role.
  const { data: orgs, error: orgsErr } = await supabase
    .from("organizations")
    .select("id, name, pinterest_user_id, settings")
    .order("name");
  if (orgsErr) {
    return NextResponse.json({ error: orgsErr.message }, { status: 500 });
  }

  const { data: settingsRows, error: settingsErr } = await supabase
    .from("store_settings")
    .select("*");
  if (settingsErr) {
    return NextResponse.json({ error: settingsErr.message }, { status: 500 });
  }

  const settingsByOrg = new Map<string, StoreSettings>(
    (settingsRows ?? []).map((r) => [r.org_id, r as StoreSettings])
  );

  const rows: StoreSettingsRow[] = (orgs as OrgRow[])
    // Only surface orgs that have actually connected Pinterest — otherwise
    // there's no ad account to attach settings to.
    .filter((o) => o.pinterest_user_id != null)
    .map((o) => {
      const s = settingsByOrg.get(o.id) ?? null;
      const configured =
        s != null && s.department != null && s.breakeven_roas != null;
      return {
        org_id: o.id,
        store_name: o.name,
        ad_account_id:
          s?.ad_account_id ?? o.settings?.pinterest_ad_account_id ?? null,
        pinterest_connected: true,
        settings: s,
        configured,
      };
    });

  return NextResponse.json({ stores: rows });
}
