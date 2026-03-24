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

    // Exchange code for tokens
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/callback/pinterest`;
    const tokens = await PinterestClient.exchangeCode(code, redirectUri);

    // Get Pinterest user info
    const client = new PinterestClient(tokens.access_token);
    const pinterestUser = await client.getUser();

    // Store encrypted tokens in database
    const admin = createAdminClient();
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    const { error: updateError } = await admin
      .from("organizations")
      .update({
        pinterest_user_id: pinterestUser.username || pinterestUser.id,
        pinterest_access_token_encrypted: encrypt(tokens.access_token),
        pinterest_refresh_token_encrypted: encrypt(tokens.refresh_token),
        pinterest_token_expires_at: expiresAt,
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
