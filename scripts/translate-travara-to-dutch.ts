/**
 * One-off migration for Travara Amsterdam:
 *   1. Sets organizations.settings.content_language = "nl" so future
 *      AI-generated pins come out in Dutch.
 *   2. Translates every existing pin (title, description, alt_text,
 *      text_overlay, keywords) from English to Dutch via Claude and
 *      writes the result back.
 *
 * Idempotent-ish: pins that already look Dutch (heuristic) are skipped.
 * Safe to re-run — a pin that trips the heuristic once won't be re-translated.
 *
 * Usage:
 *   npx tsx scripts/translate-travara-to-dutch.ts
 *   npx tsx scripts/translate-travara-to-dutch.ts --dry-run
 */
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import "dotenv/config";

const ORG_NAME = "Travara Amsterdam";
const DRY_RUN = process.argv.includes("--dry-run");
const MODEL = "claude-haiku-4-5-20251001";

interface PinRow {
  id: string;
  title: string | null;
  description: string | null;
  alt_text: string | null;
  keywords: string[] | null;
}

interface TranslatedPin {
  title: string;
  description: string;
  alt_text: string;
  keywords: string[];
}

// Quick heuristic: if the description contains common Dutch words that aren't
// English cognates, assume it's already Dutch and skip.
function looksDutch(text: string | null): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  const markers = [
    " het ",
    " de ",
    " een ",
    " voor ",
    " met ",
    " naar ",
    " deze ",
    " onze ",
    " je ",
    " jouw ",
    " ontdek ",
    " bekijk ",
    " shop nu",
  ];
  let hits = 0;
  for (const m of markers) if (lower.includes(m)) hits++;
  return hits >= 2;
}

async function translateOne(client: Anthropic, pin: PinRow): Promise<TranslatedPin | null> {
  const input = {
    title: pin.title ?? "",
    description: pin.description ?? "",
    alt_text: pin.alt_text ?? "",
    keywords: pin.keywords ?? [],
  };

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system:
      "You translate Pinterest pin copy from English to Dutch (nl-NL). Rules: " +
      "(1) Keep the Pinterest SEO structure — title front-loads the primary keyword, description starts with the brand name. " +
      "(2) Keep proper nouns and brand names in their original form. " +
      "(3) Use natural, native Dutch — not literal word-for-word translation. Second person ('je', 'jouw'). " +
      "(4) Respect character budgets: title max 100, description max 500. " +
      "(5) Return keywords as lowercase Dutch search terms, one concept per string. " +
      "Output ONLY valid JSON: { \"title\": string, \"description\": string, \"alt_text\": string, \"keywords\": string[] }",
    messages: [{ role: "user", content: JSON.stringify(input) }],
  });

  const text = res.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd < 0) return null;
  try {
    const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as TranslatedPin;
    if (
      typeof parsed.title !== "string" ||
      typeof parsed.description !== "string" ||
      typeof parsed.alt_text !== "string" ||
      !Array.isArray(parsed.keywords)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function main() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  if (!ANTHROPIC_KEY) {
    console.error("Missing ANTHROPIC_API_KEY");
    process.exit(1);
  }

  const supa = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const claude = new Anthropic({ apiKey: ANTHROPIC_KEY });

  const { data: org, error: orgErr } = await supa
    .from("organizations")
    .select("id, name, settings")
    .eq("name", ORG_NAME)
    .single();
  if (orgErr || !org) {
    console.error(`Org "${ORG_NAME}" not found:`, orgErr?.message);
    process.exit(1);
  }
  console.log(`✓ Found ${org.name} (${org.id})`);

  // Step 1 — set content_language flag on the org.
  const nextSettings = { ...(org.settings || {}), content_language: "nl" };
  if (!DRY_RUN) {
    const { error } = await supa
      .from("organizations")
      .update({ settings: nextSettings })
      .eq("id", org.id);
    if (error) {
      console.error("Failed to set content_language:", error.message);
      process.exit(1);
    }
  }
  console.log(
    `${DRY_RUN ? "(dry) " : ""}Set organizations.settings.content_language = "nl"`
  );

  // Step 2 — pull existing pins and translate.
  const { data: pins, error: pinErr } = await supa
    .from("pins")
    .select("id, title, description, alt_text, keywords")
    .eq("org_id", org.id);
  if (pinErr) {
    console.error("Failed to load pins:", pinErr.message);
    process.exit(1);
  }
  const rows = (pins || []) as PinRow[];
  console.log(`Loaded ${rows.length} pins for translation.`);

  let translated = 0;
  let skipped = 0;
  let failed = 0;
  for (let i = 0; i < rows.length; i++) {
    const p = rows[i];
    const combined = `${p.title ?? ""} ${p.description ?? ""}`;
    if (looksDutch(combined)) {
      skipped++;
      if (i % 10 === 0) console.log(`  [${i + 1}/${rows.length}] skip (already NL): ${p.title?.slice(0, 60)}`);
      continue;
    }
    try {
      const out = await translateOne(claude, p);
      if (!out) {
        failed++;
        console.warn(`  [${i + 1}/${rows.length}] parse-fail: ${p.title?.slice(0, 60)}`);
        continue;
      }
      if (!DRY_RUN) {
        const { error } = await supa
          .from("pins")
          .update({
            title: out.title,
            description: out.description,
            alt_text: out.alt_text,
            keywords: out.keywords,
            updated_at: new Date().toISOString(),
          })
          .eq("id", p.id);
        if (error) {
          failed++;
          console.warn(`  [${i + 1}/${rows.length}] db-fail: ${error.message}`);
          continue;
        }
      }
      translated++;
      console.log(
        `  [${i + 1}/${rows.length}] ${DRY_RUN ? "(dry) " : ""}${p.title?.slice(0, 50)} → ${out.title.slice(0, 50)}`
      );
    } catch (e) {
      failed++;
      console.warn(
        `  [${i + 1}/${rows.length}] error: ${e instanceof Error ? e.message : e}`
      );
    }
  }

  console.log(
    `\nDone. translated=${translated}, skipped=${skipped}, failed=${failed}, total=${rows.length}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
