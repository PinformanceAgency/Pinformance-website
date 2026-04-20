import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encrypt, decrypt } from "@/lib/encryption";
import { PinterestClient } from "@/lib/pinterest/client";
import { getOrgIdFromProfile } from "@/lib/auth/effective-org";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("users")
    .select("org_id, role, active_org_id")
    .eq("id", user.id)
    .single();
  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  // Fetch per-org Pinterest credentials if available
  const { data: orgData } = await supabase
    .from("organizations")
    .select("pinterest_app_id, pinterest_app_secret_encrypted")
    .eq("id", getOrgIdFromProfile(profile))
    .single();

  let orgAppId: string | undefined;
  if (orgData?.pinterest_app_id && orgData?.pinterest_app_secret_encrypted) {
    orgAppId = orgData.pinterest_app_id;
  }

  const state = encrypt(getOrgIdFromProfile(profile));
  const url = PinterestClient.getAuthUrl(state, orgAppId);

  return NextResponse.json({ url });
}
