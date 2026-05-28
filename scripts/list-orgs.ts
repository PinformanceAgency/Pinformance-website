/**
 * Read-only: list existing organizations (id, name, slug) so we can
 * check for name/slug collisions before creating new ones.
 *
 * Usage: npx tsx scripts/list-orgs.ts
 */
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import path from "path";

loadEnv({ path: path.join(process.cwd(), ".env.local") });
loadEnv({ path: path.join(process.cwd(), ".env") });

async function main() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  const supa = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await supa
    .from("organizations")
    .select("id, name, slug, onboarding_step, created_at")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Query failed:", error.message);
    process.exit(1);
  }
  console.log(`Existing organizations (${data?.length || 0}):`);
  console.log("─".repeat(70));
  for (const o of data || []) {
    console.log(
      `${(o.name || "").padEnd(28)} slug=${(o.slug || "").padEnd(22)} step=${o.onboarding_step}`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
