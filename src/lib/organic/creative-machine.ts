/**
 * Johanne's "Pinterest Creative Machine", inside the dashboard. A TEST.
 *
 * Module 3 (The Content Lab, 11-08-2026) and the app she shared for the team
 * to run themselves (pinterest-creative-machine.zip, linked from the Module 3
 * Notion page). Her workflow, unchanged:
 *
 *   1. Brand brief + 3–10 brand images      → BRAND_STYLE_LOCK   (prompt 0)
 *   2. Per campaign, 1–5 Pinterest images    → IMAGE_PROMPT_INSIGHTS (prompt 1)
 *   3. Scenario count + human-presence split
 *      + 1–3 product images                  → a closed library of scenarios (prompt 2)
 *   4. Per scenario, the final prompt       → pasted into Google Flow by hand,
 *                                             together with the product image
 *
 * The prompt texts below are hers, verbatim — that is the point of the test.
 * What differs is only where things live: her app kept everything in one
 * browser's localStorage; here it is per store in organic.creative_brands /
 * organic.creative_campaigns (migration 098) and the images in the pin-images
 * bucket, so the team works on the same library. The brief starts prefilled
 * from the intake where the intake has something to say.
 *
 * Her model, too: claude-sonnet-4-6, so the output can be compared with what
 * she showed. The only deliberate difference is max_tokens on the scenario
 * step — hers was 4096, which cuts a 90-scenario library off half way.
 *
 * Nothing here generates images. The finished image goes back in through the
 * normal design upload (P4.2.4), which gives it the SOP file name.
 *
 * To remove after the test: this file, src/app/api/organic/creative/, the
 * page under client/[orgId]/creative/, the sidebar link, and drop the two
 * tables from migration 098.
 */
import { organicPool } from "./db";
import { anthropicClient } from "./ai";

const MODEL = "claude-sonnet-4-6";

export interface CreativeBrief {
  brandName?: string; about?: string; target?: string; positioning?: string;
  distinction?: string; antiPatterns?: string; heroProduct?: string;
}
export interface ScenarioConfig {
  total: number; fullHuman: number; partialHuman: number; productOnly: number; directives: string;
}
export type StyleLock = Record<string, unknown>;

// ─── Johanne's prompt builders (verbatim, only typed) ───────────────────────

type ImageBlock = { type: "image"; source: { type: "url"; url: string } };
const imageBlocks = (urls: string[]): ImageBlock[] =>
  urls.map((url) => ({ type: "image", source: { type: "url", url } }));

function buildPrompt0(brief: CreativeBrief, images: string[]) {
  const briefText = `
BRAND BRIEF:
- Brand name: ${brief.brandName}
- Universe / positioning: ${brief.about}
- Target audience: ${brief.target}
- Market positioning: ${brief.positioning}
- Distinctive details to pay attention to: ${brief.distinction}
- What the brand would NEVER do visually: ${brief.antiPatterns}
- Hero product to highlight: ${brief.heroProduct}
`.trim();

  const system = `You are a senior art director and brand visual identity analyst. Extract the BRAND VISUAL IDENTITY from the attached brand images AND the brand brief. Images are the primary source of truth. The brief provides intentional direction. If you detect conflicts between what the images show and what the brief states, flag them clearly in a "conflicts_detected" field. Pay special attention to product materials, textures, finishes, and packaging — these must be captured precisely as they define the luxury perception of the brand. Output ONLY a valid JSON object, no markdown fences, no preamble.`;

  const content = [
    ...imageBlocks(images),
    {
      type: "text" as const,
      text: `${briefText}

OUTPUT FORMAT (JSON only, no markdown):
{
  "brand_essence": "one sentence capturing the visual soul",
  "dominant_emotions": ["", "", ""],
  "visual_identity": {
    "lighting": "",
    "color_mood": "",
    "composition_style": "",
    "camera_distance": "",
    "texture_and_materials": "",
    "background_treatment": "",
    "overall_vibe": ""
  },
  "visual_signatures": [""],
  "non_negotiables": [""],
  "forbidden_elements": [""],
  "conflicts_detected": ["list any conflicts between images and brief, or empty array if none"]
}`,
    },
  ];
  return { system, content };
}

