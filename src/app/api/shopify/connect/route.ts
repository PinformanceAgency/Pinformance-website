import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encrypt, maskKey } from "@/lib/encryption";
import { ShopifyClient } from "@/lib/shopify/client";
import { KreaClient } from "@/lib/krea/client";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("users")
    .select("org_id, role")
    .eq("id", user.id)
    .single();
  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const body = await request.json();
  const { type } = body;

  if (type === "krea") {
    const { api_key } = body;
    if (!api_key) {
      return NextResponse.json(
        { error: "api_key is required" },
        { status: 400 }
      );
    }

    const client = new KreaClient(api_key);
    const valid = await client.validateKey();
    if (!valid) {
      return NextResponse.json(
        { error: "Invalid kie.ai API key" },
        { status: 400 }
      );
    }

    const encrypted = encrypt(api_key);
    const { error } = await supabase
      .from("organizations")
      .update({
        krea_api_key_encrypted: encrypted,
        onboarding_step: 6,
        updated_at: new Date().toISOString(),
      })
      .eq("id", profile.org_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      masked_key: maskKey(api_key),
    });
  }

  // Default: Shopify connect
  const { domain, access_token } = body;
  if (!domain || !access_token) {
    return NextResponse.json(
      { error: "domain and access_token are required" },
      { status: 400 }
    );
  }

  const client = new ShopifyClient(domain, access_token);
  const valid = await client.validateCredentials();
  if (!valid) {
    return NextResponse.json(
      { error: "Invalid Shopify credentials" },
      { status: 400 }
    );
  }

  const encrypted = encrypt(access_token);
  const { error } = await supabase
    .from("organizations")
    .update({
      shopify_domain: domain,
      shopify_access_token_encrypted: encrypted,
      onboarding_step: 2,
      updated_at: new Date().toISOString(),
    })
    .eq("id", profile.org_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    domain,
    masked_token: maskKey(access_token),
  });
}
