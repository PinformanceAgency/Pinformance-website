import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Supabase client scoped to the `organic` schema. Uses the service_role key
 * so we don't need per-table RLS policies for the internal organic tool
 * (dashboard middleware still gates access to the /organic paths).
 *
 * Callers do:  organicDb().from("client_tasks").select("*")
 *
 * The `organic` schema must be exposed in Supabase → Settings → API →
 * Exposed schemas.
 */
export function organicDb() {
  return createAdminClient().schema("organic");
}

/** Non-scoped admin client — needed for reads/writes on public.organizations. */
export function publicDb() {
  return createAdminClient();
}