function buildPrompt1(styleLock: StyleLock, images: string[]) {
  const system = `You are a senior visual analyst specialized in decoding aesthetic inspiration and translating it into usable creative directions. Output ONLY a valid JSON object, no markdown fences, no preamble.`;
  const content = [
    ...imageBlocks(images),
    {
      type: "text" as const,
      text: `BRAND_STYLE_LOCK:
${JSON.stringify(styleLock, null, 2)}

Analyze the attached image prompts as sources of inspiration, BUT reinterpret them strictly through the BRAND_STYLE_LOCK. Discard anything that conflicts with the brand identity.

OUTPUT FORMAT (JSON only, no markdown):
{
  "dominant_moods": ["", "", ""],
  "visual_patterns": ["", "", ""],
  "lighting_styles": ["", "", ""],
  "composition_ideas": ["", "", ""],
  "emotional_intentions": ["", "", ""],
  "elements_to_adapt_for_brand": ["", "", ""],
  "elements_to_ignore": ["", "", ""]
}`,
    },
  ];
  return { system, content };
}

function buildPrompt2(styleLock: StyleLock, insights: unknown, config: ScenarioConfig, productImages: string[]) {
  const system = `You are a creative director designing scalable visual scenarios for mass content production. Output ONLY the scenario table as plain text, no markdown fences, no preamble, no explanation.`;
  const content = [
    ...imageBlocks(productImages),
    {
      type: "text" as const,
      text: `BRAND_STYLE_LOCK:
${JSON.stringify(styleLock, null, 2)}

IMAGE_PROMPT_INSIGHTS:
${JSON.stringify(insights, null, 2)}

Generate a CLOSED LIBRARY of ${config.total} distinct visual scenarios.

FORMAT (STRICT — ONE LINE PER SCENARIO):
SCN01 | Presence | Setting | Subject | Action | Visual Focus | Mood | Notes
SCN02 | ...

PRESENCE DISTRIBUTION (MANDATORY):
- ${config.fullHuman} × Full human visible
- ${config.partialHuman} × Partial human (hands, POV, reflection, silhouette)
- ${config.productOnly} × No human (product only, objects, environments, details)

ADDITIONAL DIRECTIVES:
${config.directives || "None"}

RULES:
- No two scenarios may share the same Action + Setting combination
- Avoid influencer or overly staged vibes
- Favor natural, believable moments
- Some scenarios should feel intentionally mundane or subtle
- NEVER include text, typography, logos, or layout elements in any scenario — output is always a raw photograph only
- The product must ALWAYS appear exactly as it is in the reference image — never altered, stylized, or reinterpreted
- Scenarios must respect the product's real materials, shape, proportions, and packaging

Return ONLY SCN01 → SCN${String(config.total).padStart(2, "0")}. No explanation.`,
    },
  ];
  return { system, content };
}

