/**
 * Create new client organizations (stores) so they can be connected to
 * Pinterest / Shopify via the org switcher. Mirrors the defaults of
 * POST /api/admin/create-client but WITHOUT the client invite — these
 * are bare orgs the agency links itself.
 *
 * Idempotent: an org whose slug already exists is skipped (and its
 * brand_profile is created if missing).
 *
 * Usage: npx tsx scripts/create-orgs.ts
 *
 * Required env (auto-loaded from .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import path from "path";

loadEnv({ path: path.join(process.cwd(), ".env.local") });
loadEnv({ path: path.join(process.cwd(), ".env") });

const NEW_ORG_NAMES = [
  "Mylifetrove",
  "Joseph Violet",
  "Sarah Oliver",
  "Travara Amsterdam",
  "Anna Berg",
  "Morgan and Brooke",
];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const DEFAULT_SETTINGS = {
  pins_per_day: 40,
  auto_approve: false,
  timezone: "Europe/Amsterdam",
  posting_hours: [8, 12, 17, 20],
  content_mix: { static: 70, video: 20, carousel: 10 },
  min_post_interval_minutes: 180,
  max_pins_per_day: 5,
  weekend_boost: true,
  pillar_rotation: true,
};

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

  // Pull existing slugs once so we can skip collisions.
  const { data: existing, error: exErr } = await supa
    .from("organizations")
    .select("id, name, slug");
  if (exErr) {
    console.error("Failed to read existing orgs:", exErr.message);
    process.exit(1);
  }
  const bySlug = new Map((existing || []).map((o) => [o.slug, o]));

  for (const name of NEW_ORG_NAMES) {
    const slug = slugify(name);
    const found = bySlug.get(slug);

    let orgId: string;
    if (found) {
      orgId = found.id as string;
      console.log(`• ${name.padEnd(20)} slug=${slug} — already exists, ensuring brand_profile`);
    } else {
      const { data: org, error: orgErr } = await supa
        .from("organizations")
        .insert({
          name,
          slug,
          onboarding_step: 5,
          onboarding_completed_at: new Date().toISOString(),
          settings: DEFAULT_SETTINGS,
        })
        .select("id")
        .single();
      if (orgErr || !org) {
        console.error(`✗ ${name}: failed to create org — ${orgErr?.message}`);
        continue;
      }
      orgId = org.id as string;
      console.log(`✓ ${name.padEnd(20)} slug=${slug} — created org ${orgId}`);
    }

    // Ensure an (empty) brand profile exists for the org.
    const { data: bp } = await supa
      .from("brand_profiles")
      .select("org_id")
      .eq("org_id", orgId)
      .maybeSingle();
    if (!bp) {
      const { error: bpErr } = await supa
        .from("brand_profiles")
        .insert({ org_id: orgId, raw_data: {} });
      if (bpErr) {
        console.error(`  ⚠ brand_profile insert failed: ${bpErr.message}`);
      } else {
        console.log(`  → brand_profile created`);
      }
    } else {
      console.log(`  → brand_profile already present`);
    }
  }

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
