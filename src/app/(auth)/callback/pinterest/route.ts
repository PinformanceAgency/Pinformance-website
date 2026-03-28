import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt, encrypt } from "@/lib/encryption";
import { PinterestClient } from "@/lib/pinterest/client";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/onboarding?error=pinterest_missing_params", request.url)
    );
  }

  let orgId: string;
  try {
    orgId = decrypt(state);
  } catch {
    return NextResponse.redirect(
      new URL("/onboarding?error=pinterest_invalid_state", request.url)
    );
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/callback/pinterest`;

  try {
    // Fetch per-org Pinterest credentials
    const admin = createAdminClient();
    const { data: orgData } = await admin
      .from("organizations")
      .select("pinterest_app_id, pinterest_app_secret_encrypted, settings")
      .eq("id", orgId)
      .single();

    let orgAppId: string | undefined;
    let orgAppSecret: string | undefined;
    if (orgData?.pinterest_app_id && orgData?.pinterest_app_secret_encrypted) {
      orgAppId = orgData.pinterest_app_id;
      orgAppSecret = decrypt(orgData.pinterest_app_secret_encrypted);
    }

    // Check if org is on Trial access (needs sandbox API)
    const orgSettings = (orgData?.settings as Record<string, unknown>) || {};
    const isTrial = (orgSettings.pinterest_access_tier as string) === "trial";

    const tokens = await PinterestClient.exchangeCode(code, redirectUri, orgAppId, orgAppSecret, isTrial);

    const client = new PinterestClient(tokens.access_token, isTrial);
    const pinterestUser = await client.getUser();

    const expiresAt = new Date(
      Date.now() + tokens.expires_in * 1000
    ).toISOString();

    const { error } = await admin
      .from("organizations")
      .update({
        pinterest_access_token_encrypted: encrypt(tokens.access_token),
        pinterest_refresh_token_encrypted: encrypt(tokens.refresh_token),
        pinterest_token_expires_at: expiresAt,
        pinterest_user_id: pinterestUser.username,
        onboarding_step: 4,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orgId);

    if (error) {
      return NextResponse.redirect(
        new URL("/onboarding?error=pinterest_save_failed", request.url)
      );
    }

    return NextResponse.redirect(
      new URL("/integrations?pinterest=connected", request.url)
    );
  } catch {
    return NextResponse.redirect(
      new URL("/onboarding?error=pinterest_exchange_failed", request.url)
    );
  }
}