export function buildFinalPrompt(styleLock: StyleLock, scenario: string, usedIds: string[]) {
  return `# MODULAR VISUAL GENERATION ENGINE — SINGLE OUTPUT

ROLE
You are a visual generation system capable of producing
high-quality images that strictly follow provided creative constraints.

MISSION
Generate ONE image that strictly follows the provided scenario
while respecting the BRAND_STYLE_LOCK.

INPUTS

BRAND_STYLE_LOCK:
${JSON.stringify(styleLock, null, 2)}

SCENARIO TO EXECUTE:
${scenario}

RECENTLY USED SCENARIOS (DO NOT REPLICATE MOOD/COMPOSITION):
${usedIds.length > 0 ? usedIds.join(", ") : "None"}

IMAGE GENERATION RULES
- Generate ONE image only
- Follow EXACTLY the provided scenario
- Follow STRICTLY the BRAND_STYLE_LOCK
- ABSOLUTELY NO TEXT of any kind — no words, no letters, no logos, no watermarks, no typography, no captions
- ABSOLUTELY NO LAYOUT — no frames, no borders, no collages, no split screens, no graphic overlays
- The output must be a SINGLE PHOTOGRAPH only — raw, full-bleed, edge to edge
- Respect the visual tone, mood, and constraints defined upstream
- The image must feel intentional, coherent, and aligned with the brand

PRODUCT FIDELITY (CRITICAL)
- The product must be reproduced with ABSOLUTE FIDELITY to the reference image
- Preserve EXACTLY: shape, proportions, materials, textures, colors, finishes, reflections, packaging details
- Do NOT alter, stylize, simplify, or reinterpret any aspect of the product
- Do NOT change the product's color, surface finish, label design, cap shape, or any physical detail
- The product must look like the REAL product photographed in situ — not a reinterpretation or artistic version
- If the product has specific material qualities (glass, matte, glossy, metallic, frosted), they must be rendered accurately
- This is especially critical for luxury products where material quality and craftsmanship define the brand

REALISM / STYLIZATION
- The level of realism or stylization must be dictated ONLY by the scenario and BRAND_STYLE_LOCK
- Do NOT default to UGC, phone, candid, or amateur styles unless required
- Do NOT add cinematic or studio effects unless explicitly compatible

FINAL COMMAND
Generate ONE photograph that perfectly matches the scenario and the BRAND_STYLE_LOCK.
No text. No layout. No graphic elements. Just the image.`;
}

// ─── Claude ──────────────────────────────────────────────────────────────────

async function callClaude(
  system: string,
  content: Array<ImageBlock | { type: "text"; text: string }>,
  maxTokens = 4096
): Promise<string> {
  const resp = await anthropicClient().messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content }],
  });
  if (resp.stop_reason === "refusal") throw new Error("Claude declined this request.");
  if (resp.stop_reason === "max_tokens") throw new Error("The answer was cut off before it finished; try again with fewer scenarios.");
  return resp.content.map((b) => (b.type === "text" ? b.text : "")).join("\n");
}

/** Her parse was `JSON.parse(raw.replace(/```json|```/g, ""))`; the same, plus
 *  tolerance for a sentence before or after the object. */
function parseJson(raw: string): Record<string, unknown> {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  try { return JSON.parse(cleaned); } catch { /* fall through */ }
  const a = cleaned.indexOf("{"), b = cleaned.lastIndexOf("}");
  if (a >= 0 && b > a) return JSON.parse(cleaned.slice(a, b + 1));
  throw new Error("The analysis came back unreadable; run it again.");
}

// ─── Storage ─────────────────────────────────────────────────────────────────

export async function loadCreativeMachine(orgId: string) {
  const pool = organicPool();
  const [brand, campaigns, prefill] = await Promise.all([
    pool.query(`SELECT brief, brand_images, style_lock, conflicts FROM organic.creative_brands WHERE org_id = $1`, [orgId]),
    pool.query(
      `SELECT id::text, name, inspiration_images, insights, config, product_images, scenarios, used_scenarios, created_at::text
         FROM organic.creative_campaigns WHERE org_id = $1 ORDER BY created_at DESC`, [orgId]),
    briefFromIntake(orgId),
  ]);
  const b = brand.rows[0];
  return {
    brief: (b?.brief && Object.keys(b.brief).length > 0 ? b.brief : prefill) as CreativeBrief,
    brief_prefilled: !b || !b.brief || Object.keys(b.brief).length === 0,
    brand_images: (b?.brand_images ?? []) as string[],
    style_lock: (b?.style_lock ?? null) as StyleLock | null,
    conflicts: (b?.conflicts ?? []) as string[],
    campaigns: campaigns.rows as Array<{
      id: string; name: string; inspiration_images: string[]; insights: Record<string, unknown> | null;
      config: ScenarioConfig; product_images: string[]; scenarios: string[]; used_scenarios: string[]; created_at: string;
    }>,
  };
}

