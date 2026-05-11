/**
 * Delete a user (by email or auth.users id).
 *
 * Usage:
 *   npx tsx scripts/delete-user.ts <email-or-id>
 *
 * Cascades to public.users (via ON DELETE CASCADE on the FK).
 */
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import path from "path";

loadEnv({ path: path.join(process.cwd(), ".env.local") });
loadEnv({ path: path.join(process.cwd(), ".env") });

async function main() {
  const target = process.argv[2];
  if (!target) {
    console.error("Usage: npx tsx scripts/delete-user.ts <email-or-id>");
    process.exit(1);
  }
  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  let userId = target;
  const looksLikeUuid = /^[0-9a-f-]{36}$/i.test(target);
  if (!looksLikeUuid) {
    const { data, error } = await supa.auth.admin.listUsers();
    if (error) {
      console.error("listUsers failed:", error.message);
      process.exit(1);
    }
    const found = data.users.find(
      (u) => (u.email || "").toLowerCase() === target.toLowerCase()
    );
    if (!found) {
      console.error(`No auth user with email ${target}`);
      process.exit(1);
    }
    userId = found.id;
    console.log(`→ Resolved ${target} → ${userId}`);
  }

  const { error } = await supa.auth.admin.deleteUser(userId);
  if (error) {
    console.error("Delete failed:", error.message);
    process.exit(1);
  }
  console.log(`✓ Deleted auth user ${userId} (public.users row cascades)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
