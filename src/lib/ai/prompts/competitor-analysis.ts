import type { Competitor } from "@/lib/types";

interface CompetitorData extends Competitor {
  boards?: { name: string; pin_count: number; description: string | null }[];
  recent_pins?: { title: string; description: string | null; saves: number }[];
}

interface CompetitorAnalysisInput {
  competitors: CompetitorData[];
  brandKeywords: string[];
  brandBoards: string[];
}

export interface CompetitorAnalysisOutput {
  content_themes: string[];
  keyword_gaps: string[];
  board_structure_insights: string[];
  posting_patterns: {
    frequency: string;
    peak_times: string[];
  };
  recommendations: string[];
}

export function competitorAnalysisPrompts(input: CompetitorAnalysisInput) {
  const systemPrompt = `You are a competitive intelligence analyst specializing in Pinterest strategy for e-commerce brands.

Analyze competitor data to find:
- Content themes and patterns that drive engagement
- Keyword gaps — terms competitors rank for that the brand doesn't use
- Board structure insights — how competitors organize their content
- Posting frequency and timing patterns
- Actionable recommendations to outperform competitors

Be specific and data-driven. Reference actual competitor data in your analysis.

Output valid JSON:
{
  "content_themes": string[],
  "keyword_gaps": string[],
  "board_structure_insights": string[],
  "posting_patterns": {
    "frequency": string,
    "peak_times": string[]
  },
  "recommendations": string[]
}`;

  const competitorDetails = input.competitors
    .map((c) => {
      let detail = `@${c.pinterest_username} (${c.display_name || "unknown"})
  Followers: ${c.follower_count || "?"}
  Boards: ${c.board_count || "?"}
  Pins: ${c.pin_count || "?"}
  Avg posting frequency: ${c.avg_posting_frequency || "?"} pins/day
  Top keywords: ${c.top_keywords.join(", ") || "none scraped"}`;

      if (c.boards?.length) {
        detail += `\n  Board names: ${c.boards.map((b) => `"${b.name}" (${b.pin_count} pins)`).join(", ")}`;
      }
      if (c.recent_pins?.length) {
        detail += `\n  Recent top pins: ${c.recent_pins.slice(0, 5).map((p) => `"${p.title}" (${p.saves} saves)`).join(", ")}`;
      }
      return detail;
    })
    .join("\n\n");

  const userPrompt = `Analyze these Pinterest competitors:

${competitorDetails}

Brand's current keywords: ${input.brandKeywords.slice(0, 30).join(", ")}
Brand's current boards: ${input.brandBoards.join(", ") || "none yet"}

Identify gaps, opportunities, and specific actions to gain a competitive edge on Pinterest.`;

  return { systemPrompt, userPrompt };
}