/** A starting point for step 1, from what the store already told us. Only
 *  used while the brief has never been saved; after that it is theirs. */
async function briefFromIntake(orgId: string): Promise<CreativeBrief> {
  const r = await organicPool().query<{
    name: string; business_story: string | null; products_services: string | null; value_proposition: string | null;
    ideal_audience: string | null; brand_personality: string | null; positioning: string | null; never_include: string[] | null;
  }>(
    `SELECT o.name, ci.business_story, ci.products_services, ci.value_proposition, ci.ideal_audience,
            ci.brand_personality, br.positioning, br.never_include
       FROM public.organizations o
       LEFT JOIN organic.client_intake ci ON ci.org_id = o.id
       LEFT JOIN organic.brand_rules br ON br.org_id = o.id
      WHERE o.id = $1`, [orgId]);
  const x = r.rows[0];
  if (!x) return {};
  const join = (...s: Array<string | null | undefined>) => s.filter((v) => v && v.trim()).join(" ").trim();
  return {
    brandName: x.name,
    about: join(x.business_story, x.brand_personality),
    target: join(x.ideal_audience),
    positioning: join(x.positioning, x.value_proposition),
    distinction: "",
    antiPatterns: (x.never_include ?? []).join("; "),
    heroProduct: join(x.products_services),
  };
}

export async function saveBrief(orgId: string, brief: CreativeBrief) {
  await organicPool().query(
    `INSERT INTO organic.creative_brands (org_id, brief) VALUES ($1, $2::jsonb)
     ON CONFLICT (org_id) DO UPDATE SET brief = EXCLUDED.brief, updated_at = now()`,
    [orgId, JSON.stringify(brief)]);
  return { ok: true };
}

type ImageKind = "brand" | "inspiration" | "product";
const LIMITS: Record<ImageKind, number> = { brand: 10, inspiration: 5, product: 3 };

/** The browser resizes to 1024px JPEG first, exactly as her uploader did. */
export async function addImage(orgId: string, kind: ImageKind, campaignId: string | null, jpegBase64: string) {
  const pool = organicPool();
  const current = kind === "brand"
    ? (await pool.query<{ n: number }>(`SELECT COALESCE(array_length(brand_images, 1), 0) AS n FROM organic.creative_brands WHERE org_id = $1`, [orgId])).rows[0]?.n ?? 0
    : (await pool.query<{ n: number }>(
        `SELECT COALESCE(array_length(${kind === "inspiration" ? "inspiration_images" : "product_images"}, 1), 0) AS n
           FROM organic.creative_campaigns WHERE id = $1 AND org_id = $2`, [campaignId, orgId])).rows[0]?.n ?? 0;
  if (current >= LIMITS[kind]) {
    throw new Error(`There are already ${current} ${kind} images saved (the maximum is ${LIMITS[kind]}). Remove one first to add another.`);
  }

  const { createAdminClient } = await import("../supabase/admin");
  const admin = createAdminClient();
  const path = `organic/${orgId}/creative/${kind}/${crypto.randomUUID()}.jpg`;
  const { error } = await admin.storage.from("pin-images")
    .upload(path, Buffer.from(jpegBase64, "base64"), { contentType: "image/jpeg", upsert: false });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  const url = admin.storage.from("pin-images").getPublicUrl(path).data.publicUrl;

  if (kind === "brand") {
    await pool.query(
      `INSERT INTO organic.creative_brands (org_id, brand_images) VALUES ($1, ARRAY[$2])
       ON CONFLICT (org_id) DO UPDATE SET brand_images = array_append(organic.creative_brands.brand_images, $2), updated_at = now()`,
      [orgId, url]);
  } else {
    const col = kind === "inspiration" ? "inspiration_images" : "product_images";
    await pool.query(
      `UPDATE organic.creative_campaigns SET ${col} = array_append(${col}, $3), updated_at = now() WHERE id = $1 AND org_id = $2`,
      [campaignId, orgId, url]);
  }
  return { url };
}

