/**
 * One-off: add three more client organizations. Same idempotent pattern as
 * scripts/create-additional-orgs.ts. Safe to re-run — existing slugs are
 * skipped.
 */
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const NEW_ORG_NAMES = ["Tola Jewelry US", "Tola Jewelery DE", "Candela Boutique"];

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

  const { data: existing, error: exErr } = await supa
    .from("organizations")
    .select("id, name, slug");
  if (exErr) {
    console.error("Failed to read existing orgs:", exErr.message);
    process.exit(1);
  }
  const bySlug = new Map((existing || []).map((o) => [o.slug, o]));

  let created = 0;
  let skipped = 0;
  for (const name of NEW_ORG_NAMES) {
    const slug = slugify(name);
    const found = bySlug.get(slug);

    let orgId: string;
    if (found) {
      orgId = found.id as string;
      console.log(`• ${name.padEnd(24)} slug=${slug} — already exists`);
      skipped++;
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
        console.error(`✗ ${name}: ${orgErr?.message}`);
        continue;
      }
      orgId = org.id as string;
      console.log(`✓ ${name.padEnd(24)} slug=${slug} — created ${orgId}`);
      created++;
    }

    const { data: bp } = await supa
      .from("brand_profiles")
      .select("org_id")
      .eq("org_id", orgId)
      .maybeSingle();
    if (!bp) {
      await supa.from("brand_profiles").insert({ org_id: orgId, raw_data: {} });
    }
  }

  console.log(`\nDone. ${created} created, ${skipped} already existed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
