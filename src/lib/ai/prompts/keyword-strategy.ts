import type { Product, Competitor } from "@/lib/types";

interface BrandProfile {
  name: string;
  website: string;
  industry: string;
  description: string;
  target_audience?: string;
}

interface KeywordStrategyInput {
  brand: BrandProfile;
  products: Product[];
  competitors: Competitor[];
}

export interface KeywordStrategyOutput {
  primary_keywords: { keyword: string; intent: string; estimated_volume: string }[];
  secondary_keywords: { keyword: string; category: string }[];
  long_tail_keywords: { keyword: string; category: string }[];
  categories: { name: string; keywords: string[]; board_potential: string }[];
}

export function keywordStrategyPrompts(input: KeywordStrategyInput) {
  // Add seasonal context — Pinterest users search 45-90 days ahead
  const now = new Date();
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const currentMonth = monthNames[now.getMonth()];
  const nextMonth = monthNames[(now.getMonth() + 1) % 12];
  const twoMonthsOut = monthNames[(now.getMonth() + 2) % 12];

  const systemPrompt = `You are an elite Pinterest SEO strategist for e-commerce brands. Generate keyword strategies that maximize search visibility and drive product discovery.

Pinterest-specific SEO rules:
- Pinterest is a VISUAL SEARCH ENGINE. Keywords must match how real users search (e.g. "boho living room ideas" not "bohemian interior design")
- Prioritize high-intent, product-discovery keywords (Pinterest users are 47% more likely to discover new brands)
- Focus on "idea" and "inspiration" keywords — these perform best on Pinterest
- Include lifestyle keywords that connect products to aspirational living
- Avoid overly generic terms (e.g. "clothes") — aim for 2-5 word phrases
- Consider Pinterest autocomplete suggestions and trending searches
- Mix broad category terms with specific product-focused long-tail terms

SEASONAL STRATEGY (CRITICAL):
Pinterest users search 45-90 days ahead. Current month: ${currentMonth}.
- Include keywords for upcoming events/seasons in ${nextMonth} and ${twoMonthsOut}
- Prioritize seasonal keywords that are about to peak in search volume
- Mark seasonal keywords with their peak period so they can be time-weighted
- Evergreen keywords should still make up 60% of the strategy

Output valid JSON matching this schema:
{
  "primary_keywords": [{ "keyword": string, "intent": string, "estimated_volume": "high" | "medium" | "low" }],
  "secondary_keywords": [{ "keyword": string, "category": string }],
  "long_tail_keywords": [{ "keyword": string, "category": string }],
  "categories": [{ "name": string, "keywords": string[], "board_potential": string }]
}

Generate:
- 20-30 primary keywords (highest intent, most searchable)
- 50-100 secondary keywords (supporting terms)
- 100+ long-tail keywords (specific, lower competition)
- Group all keywords into logical categories for board creation
- Include at least 20% seasonal/trending keywords for the next 60-90 days`;

  const productSummary = input.products
    .slice(0, 30)
    .map((p) => `- ${p.title} (${p.product_type || "general"}) [tags: ${p.tags.join(", ")}]`)
    .join("\n");

  const competitorSummary = input.competitors
    .map((c) => `- @${c.pinterest_username}: ${c.follower_count || "?"} followers, top keywords: ${c.top_keywords.slice(0, 10).join(", ")}`)
    .join("\n");

  const userPrompt = `Generate a Pinterest keyword strategy for this brand:

Brand: ${input.brand.name}
Website: ${input.brand.website}
Industry: ${input.brand.industry}
Description: ${input.brand.description}
${input.brand.target_audience ? `Target Audience: ${input.brand.target_audience}` : ""}

Products (${input.products.length} total, showing top 30):
${productSummary || "No products imported yet"}

Competitors:
${competitorSummary || "No competitors added yet"}

Focus on keywords that will drive product discovery and outbound clicks to the brand's website.`;

  return { systemPrompt, userPrompt };
}