export async function removeImage(orgId: string, kind: ImageKind, campaignId: string | null, url: string) {
  const pool = organicPool();
  if (kind === "brand") {
    await pool.query(`UPDATE organic.creative_brands SET brand_images = array_remove(brand_images, $2), updated_at = now() WHERE org_id = $1`, [orgId, url]);
  } else {
    const col = kind === "inspiration" ? "inspiration_images" : "product_images";
    await pool.query(`UPDATE organic.creative_campaigns SET ${col} = array_remove(${col}, $3), updated_at = now() WHERE id = $1 AND org_id = $2`, [campaignId, orgId, url]);
  }
  return { ok: true };
}

// ─── Her steps ───────────────────────────────────────────────────────────────

/** Step 1 — Visual identity → BRAND_STYLE_LOCK. Needs 3 images, as hers did. */
export async function analyzeBrand(orgId: string, adjustment?: string | null) {
  const pool = organicPool();
  const row = (await pool.query(`SELECT brief, brand_images FROM organic.creative_brands WHERE org_id = $1`, [orgId])).rows[0];
  const brief = (row?.brief ?? {}) as CreativeBrief;
  const images = (row?.brand_images ?? []) as string[];
  if (!brief.brandName || !brief.about || !brief.target) throw new Error("Fill in brand name, universe and target audience first.");
  if (images.length < 3) throw new Error("Upload at least 3 brand images.");
  const { system, content } = buildPrompt0(brief, images);
  if (adjustment?.trim()) content.push({ type: "text", text: `ADDITIONAL ADJUSTMENT REQUEST: ${adjustment.trim()}` });
  const parsed = parseJson(await callClaude(system, content));
  const conflicts = Array.isArray(parsed.conflicts_detected) ? parsed.conflicts_detected : [];
  delete parsed.conflicts_detected;
  await pool.query(
    `UPDATE organic.creative_brands SET style_lock = $2::jsonb, conflicts = $3::jsonb, updated_at = now() WHERE org_id = $1`,
    [orgId, JSON.stringify(parsed), JSON.stringify(conflicts)]);
  return { style_lock: parsed, conflicts };
}

export async function newCampaign(orgId: string, name: string) {
  const r = await organicPool().query<{ id: string }>(
    `INSERT INTO organic.creative_campaigns (org_id, name) VALUES ($1, $2) RETURNING id::text`,
    [orgId, name.trim() || "Campaign"]);
  return { id: r.rows[0].id };
}

export async function deleteCampaign(orgId: string, campaignId: string) {
  await organicPool().query(`DELETE FROM organic.creative_campaigns WHERE id = $1 AND org_id = $2`, [campaignId, orgId]);
  return { ok: true };
}

async function campaignFor(orgId: string, campaignId: string) {
  const pool = organicPool();
  const [brand, camp] = await Promise.all([
    pool.query(`SELECT style_lock FROM organic.creative_brands WHERE org_id = $1`, [orgId]),
    pool.query(`SELECT * FROM organic.creative_campaigns WHERE id = $1 AND org_id = $2`, [campaignId, orgId]),
  ]);
  const styleLock = brand.rows[0]?.style_lock as StyleLock | null;
  if (!styleLock) throw new Error("Analyze the brand's visual identity first.");
  if (!camp.rows[0]) throw new Error("Campaign not found.");
  return { styleLock, c: camp.rows[0] };
}

