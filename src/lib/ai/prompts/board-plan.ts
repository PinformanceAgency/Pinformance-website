import type { KeywordStrategyOutput } from "./keyword-strategy";

interface BrandProfile {
  name: string;
  industry: string;
  description: string;
  target_audience?: string;
}

interface BoardPlanInput {
  brand: BrandProfile;
  keywordStrategy: KeywordStrategyOutput;
  existingBoards?: string[];
}

export interface BoardPlanOutput {
  boards: {
    name: string;
    description: string;
    category: string;
    target_keywords: string[];
    sections: string[];
    pin_frequency: number;
    priority: "high" | "medium" | "low";
  }[];
}

export function boardPlanPrompts(input: BoardPlanInput) {
  const systemPrompt = `You are an expert Pinterest board strategist for e-commerce brands. Create board plans that build TOPICAL AUTHORITY and maximize search visibility.

CRITICAL STRATEGY — Keyword-Themed Boards (NOT Product-Themed):
Pinterest's algorithm rewards accounts that demonstrate expertise in a topic. Boards must be organized around SEARCH INTENT CLUSTERS, not product categories.

BAD (product-themed):
- "Our Moisturizers", "Best Sellers", "New Arrivals"
GOOD (keyword/intent-themed):
- "Morning Skincare Routine Ideas", "Anti-Aging Tips & Products", "Natural Glow Makeup Looks"

Board creation rules:
- Board names: max 50 chars, keyword-rich, match Pinterest search queries exactly
- Think: "What would someone type into Pinterest search?" — that's your board name
- Descriptions: max 500 chars, front-load primary keyword, include 3-5 related keywords naturally, mention brand once
- Each board = one keyword cluster = one search intent
- Include 3-5 sections per board (sections also rank in Pinterest search)
- Section names should be keyword-rich sub-topics
- Create 8-15 boards total:
  - 5-8 "core" boards: directly related to products + high search volume keywords
  - 2-4 "lifestyle" boards: aspirational content that connects products to broader interests
  - 1-2 "educational" boards: tips, how-tos, guides (these get 30% more saves)
- Higher-priority boards should map to higher-volume keyword clusters
- Board names must NEVER include the brand name (wastes characters, hurts SEO)

Output valid JSON matching this schema:
{
  "boards": [{
    "name": string (max 50 chars),
    "description": string (max 500 chars),
    "category": string,
    "target_keywords": string[],
    "sections": string[],
    "pin_frequency": number (pins per week),
    "priority": "high" | "medium" | "low"
  }]
}`;

  const categories = input.keywordStrategy.categories
    .map((c) => `- ${c.name}: ${c.keywords.slice(0, 5).join(", ")} (${c.board_potential})`)
    .join("\n");

  const primaryKeywords = input.keywordStrategy.primary_keywords
    .map((k) => k.keyword)
    .join(", ");

  const userPrompt = `Create a Pinterest board plan for:

Brand: ${input.brand.name}
Industry: ${input.brand.industry}
Description: ${input.brand.description}
${input.brand.target_audience ? `Target Audience: ${input.brand.target_audience}` : ""}

Keyword Categories:
${categories}

Top Keywords: ${primaryKeywords}

${input.existingBoards?.length ? `Existing boards (avoid duplicates): ${input.existingBoards.join(", ")}` : ""}

Create boards that cover the main keyword categories and maximize Pinterest search visibility.`;

  return { systemPrompt, userPrompt };
}
