import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { encrypt, decrypt } from "@/lib/encryption";

/**
 * GET /api/shopify/callback
 *
 * Shopify OAuth redirect target. Verifies the request HMAC, confirms the
 * encrypted state (org id + shop), exchanges the code for a permanent Admin API
 * access token, and stores it encrypted on the org. Redirects back to
 * /integrations with a status flag.
 */
export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  const fail = (reason: string) =>
    NextResponse.redirect(new URL(`/integrations?shopify=error&reason=${reason}`, appUrl));

  const sp = request.nextUrl.searchParams;
  const shop = sp.get("shop") || "";
  const code = sp.get("code") || "";
  const hmac = sp.get("hmac") || "";
  const state = sp.get("state") || "";

  const apiKey = process.env.SHOPIFY_API_KEY;
  const apiSecret = process.env.SHOPIFY_API_SECRET;
  if (!apiKey || !apiSecret) return fail("not_configured");
  if (!shop || !code || !hmac || !state) return fail("missing_params");
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) return fail("bad_shop");

  // 1) Verify HMAC: all params except `hmac`/`signature`, sorted, key=value joined by &.
  const message = Array.from(sp.entries())
    .filter(([k]) => k !== "hmac" && k !== "signature")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const digest = crypto.createHmac("sha256", apiSecret).update(message).digest("hex");
  const valid =
    digest.length === hmac.length &&
    crypto.timingSafeEqual(Buffer.from(digest, "utf8"), Buffer.from(hmac, "utf8"));
  if (!valid) return fail("bad_hmac");

  // 2) Decode + verify state (binds this callback to the org that started it).
  let orgId: string;
  try {
    const decoded = decrypt(Buffer.from(state, "base64url").toString("utf8"));
    const [stateOrgId, stateShop] = decoded.split("|");
    if (!stateOrgId || stateShop !== shop) return fail("bad_state");
    orgId = stateOrgId;
  } catch {
    return fail("bad_state");
  }

  // 3) Exchange the code for a permanent Admin API access token.
  let accessToken: string;
  try {
    const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: apiKey, client_secret: apiSecret, code }),
    });
    if (!res.ok) return fail("exchange_failed");
    const json = (await res.json()) as { access_token?: string };
    if (!json.access_token) return fail("exchange_failed");
    accessToken = json.access_token;
  } catch {
    return fail("exchange_failed");
  }

  // 4) Store the connection (encrypted) on the org.
  const admin = createAdminClient();
  const { error } = await admin
    .from("organizations")
    .update({
      shopify_domain: shop,
      shopify_access_token_encrypted: encrypt(accessToken),
      onboarding_step: 2,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orgId);
  if (error) return fail("save_failed");

  return NextResponse.redirect(new URL("/integrations?shopify=connected", appUrl));
}
