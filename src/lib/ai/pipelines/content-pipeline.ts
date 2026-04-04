import { createAdminClient } from "@/lib/supabase/admin";
import { generateJSON } from "@/lib/ai/client";
import { pinContentPrompts, type PinContentOutput } from "@/lib/ai/prompts/pin-content";
import { imagePromptPrompts, type ImagePromptOutput } from "@/lib/ai/prompts/image-prompt";
import type { OrgSettings, Product, Board, FeedbackRule } from "@/lib/types";
import { addDays, format } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";

interface ContentSlot {
  date: string;
  time: string;
  slotIndex: number;
  board: Board;
  product: Product;
}

function findBestBoardForProduct(
  boards: Board[],
  product: Product,
  keywords: { keyword: string; category?: string | null }[]
): Board {
  // Score each board by keyword overlap with product tags/collections
  const productTerms = [
    ...product.tags,
    ...product.collections,
    product.product_type || "",
    product.title,
  ]
    .join(" ")
    .toLowerCase();

  let bestBoard = boards[0];
  let bestScore = -1;

  for (const board of boards) {
    let score = 0;
    for (const kw of board.keywords || []) {
      if (productTerms.includes(kw.toLowerCase())) score += 2;
    }
    // Also check if board category matches product type
    if (board.category && productTerms.includes(board.category.toLowerCase())) {
      score += 3;
    }
    if (score > bestScore) {
      bestScore = score;
      bestBoard = board;
    }
  }

  return bestBoard;
}

/**
 * Run content pipeline.
 * mode = "seed": Generate pinsPerBoard pins for each board (initial seeding)
 * mode = "daily": Generate 1 pin/day spread across boards (ongoing)
 */
