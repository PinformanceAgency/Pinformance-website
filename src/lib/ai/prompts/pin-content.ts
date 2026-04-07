import type { Product, FeedbackRule } from "@/lib/types";

interface PinContentInput {
  product: Product;
  boardName: string;
  boardKeywords: string[];
  brandName: string;
  brandVoice?: string;
  websiteUrl: string;
  feedbackRules: FeedbackRule[];
  recentTopPerformers?: { title: string; keywords: string[] }[];
  customPromptAdditions?: string;
}

export interface PinContentOutput {
  title: string;
  description: string;
  alt_text: string;
  link_url: string;
  keywords: string[];
  text_overlay: string;
  visual_style: "lifestyle" | "flat_lay" | "closeup" | "model" | "infographic";
}

export function pinContentPrompts(input: PinContentInput) {
  const activeRules = input.feedbackRules
    .filter((r) => r.is_active)
    .sort((a, b) => b.priority - a.priority);

  const promptModifiers = activeRules
    .filter((r) => r.rule_type === "prompt_modifier")
    .map((r) => `- ${r.rule_text}`)
    .join("\n");

  const styleGuides = activeRules
    .filter((r) => r.rule_type === "style_guide")
    .map((r) => `- ${r.rule_text}`)
    .join("\n");

  const keywordBoosts = activeRules
    .filter((r) => r.rule_type === "keyword_boost")
    .map((r) => r.rule_text);

  const keywordBlocks = activeRules
    .filter((r) => r.rule_type === "keyword_block")
    .map((r) => r.rule_text);

  // Seasonal context for Pinterest (users search 45-90 days ahead)
  const now = new Date();
  const month = now.getMonth();
  const seasonalContext = getSeasonalContext(month);

  const systemPrompt = `You are an elite Pinterest content creator for e-commerce brands. Create pin content optimized for Pinterest's search algorithm and maximum engagement.

CRITICAL Pinterest SEO rules (these directly impact distribution):
1. TITLE (max 100 chars):
   - Front-load the PRIMARY keyword in the first 40 characters — Pinterest's search algorithm weights early words heavily
   - Use "How to", "Best", "Top", numbers ("7 Ways to..."), or question formats — these get 2-3x more clicks
   - Include power words: essential, stunning, must-have, ultimate, effortless
   - NEVER start with the brand name — users don't search for your brand

2. DESCRIPTION (max 500 chars):
   - ALWAYS start the first sentence with the BRAND NAME — e.g. "Fit Cherries offers..." or "TobiosKits brings you..."
   - First 50 characters are MOST IMPORTANT — this is what shows in search results and feeds
   - Put primary keyword in the first sentence, naturally, right after brand name
   - Include 3-5 keywords woven into natural sentences (not comma lists)
   - Do NOT use hashtags — focus on strong keywords in natural sentences instead
   - End with a CTA that includes a keyword: "Shop [keyword] now" > generic "Click here"
   - Write in second person ("you", "your") — this converts 40% better on Pinterest

3. ALT TEXT: Describe the image literally for accessibility, include 1-2 keywords naturally

4. TEXT OVERLAY: 3-8 words max, benefit-driven hook (NOT the product name). Think magazine cover energy.

5. KEYWORDS: Mix board keywords + product terms + seasonal terms. Include both broad and specific.

6. VISUAL STYLE selection:
   - lifestyle: product in real-world aspirational setting (best for most products)
   - flat_lay: overhead styled arrangement, clean background (great for skincare, accessories)
   - closeup: texture/detail focus (premium products, materials)
   - model: person wearing/using product (fashion, beauty)
   - infographic: tips, how-to, comparison (educational content gets 30% more saves)

${seasonalContext}

${promptModifiers ? `\nFeedback-driven modifications:\n${promptModifiers}` : ""}
${styleGuides ? `\nStyle guidelines:\n${styleGuides}` : ""}
${keywordBoosts.length ? `\nBoosted keywords (prefer these): ${keywordBoosts.join(", ")}` : ""}
${keywordBlocks.length ? `\nBlocked keywords (never use): ${keywordBlocks.join(", ")}` : ""}
${input.customPromptAdditions ? `\nCustom brand instructions:\n${input.customPromptAdditions}` : ""}

Output valid JSON matching this schema:
{
  "title": string (max 100 chars),
  "description": string (max 500 chars),
  "alt_text": string,
  "link_url": string,
  "keywords": string[],
  "text_overlay": string (3-8 words),
  "visual_style": "lifestyle" | "flat_lay" | "closeup" | "model" | "infographic"
}`;

  const productVariants = input.product.variants
    .slice(0, 5)
    .map((v) => `${v.title}: ${v.price}`)
    .join(", ");

  const userPrompt = `Create pin content for:

Product: ${input.product.title}
${input.product.description ? `Description: ${input.product.description}` : ""}
Type: ${input.product.product_type || "general"}
Tags: ${input.product.tags.join(", ") || "none"}
Variants: ${productVariants || "single variant"}
Collections: ${input.product.collections.join(", ") || "none"}

Board: ${input.boardName}
Board Keywords: ${input.boardKeywords.join(", ")}
Brand: ${input.brandName}
${input.brandVoice ? `Brand Voice: ${input.brandVoice}` : ""}
Website: ${input.websiteUrl}

Link URL: ${input.websiteUrl}/products/${input.product.shopify_product_id || input.product.id}

${input.recentTopPerformers?.length ? `Recent top performers for reference:\n${input.recentTopPerformers.map((p) => `- "${p.title}" [${p.keywords.join(", ")}]`).join("\n")}` : ""}`;

  return { systemPrompt, userPrompt };
}

