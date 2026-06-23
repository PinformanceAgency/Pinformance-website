/**
 * Admin-only: list every org that has a Pinterest ad account connected.
 * Powers the store selector on /admin/activity.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "agency_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: orgs } = await admin
    .from("organizations")
    .select("id, name, slug, pinterest_access_token_encrypted, settings")
    .order("name", { ascending: true });

  const stores = (orgs || [])
    .filter((o) => !!o.pinterest_access_token_encrypted)
    .map((o) => {
      const settings = (o.settings as Record<string, unknown>) || {};
      return {
        id: o.id as string,
        name: o.name as string,
        slug: o.slug as string,
        ad_account_id:
          typeof settings.pinterest_ad_account_id === "string"
            ? (settings.pinterest_ad_account_id as string)
            : null,
      };
    });

  return NextResponse.json({ ok: true, stores });
}
