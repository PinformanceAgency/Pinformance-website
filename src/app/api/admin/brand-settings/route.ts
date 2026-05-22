/**
 * Brand & SEO settings — read + write for the /settings/brand page.
 *
 * Lets agency_admin and client_admin update their org's brand profile
 * (brand voice, target audience, USPs, colors, fonts, tone/avoid
 * keywords, description) without going through the onboarding flow or
 * needing engineering. Reads/writes brand_profiles + organizations.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrgIdFromProfile } from "@/lib/auth/effective-org";

interface BrandSettingsPayload {
  // organizations
  name?: string;
  // brand_profiles typed columns
  brand_voice?: string;
  target_audience?: string;
  unique_selling_points?: string[];
  color_palette?: string[];
  font_preferences?: string[];
  tone_keywords?: string[];
  avoid_keywords?: string[];
  // raw_data extras
  website?: string;
  industry?: string;
  revenue_range?: string;
  description?: string;
  // SEO templates
  pin_title_template?: string;
  pin_description_template?: string;
  hashtag_library?: string[];
  pillar_topics?: string[];
}

async function getAuthorizedOrgId(): Promise<{ orgId: string; role: string } | NextResponse> {
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
  if (profile.role !== "agency_admin" && profile.role !== "client_admin") {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }
  const orgId = getOrgIdFromProfile(profile);
  if (!orgId) return NextResponse.json({ error: "No org" }, { status: 400 });
  return { orgId, role: profile.role };
}

export async function GET() {
  const result = await getAuthorizedOrgId();
  if (result instanceof NextResponse) return result;
  const { orgId } = result;
  const admin = createAdminClient();
  const [{ data: org }, { data: profile }] = await Promise.all([
    admin.from("organizations").select("name").eq("id", orgId).single(),
    admin.from("brand_profiles").select("*").eq("org_id", orgId).maybeSingle(),
  ]);
  const raw = (profile?.raw_data ?? {}) as Record<string, unknown>;
  return NextResponse.json({
    ok: true,
    name: org?.name ?? "",
    brand_voice: profile?.brand_voice ?? "",
    target_audience: profile?.target_audience ?? "",
    unique_selling_points: profile?.unique_selling_points ?? [],
    color_palette: profile?.color_palette ?? [],
    font_preferences: profile?.font_preferences ?? [],
    tone_keywords: profile?.tone_keywords ?? [],
    avoid_keywords: profile?.avoid_keywords ?? [],
    // raw_data extras (legacy + new)
    website: (raw.website as string) ?? "",
    industry: (raw.industry as string) ?? "",
    revenue_range: (raw.revenue_range as string) ?? "",
    description: (raw.description as string) ?? "",
    // SEO bits
    pin_title_template: (raw.pin_title_template as string) ?? "",
    pin_description_template: (raw.pin_description_template as string) ?? "",
    hashtag_library: (raw.hashtag_library as string[]) ?? [],
    pillar_topics: (raw.pillar_topics as string[]) ?? [],
  });
}

export async function POST(request: NextRequest) {
  const result = await getAuthorizedOrgId();
  if (result instanceof NextResponse) return result;
  const { orgId } = result;
  const body = (await request.json()) as BrandSettingsPayload;
  const admin = createAdminClient();

  // Update organization name when provided.
  if (typeof body.name === "string" && body.name.trim().length > 0) {
    const { error: orgErr } = await admin
      .from("organizations")
      .update({ name: body.name.trim(), updated_at: new Date().toISOString() })
      .eq("id", orgId);
    if (orgErr) {
      return NextResponse.json(
        { error: `Failed to update org name: ${orgErr.message}` },
        { status: 500 }
      );
    }
  }

  // Load the current brand_profiles.raw_data so we merge instead of clobber.
  const { data: current } = await admin
    .from("brand_profiles")
    .select("raw_data")
    .eq("org_id", orgId)
    .maybeSingle();
  const currentRaw = (current?.raw_data ?? {}) as Record<string, unknown>;

  const nextRaw: Record<string, unknown> = { ...currentRaw };
  for (const k of [
    "website",
    "industry",
    "revenue_range",
    "description",
    "pin_title_template",
    "pin_description_template",
    "hashtag_library",
    "pillar_topics",
  ] as const) {
    const v = body[k];
    if (v !== undefined) nextRaw[k] = v;
  }

  const upsertPayload: Record<string, unknown> = {
    org_id: orgId,
    raw_data: nextRaw,
    updated_at: new Date().toISOString(),
  };
  for (const k of [
    "brand_voice",
    "target_audience",
    "unique_selling_points",
    "color_palette",
    "font_preferences",
    "tone_keywords",
    "avoid_keywords",
  ] as const) {
    const v = body[k];
    if (v !== undefined) upsertPayload[k] = v;
  }

  const { error: upsertErr } = await admin
    .from("brand_profiles")
    .upsert(upsertPayload, { onConflict: "org_id" });
  if (upsertErr) {
    return NextResponse.json(
      { error: `Failed to save brand profile: ${upsertErr.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
