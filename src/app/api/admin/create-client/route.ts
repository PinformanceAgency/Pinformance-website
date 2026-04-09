import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  // Verify the caller is an agency admin
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", authUser.id)
    .single();

  if (profile?.role !== "agency_admin") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { org_name, org_slug, user_email } = await request.json();

  if (!org_name?.trim() || !org_slug?.trim() || !user_email?.trim()) {
    return NextResponse.json(
      { error: "org_name, org_slug, and user_email are required" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Create organization with onboarding skipped
  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert({
      name: org_name.trim(),
      slug: org_slug.trim(),
      onboarding_step: 5,
      onboarding_completed_at: new Date().toISOString(),
      settings: {
        pins_per_day: 40,
        auto_approve: false,
        timezone: "Europe/Amsterdam",
        posting_hours: [8, 12, 17, 20],
        content_mix: { static: 70, video: 20, carousel: 10 },
        min_post_interval_minutes: 180,
        max_pins_per_day: 5,
        weekend_boost: true,
        pillar_rotation: true,
      },
    })
    .select("id")
    .single();

  if (orgError) {
    return NextResponse.json(
      { error: `Failed to create org: ${orgError.message}` },
      { status: 500 }
    );
  }

  // Create empty brand profile
  await admin.from("brand_profiles").insert({
    org_id: org.id,
    raw_data: {},
  });

  // Create invite so user gets auto-linked on signup
  const { error: inviteError } = await admin.from("org_invites").insert({
    org_id: org.id,
    email: user_email.trim().toLowerCase(),
    role: "client_admin",
  });

  if (inviteError) {
    // If invite fails (e.g. email already invited), still return success for org
    console.warn("Invite creation warning:", inviteError.message);
  }

  return NextResponse.json({
    success: true,
    org_id: org.id,
    message: `Organization "${org_name}" created. User ${user_email} will be auto-linked on signup.`,
  });
}
