import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Pure helper that derives the effective org_id from an already-fetched user profile.
 *
 * SECURITY CONTRACT — DO NOT WEAKEN:
 * - For ANY role other than exactly "agency_admin", active_org_id is IGNORED and the user's
 *   real profile.org_id is returned. This is the primary defence against cross-org data leakage.
 * - If the profile is missing role or active_org_id fields (e.g. older selects), fallback
 *   to org_id as the safest default.
 */
export function getOrgIdFromProfile(
  profile: { org_id: string; role?: string | null; active_org_id?: string | null }
): string {
  if (!profile) return "";
  if (profile.role !== "agency_admin") return profile.org_id;
  return profile.active_org_id || profile.org_id;
}

/**
 * Returns the "effective" org_id for the currently authenticated user by fetching their profile.
 *
 * SECURITY CONTRACT — DO NOT WEAKEN:
 * - For ANY role other than agency_admin, this ALWAYS returns the user's real org_id
 *   and ALWAYS sets isAgencyAdmin=false. active_org_id is IGNORED for non-admins.
 *   This is the primary defence against cross-org data leakage.
 * - Only users with role === "agency_admin" may use active_org_id to "act as" another org.
 * - Returns null if the user is not authenticated or has no profile.
 */
export async function getEffectiveOrg(
  supabase: SupabaseClient
): Promise<{ orgId: string; isAgencyAdmin: boolean; realOrgId: string } | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("org_id, role, active_org_id")
    .eq("id", user.id)
    .single();

  if (!profile || !profile.org_id) return null;

  // HARD SECURITY GATE: any role that is NOT exactly "agency_admin" gets their real org_id.
  // Even if a non-admin somehow has active_org_id set (should never happen), it is ignored here.
  if (profile.role !== "agency_admin") {
    return { orgId: profile.org_id, isAgencyAdmin: false, realOrgId: profile.org_id };
  }

  return {
    orgId: (profile.active_org_id as string) || profile.org_id,
    isAgencyAdmin: true,
    realOrgId: profile.org_id,
  };
}
