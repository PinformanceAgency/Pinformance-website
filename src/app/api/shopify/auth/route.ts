import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/encryption";
import { getOrgIdFromProfile } from "@/lib/auth/effective-org";

// Read scopes the catalog sync needs. Keep minimal so no Shopify review is
// required (read_orders would need approval for a public app).
const SHOPIFY_SCOPES = "read_products,read_content";

/** Normalise user input into a canonical `*.myshopify.com` domain, or null. */
function normalizeShopDomain(input: string): string | null {
  let shop = input.trim().toLowerCase();
  shop = shop.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!shop) return null;
  if (!shop.includes(".")) shop = `${shop}.myshopify.com`;
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) return null;
  return shop;
}

/**
 * GET /api/shopify/auth?shop=<store>.myshopify.com
 *
 * Starts the Shopify OAuth flow so the store owner can connect their own store
 * by approving scopes (no manual Admin API token needed). Returns the consent
 * URL; the client redirects to it. State carries the encrypted org id + shop so
 * the callback can bind the token to the right org.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("users")
    .select("org_id, role, active_org_id")
    .eq("id", user.id)
    .single();
  const orgId = getOrgIdFromProfile(profile);
  if (!orgId) return NextResponse.json({ error: "No org" }, { status: 400 });

  const apiKey = process.env.SHOPIFY_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Shopify OAuth is not configured (SHOPIFY_API_KEY missing)." },
      { status: 500 }
    );
  }

  const shop = normalizeShopDomain(request.nextUrl.searchParams.get("shop") || "");
  if (!shop) {
    return NextResponse.json(
      { error: "Enter a valid Shopify store domain (e.g. your-store.myshopify.com)." },
      { status: 400 }
    );
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/shopify/callback`;
  // base64url so the value is URL- and HMAC-safe (encrypt() emits base64 + ':').
  const state = Buffer.from(encrypt(`${orgId}|${shop}`)).toString("base64url");

  const params = new URLSearchParams({
    client_id: apiKey,
    scope: SHOPIFY_SCOPES,
    redirect_uri: redirectUri,
    state,
  });

  return NextResponse.json({ url: `https://${shop}/admin/oauth/authorize?${params}` });
}
