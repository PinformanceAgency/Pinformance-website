/**
 * Create a new agency_admin user.
 *
 * Usage:
 *   npx tsx scripts/create-agency-admin.ts <email> <password> [full_name]
 *
 * Required env vars (auto-loaded from .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * The script:
 *   1. Confirms the email isn't already taken (in auth.users).
 *   2. Creates a Supabase auth user (email auto-confirmed).
 *   3. Finds an existing agency org (any org that already has an
 *      agency_admin) and links the new user to it with role=agency_admin.
 *   4. Prints the credentials when done.
 */
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import path from "path";

loadEnv({ path: path.join(process.cwd(), ".env.local") });
loadEnv({ path: path.join(process.cwd(), ".env") });

async function main() {
  const [, , emailArg, passwordArg, ...rest] = process.argv;
  const fullName = rest.join(" ").trim();

  if (!emailArg || !passwordArg) {
    console.error(
      "Usage: npx tsx scripts/create-agency-admin.ts <email> <password> [full_name]"
    );
    process.exit(1);
  }

  const email = emailArg.trim().toLowerCase();
  const password = passwordArg;
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env"
    );
    process.exit(1);
  }

  const supa = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`→ Looking up an agency org to attach ${email} to…`);
  const { data: agencyAdmin, error: aaErr } = await supa
    .from("users")
    .select("org_id, organizations:org_id (id, name)")
    .eq("role", "agency_admin")
    .limit(1)
    .single();
  if (aaErr || !agencyAdmin?.org_id) {
    console.error(
      "No existing agency_admin user found in `public.users`. Can't determine agency org — aborting.\n" +
        (aaErr ? `(${aaErr.message})` : "")
    );
    process.exit(1);
  }
  const orgId: string = agencyAdmin.org_id as string;
  const orgName =
    (agencyAdmin.organizations as { id?: string; name?: string } | null)?.name ||
    orgId;
  console.log(`✓ Found agency org: ${orgName} (${orgId})`);

  console.log(`→ Checking if ${email} already exists in auth.users…`);
  // Note: listUsers requires pagination for large orgs but is fine here.
  const { data: existing, error: listErr } = await supa.auth.admin.listUsers();
  if (listErr) {
    console.error("Failed to list users:", listErr.message);
    process.exit(1);
  }
  const already = existing.users.find(
    (u) => (u.email || "").toLowerCase() === email
  );
  if (already) {
    console.error(`User ${email} already exists in Supabase auth. Aborting.`);
    process.exit(1);
  }

  console.log(`→ Creating auth user…`);
  const { data: created, error: createErr } = await supa.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: fullName ? { full_name: fullName } : undefined,
  });
  if (createErr || !created.user) {
    console.error("Failed to create auth user:", createErr?.message);
    process.exit(1);
  }
  console.log(`✓ auth.users id: ${created.user.id}`);

  console.log(`→ Inserting public.users row with role=agency_admin…`);
  const { error: profileErr } = await supa.from("users").insert({
    id: created.user.id,
    email,
    full_name: fullName || email.split("@")[0],
    org_id: orgId,
    role: "agency_admin",
  });
  if (profileErr) {
    console.error("Failed to insert profile:", profileErr.message);
    console.error(
      "The auth user was created but has no profile row. Either retry the insert manually or delete the auth user and re-run."
    );
    process.exit(1);
  }

  console.log("\n✅ Agency admin user created.");
  console.log("─".repeat(50));
  console.log(`Email:    ${email}`);
  console.log(`Password: ${password}`);
  console.log(`Org:      ${orgName} (${orgId})`);
  console.log(`Role:     agency_admin (full access across all orgs)`);
  console.log("─".repeat(50));
  console.log(
    "\nThey can log in via the normal /login page. Once signed in, the org switcher in the sidebar lets them act on any org."
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
