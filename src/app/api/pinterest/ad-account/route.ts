import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrgIdFromProfile } from "@/lib/auth/effective-org";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("users")
    .select("org_id, role, active_org_id")
    .eq("id", user.id)
    .single();
  const orgId = getOrgIdFromProfile(profile);
  if (!orgId) return NextResponse.json({ error: "No org" }, { status: 400 });

  const body = (await request.json()) as { ad_account_id?: string | null };
  const adAccountId =
    typeof body.ad_account_id === "string" && /^\d+$/.test(body.ad_account_id)
      ? body.ad_account_id
      : null;

  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organizations")
    .select("settings")
    .eq("id", orgId)
    .single();
  const settings = (org?.settings as Record<string, unknown>) || {};
  if (adAccountId) {
    settings.pinterest_ad_account_id = adAccountId;
  } else {
    delete settings.pinterest_ad_account_id;
  }
  const { error } = await admin
    .from("organizations")
    .update({ settings })
    .eq("id", orgId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, ad_account_id: adAccountId });
}