/** Campaign step 1 — Pinterest inspirations → IMAGE_PROMPT_INSIGHTS. */
export async function analyzeInspiration(orgId: string, campaignId: string) {
  const { styleLock, c } = await campaignFor(orgId, campaignId);
  if ((c.inspiration_images ?? []).length < 1) throw new Error("Upload at least one Pinterest image.");
  const { system, content } = buildPrompt1(styleLock, c.inspiration_images);
  const insights = parseJson(await callClaude(system, content));
  await organicPool().query(
    `UPDATE organic.creative_campaigns SET insights = $3::jsonb, updated_at = now() WHERE id = $1 AND org_id = $2`,
    [campaignId, orgId, JSON.stringify(insights)]);
  return { insights };
}

/** Campaign step 2 — the scenario count and the presence split. */
export async function saveConfig(orgId: string, campaignId: string, config: ScenarioConfig) {
  const total = Math.round(Number(config.total));
  const parts = [config.fullHuman, config.partialHuman, config.productOnly].map((n) => Math.max(0, Math.round(Number(n) || 0)));
  if (!(total >= 5 && total <= 90)) throw new Error("Between 5 and 90 scenarios.");
  if (parts[0] + parts[1] + parts[2] !== total) throw new Error("The three presence counts must add up to the total.");
  const clean: ScenarioConfig = { total, fullHuman: parts[0], partialHuman: parts[1], productOnly: parts[2], directives: String(config.directives ?? "") };
  await organicPool().query(
    `UPDATE organic.creative_campaigns SET config = $3::jsonb, updated_at = now() WHERE id = $1 AND org_id = $2`,
    [campaignId, orgId, JSON.stringify(clean)]);
  return { config: clean };
}

/** Campaign step 3 — product image(s) → the scenario library. */
export async function generateScenarios(orgId: string, campaignId: string) {
  const { styleLock, c } = await campaignFor(orgId, campaignId);
  if (!c.insights) throw new Error("Analyze the Pinterest inspirations first.");
  if ((c.product_images ?? []).length < 1) throw new Error("Upload at least one product image.");
  const { system, content } = buildPrompt2(styleLock, c.insights, c.config as ScenarioConfig, c.product_images);
  const raw = await callClaude(system, content, 16000);
  const lines = raw.replace(/```[a-z]*|```/g, "").trim().split("\n").map((l) => l.trim()).filter((l) => l.startsWith("SCN"));
  if (lines.length === 0) throw new Error("No scenarios came back; run it again.");
  await organicPool().query(
    `UPDATE organic.creative_campaigns SET scenarios = $3, used_scenarios = '{}', updated_at = now() WHERE id = $1 AND org_id = $2`,
    [campaignId, orgId, lines]);
  return { scenarios: lines };
}

/** Workstation — the prompt for Flow, and the done-list that feeds her
 *  "recently used scenarios" line. Copying marks it done, as hers did. */
export async function scenarioPrompt(orgId: string, campaignId: string, scenario: string, markUsed: boolean) {
  const { styleLock, c } = await campaignFor(orgId, campaignId);
  const used = (c.used_scenarios ?? []) as string[];
  const prompt = buildFinalPrompt(styleLock, scenario, used);
  const id = scenario.split("|")[0]?.trim();
  if (markUsed && id && !used.includes(id)) {
    await organicPool().query(
      `UPDATE organic.creative_campaigns SET used_scenarios = array_append(used_scenarios, $3), updated_at = now() WHERE id = $1 AND org_id = $2`,
      [campaignId, orgId, id]);
  }
  return { prompt, used: markUsed && id && !used.includes(id) ? [...used, id] : used };
}

export async function setScenarioUsed(orgId: string, campaignId: string, scenarioId: string, used: boolean) {
  await organicPool().query(
    used
      ? `UPDATE organic.creative_campaigns SET used_scenarios = array_append(array_remove(used_scenarios, $3), $3), updated_at = now() WHERE id = $1 AND org_id = $2`
      : `UPDATE organic.creative_campaigns SET used_scenarios = array_remove(used_scenarios, $3), updated_at = now() WHERE id = $1 AND org_id = $2`,
    [campaignId, orgId, scenarioId]);
  return { ok: true };
}
