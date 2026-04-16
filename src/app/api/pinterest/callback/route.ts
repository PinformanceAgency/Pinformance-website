import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt, encrypt } from "@/lib/encryption";
import { PinterestClient } from "@/lib/pinterest/client";

export async function POST(request: NextRequest) {
  try {
    const { code, state } = await request.json();

    if (!code || !state) {
      return NextResponse.json({ error: "Missing code or state" }, { status: 400 });
    }

    // Decrypt state to get org_id
    const orgId = decrypt(state);

    // Fetch per-org Pinterest credentials if available
    const admin = createAdminClient();
    const { data: orgData } = await admin
      .from("organizations")
      .select("pinterest_app_id, pinterest_app_secret_encrypted")
      .eq("id", orgId)
      .single();

    let orgAppId: string | undefined;
    let orgAppSecret: string | undefined;
    if (orgData?.pinterest_app_id && orgData?.pinterest_app_secret_encrypted) {
      orgAppId = orgData.pinterest_app_id;
      orgAppSecret = decrypt(orgData.pinterest_app_secret_encrypted);
    }

    // Exchange code for tokens
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/callback/pinterest`;
    const tokens = await PinterestClient.exchangeCode(code, redirectUri, orgAppId, orgAppSecret);

    // Get Pinterest user info
    const client = new PinterestClient(tokens.access_token);
    const pinterestUser = await client.getUser();

    // Store encrypted tokens in database
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    // Log what scopes Pinterest actually granted
    console.log(`Pinterest OAuth: org=${orgId} granted_scopes="${tokens.scope}"`);

    const { error: updateError } = await admin
      .from("organizations")
      .update({
        pinterest_user_id: pinterestUser.username || pinterestUser.id,
        pinterest_access_token_encrypted: encrypt(tokens.access_token),
        pinterest_refresh_token_encrypted: encrypt(tokens.refresh_token),
        pinterest_token_expires_at: expiresAt,
        pinterest_token_scopes: tokens.scope || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orgId);

    if (updateError) {
      throw new Error(`Failed to save tokens: ${updateError.message}`);
    }

    return NextResponse.json({
      success: true,
      pinterest_user: pinterestUser.username || pinterestUser.id,
    });
  } catch (err) {
    console.error("Pinterest callback error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
