import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Check if user profile already exists
  const { data: existing } = await supabase
    .from("users")
    .select("id")
    .eq("id", authUser.id)
    .single();

  if (existing) {
    return NextResponse.json({ status: "already_exists" });
  }

  // Check for pending invite
  const admin = createAdminClient();
  const { data: invite } = await admin
    .from("org_invites")
    .select("*")
    .eq("email", authUser.email!)
    .single();

  if (!invite) {
    return NextResponse.json(
      { error: "No organization invite found for this email" },
      { status: 404 }
    );
  }

  // Create user profile linked to the invited org
  const { error: insertError } = await admin.from("users").insert({
    id: authUser.id,
    email: authUser.email!,
    full_name:
      authUser.user_metadata?.full_name ||
      authUser.email!.split("@")[0],
    org_id: invite.org_id,
    role: invite.role,
    onboarding_step: 5,
    onboarding_completed_at: new Date().toISOString(),
  });

  if (insertError) {
    return NextResponse.json(
      { error: `Failed to create profile: ${insertError.message}` },
      { status: 500 }
    );
  }

  // Remove used invite
  await admin.from("org_invites").delete().eq("id", invite.id);

  return NextResponse.json({ status: "created", org_id: invite.org_id });
}
