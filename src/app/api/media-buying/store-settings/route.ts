/**
 * GET /api/media-buying/store-settings
 *
 * Lists every "store" (= org) — Pinterest-connected or not — merged with its
 * store_settings row. The UI shows a badge for each state:
 *   - Not connected (no Pinterest link yet — newly added stores)
 *   - Needs setup (Pinterest linked, but department/BER missing)
 *   - Configured
 *   - Inactive
 *
 * Non-Pinterest stores are still surfaced so the head of media buying can
 * pre-fill department / BER / invoice ROAS / buyer before the Pinterest
 * account is wired up on the Integrations page.
 *
 * Auth:
 *   - agency_admin sees every org.
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

  const rows: StoreSettingsRow[] = (orgs as OrgRow[]).map((o) => {
    const s = settingsByOrg.get(o.id) ?? null;
    const configured =
      s != null && s.department != null && s.breakeven_roas != null;
    return {
      org_id: o.id,
      store_name: o.name,
      ad_account_id:
        s?.ad_account_id ?? o.settings?.pinterest_ad_account_id ?? null,
      pinterest_connected: o.pinterest_user_id != null,
      settings: s,
      configured,
    };
  });

  return NextResponse.json({ stores: rows });
}
