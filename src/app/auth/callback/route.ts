import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/overview";

  if (code) {
    const supabase = await createClient();
    const { error, data } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      // Auto-create user profile if pending invite exists
      const admin = createAdminClient();
      const { data: existing } = await admin
        .from("users")
        .select("id")
        .eq("id", data.user.id)
        .single();

      if (!existing) {
        const { data: invite } = await admin
          .from("org_invites")
          .select("*")
          .eq("email", data.user.email!)
          .single();

        if (invite) {
          await admin.from("users").insert({
            id: data.user.id,
            email: data.user.email!,
            full_name:
              data.user.user_metadata?.full_name ||
              data.user.email!.split("@")[0],
            org_id: invite.org_id,
            role: invite.role,
            onboarding_step: 5,
            onboarding_completed_at: new Date().toISOString(),
          });
          await admin.from("org_invites").delete().eq("id", invite.id);
        }
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