export async function runContentPipeline(orgId: string, days = 7, apiKey?: string, mode: "seed" | "daily" = "daily", pinsPerBoard = 5) {
  const supabase = createAdminClient();
  const startedAt = new Date().toISOString();

  // Load org + settings
  const { data: org } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", orgId)
    .single();

  if (!org) throw new Error(`Organization ${orgId} not found`);

  const settings: OrgSettings = org.settings;

  // Load brand profile
  const { data: brandProfile } = await supabase
    .from("brand_profiles")
    .select("*")
    .eq("org_id", orgId)
    .single();

  // Load boards, products, keywords, feedback rules
  const [boardsRes, productsRes, keywordsRes, feedbackRes] = await Promise.all([
    supabase.from("boards").select("*").eq("org_id", orgId).in("status", ["draft", "active"]),
    supabase.from("products").select("*").eq("org_id", orgId).eq("status", "active"),
    supabase.from("keywords").select("*").eq("org_id", orgId).order("performance_score", { ascending: false }),
    supabase.from("feedback_rules").select("*").eq("org_id", orgId).eq("is_active", true),
  ]);

  const boards = boardsRes.data || [];
  const products = productsRes.data || [];
  const keywords = keywordsRes.data || [];
  const feedbackRules = (feedbackRes.data || []) as FeedbackRule[];

  if (!boards.length) throw new Error("No boards found — run strategy pipeline first");
  if (!products.length) throw new Error("No products found — sync Shopify first");

  // Load recent top performers for reference
  const { data: topPins } = await supabase
    .from("pins")
    .select("title, keywords")
    .eq("org_id", orgId)
    .eq("status", "posted")
    .order("created_at", { ascending: false })
    .limit(10);

  // Generate slots
  const slots: ContentSlot[] = [];
  const today = new Date();
  const hours = settings.posting_hours || [18, 19, 20, 21];

  if (mode === "seed") {
    // SEED MODE: Generate pinsPerBoard pins for each board
    // Pinterest doc: "Each board starts with 6-8 pins minimum"
    // Spread scheduled times across days so they post gradually
    let dayOffset = 1;
    for (let bi = 0; bi < boards.length; bi++) {
      const board = boards[bi];
      for (let p = 0; p < pinsPerBoard; p++) {
        const date = format(addDays(today, dayOffset), "yyyy-MM-dd");
        const hour = hours[p % hours.length];
        const minute = (p * 11 + bi * 7) % 60;
        const time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
        const product = products[(bi + p) % products.length];
        slots.push({ date, time, slotIndex: p, board, product });
        // Advance day every few pins to spread posting (1 pin/day rule)
        if ((p + 1) % 1 === 0) dayOffset++;
      }
    }
  } else {
    // DAILY MODE: 1 pin/day distributed across all boards
    // Pinterest strategy rules (from Pinterest_Organic_Automation_Prompt.md):
    // - 1 pin/day ideal, 3-5/week minimum
    // - Spread across week, never batch-post multiple same day
    // - Weekend boost: more engagement on Sat/Sun
    // - Pillar rotation: never same content type back-to-back
    // - Post during peak hours (evenings for US audience)
    const weekendBoost = settings.weekend_boost ?? true;

    let lastBoardId = "";
    let boardIndex = 0;
    for (let d = 1; d <= days; d++) {
      const targetDate = addDays(today, d);
      const date = format(targetDate, "yyyy-MM-dd");
      const dayOfWeek = targetDate.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const dayPins = isWeekend && weekendBoost ? 2 : 1;

      for (let s = 0; s < dayPins; s++) {
        const hour = hours[s % hours.length];
        const minute = (s * 7 + d * 13) % 60;
        const time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

        // Round-robin through boards for even distribution
        const board = boards[boardIndex % boards.length];
        boardIndex++;

        // Pillar rotation: skip if same board as last
        if (settings.pillar_rotation && board.id === lastBoardId && boards.length > 1) {
          boardIndex++;
        }
        const finalBoard = boards[(boardIndex - 1) % boards.length];
        lastBoardId = finalBoard.id;

        const product = products[(s + d) % products.length];
        slots.push({ date, time, slotIndex: s, board: finalBoard, product });
      }
    }
  }

  console.log(`[ContentPipeline] mode=${mode}, pinsPerBoard=${pinsPerBoard}, days=${days}, boards=${boards.length}, products=${products.length}, slots=${slots.length}`);

  const brandName = org.name;
  const websiteUrl = brandProfile?.raw_data?.website || "";
  const brandVoice = brandProfile?.structured_data?.brand_voice || brandProfile?.brand_voice || "";
  const brandStyle = brandProfile?.structured_data?.brand_style || {};

  let pinsCreated = 0;

  // Categorize active feedback rules for logging and downstream use
  const activeRules = feedbackRules.filter((r) => r.is_active);
  const appliedRuleIds = activeRules.map((r) => r.id);
  const styleGuideRules = activeRules
    .filter((r) => r.rule_type === "style_guide")
    .sort((a, b) => b.priority - a.priority)
    .map((r) => r.rule_text);
  const keywordBoostRules = activeRules
    .filter((r) => r.rule_type === "keyword_boost")
    .map((r) => r.rule_text);

  // Process slots in batches of 5 to avoid rate limits
  for (let i = 0; i < slots.length; i += 5) {
    const batch = slots.slice(i, i + 5);

    const settled = await Promise.allSettled(
      batch.map(async (slot) => {
        // Generate pin content (feedbackRules are applied inside pinContentPrompts)
        const boardKeywords = [
          ...slot.board.keywords,
          // Boost keywords from feedback rules get prioritized
          ...keywordBoostRules,
          ...keywords
            .filter((k) => k.category === slot.board.category)
            .slice(0, 5)
            .map((k) => k.keyword),
        ];

        const contentPrompts = pinContentPrompts({
          product: slot.product,
          boardName: slot.board.name,
          boardKeywords,
          brandName,
          brandVoice,
          websiteUrl,
          feedbackRules,
          recentTopPerformers: topPins?.map((p) => ({
            title: p.title,
            keywords: p.keywords || [],
          })),
        });

        const pinContent = await generateJSON<PinContentOutput>(
          contentPrompts.systemPrompt,
          contentPrompts.userPrompt,
          undefined,
          apiKey
        );

        // Generate image prompt with style guide rules applied
        const imgPrompts = imagePromptPrompts({
          pinContent,
          productTitle: slot.product.title,
          productImages: slot.product.images,
          brand: { name: brandName, style: brandStyle },
          styleGuideRules,
        });

        const imagePrompt = await generateJSON<ImagePromptOutput>(
          imgPrompts.systemPrompt,
          imgPrompts.userPrompt,
          undefined,
          apiKey
        );

        return { slot, pinContent, imagePrompt };
      })
    );

    const results = settled
      .filter((r): r is PromiseFulfilledResult<{ slot: ContentSlot; pinContent: PinContentOutput; imagePrompt: ImagePromptOutput }> => r.status === "fulfilled")
      .map((r) => r.value);

    // Build product URL lookup from Shopify domain
    const shopifyDomain = org.shopify_domain;

    // Save pins and calendar entries
    for (const { slot, pinContent, imagePrompt } of results) {
      // Build the correct product URL - prefer brand website over myshopify.com
      let linkUrl = pinContent.link_url;
      const brandWebsite = brandProfile?.raw_data?.website || brandProfile?.raw_data?.landing_page;
      if (slot.product.shopify_product_id) {
        const handle = slot.product.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        const baseDomain = brandWebsite || (shopifyDomain ? `https://${shopifyDomain}` : null);
        if (baseDomain) {
          linkUrl = `${baseDomain.replace(/\/$/, "")}/products/${handle}`;
        }
      } else if (linkUrl && !linkUrl.startsWith("http") && brandWebsite) {
        linkUrl = `${brandWebsite.replace(/\/$/, "")}${linkUrl.startsWith("/") ? "" : "/"}${linkUrl}`;
      }

      // Use real Shopify product image if available, skip AI image generation
      const productImages = slot.product.images as { url: string; alt: string }[] || [];
      const hasRealImage = productImages.length > 0 && productImages[0].url;
      const realImageUrl = hasRealImage ? productImages[0].url : null;

      const { data: pin } = await supabase
        .from("pins")
        .insert({
          org_id: orgId,
          board_id: slot.board.id,
          product_id: slot.product.id,
          title: pinContent.title,
          description: pinContent.description,
          alt_text: pinContent.alt_text,
          link_url: linkUrl,
          keywords: pinContent.keywords,
          pin_type: "static",
          image_url: realImageUrl,
          status: settings.auto_approve ? "scheduled" : "generated",
          generation_prompt: hasRealImage ? null : imagePrompt.prompt,
          scheduled_at: fromZonedTime(`${slot.date}T${slot.time}:00`, settings.timezone || "UTC").toISOString(),
        })
        .select("id")
        .single();

      if (pin) {
        await supabase.from("calendar_entries").insert({
          org_id: orgId,
          pin_id: pin.id,
          scheduled_date: slot.date,
          scheduled_time: slot.time,
          slot_index: slot.slotIndex,
        });

        pinsCreated++;
      }
    }
  }

  // Log ai_task
  await supabase.from("ai_tasks").insert({
    org_id: orgId,
    task_type: "content_generation",
    status: "completed",
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    input_summary: `${days} days, ${boards.length} boards, ${products.length} products`,
    output_summary: `${pinsCreated} pins created`,
    metadata: {
      days,
      pins_created: pinsCreated,
      slots_planned: slots.length,
      feedback_rules_applied: appliedRuleIds,
      feedback_rules_count: activeRules.length,
      style_guide_rules: styleGuideRules.length,
      keyword_boost_rules: keywordBoostRules.length,
    },
  });

  return { pinsCreated, daysPlanned: days };
}
