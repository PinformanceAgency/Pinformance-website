import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encrypt } from "@/lib/encryption";
import { getOrgIdFromProfile } from "@/lib/auth/effective-org";
import type { UserRole } from "@/lib/types";

/**
 * POST /api/shopify/credentials  { api_key, api_secret }
 *
 * Saves this org's own Shopify OAuth app credentials (Client ID + secret) so
 * the store can be connected from inside the Pinformance app — no Vercel env
 * vars needed. Stored per-org; the secret is encrypted at rest. The OAuth flow
 * uses these before falling back to the global env vars.
 *
 * Allowed for agency_admin, client_admin, and store_owner (so the store owner
 * can configure their own store).
 */
export async function POST(request: NextRequest) {
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
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const role = profile.role as UserRole;
  if (role !== "agency_admin" && role !== "client_admin" && role !== "store_owner") {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const orgId = getOrgIdFromProfile(profile);
  if (!orgId) return NextResponse.json({ error: "No org" }, { status: 400 });

  const { api_key, api_secret } = (await request.json()) as {
    api_key?: string;
    api_secret?: string;
  };
  if (!api_key?.trim() || !api_secret?.trim()) {
    return NextResponse.json(
      { error: "Both the API key and API secret are required" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("organizations")
    .update({
      shopify_api_key: api_key.trim(),
      shopify_api_secret_encrypted: encrypt(api_secret.trim()),
      updated_at: new Date().toISOString(),
    })
    .eq("id", orgId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