function getSeasonalContext(month: number): string {
  // Pinterest users search 45-90 days ahead, so content should target UPCOMING seasons/events
  const seasons: Record<number, string> = {
    0: `SEASONAL CONTEXT: It's January. Pinterest users are searching for: Valentine's Day gifts (peaks now), spring fashion, New Year goals, winter skincare, organization/decluttering. Target content for February-March.`,
    1: `SEASONAL CONTEXT: It's February. Pinterest users are searching for: spring outfits, Easter decor, St. Patrick's Day, spring cleaning, garden ideas, Mother's Day gifts (early planners). Target content for March-April.`,
    2: `SEASONAL CONTEXT: It's March. Pinterest users are searching for: spring fashion, Easter, outdoor entertaining, wedding season prep, Mother's Day gifts, summer vacation planning. Target content for April-May.`,
    3: `SEASONAL CONTEXT: It's April. Pinterest users are searching for: Mother's Day gifts (peak), summer outfits, graduation gifts, Memorial Day, outdoor living, wedding season. Target content for May-June.`,
    4: `SEASONAL CONTEXT: It's May. Pinterest users are searching for: Father's Day gifts, summer fashion, 4th of July, beach essentials, travel outfits, back-to-school (early planners). Target content for June-July.`,
    5: `SEASONAL CONTEXT: It's June. Pinterest users are searching for: summer style, 4th of July entertaining, back-to-school, fall fashion (early), outdoor activities, vacation essentials. Target content for July-August.`,
    6: `SEASONAL CONTEXT: It's July. Pinterest users are searching for: back-to-school, fall fashion, Labor Day, fall decor, autumn recipes, Halloween (early planners). Target content for August-September.`,
    7: `SEASONAL CONTEXT: It's August. Pinterest users are searching for: fall fashion, Halloween costumes/decor, Thanksgiving prep, autumn home decor, cozy outfits. Target content for September-October.`,
    8: `SEASONAL CONTEXT: It's September. Pinterest users are searching for: Halloween, Thanksgiving, holiday gift guides (starting), fall recipes, cozy home, Black Friday deals. Target content for October-November.`,
    9: `SEASONAL CONTEXT: It's October. Pinterest users are searching for: holiday gift guides (peak), Christmas decor, Thanksgiving recipes, winter fashion, Black Friday/Cyber Monday. Target content for November-December.`,
    10: `SEASONAL CONTEXT: It's November. Pinterest users are searching for: Christmas gifts (peak), holiday entertaining, New Year's Eve outfits, winter skincare, cozy home decor. Target content for December-January.`,
    11: `SEASONAL CONTEXT: It's December. Pinterest users are searching for: New Year's resolutions, winter fashion, Valentine's Day (early), organization ideas, self-care, fitness goals. Target content for January-February.`,
  };
  return seasons[month] || "";
}
