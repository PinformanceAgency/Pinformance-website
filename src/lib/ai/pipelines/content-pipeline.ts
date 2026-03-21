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

export async function runContentPipeline(orgId: string, days = 7) {
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

  // Generate slots for each day
  const slots: ContentSlot[] = [];
  const today = new Date();

  for (let d = 1; d <= days; d++) {
    const date = format(addDays(today, d), "yyyy-MM-dd");
    const pinsPerDay = settings.pins_per_day;
    const hours = settings.posting_hours;

    for (let s = 0; s < pinsPerDay; s++) {
      // Spread pins evenly across all posting hours
      const hour = hours[s % hours.length];
      // Add randomized minutes for natural posting pattern (not all on the hour)
      const minute = (s * 7 + d * 13) % 60; // Deterministic but varied
      const time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

      // Match products to boards by keyword relevance instead of round-robin
      const product = products[(s + d) % products.length];
      const board = findBestBoardForProduct(boards, product, keywords);

      slots.push({ date, time, slotIndex: s, board, product });
    }
  }

  const brandName = org.name;
  const websiteUrl = brandProfile?.raw_data?.website || "";
  const brandVoice = brandProfile?.structured_data?.brand_voice || brandProfile?.brand_voice || "";
  const brandStyle = brandProfile?.structured_data?.brand_style || {};

  let pinsCreated = 0;

  // Process slots in batches of 5 to avoid rate limits
  for (let i = 0; i < slots.length; i += 5) {
    const batch = slots.slice(i, i + 5);

    const settled = await Promise.allSettled(
      batch.map(async (slot) => {
        // Generate pin content
        const boardKeywords = [
          ...slot.board.keywords,
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
          contentPrompts.userPrompt
        );

        // Generate image prompt
        const imgPrompts = imagePromptPrompts({
          pinContent,
          productTitle: slot.product.title,
          productImages: slot.product.images,
          brand: { name: brandName, style: brandStyle },
        });

        const imagePrompt = await generateJSON<ImagePromptOutput>(
          imgPrompts.systemPrompt,
          imgPrompts.userPrompt
        );

        return { slot, pinContent, imagePrompt };
      })
    );

    const results = settled
      .filter((r): r is PromiseFulfilledResult<{ slot: ContentSlot; pinContent: PinContentOutput; imagePrompt: ImagePromptOutput }> => r.status === "fulfilled")
      .map((r) => r.value);

    // Save pins and calendar entries
    for (const { slot, pinContent, imagePrompt } of results) {
      const { data: pin } = await supabase
        .from("pins")
        .insert({
          org_id: orgId,
          board_id: slot.board.id,
          product_id: slot.product.id,
          title: pinContent.title,
          description: pinContent.description,
          alt_text: pinContent.alt_text,
          link_url: pinContent.link_url,
          keywords: pinContent.keywords,
          pin_type: "static",
          status: settings.auto_approve ? "scheduled" : "generated",
          generation_prompt: imagePrompt.prompt,
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
    metadata: { days, pins_created: pinsCreated, slots_planned: slots.length },
  });

  return { pinsCreated, daysPlanned: days };
}
