import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { generateJSON } from "@/lib/ai/client";
import { decrypt } from "@/lib/encryption";

export const maxDuration = 60;

interface AnalysisOutput {
  title: string;
  description: string;
  alt_text: string;
  keywords: string[];
  suggested_board: string;
  text_overlay: string;
}

/**
 * POST /api/ai/analyze-creative
 * Analyzes an uploaded creative image and generates SEO-optimized
 * title, description, keywords, and board assignment.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("users")
    .select("org_id")
    .eq("id", user.id)
    .single();

  if (!profile?.org_id) return NextResponse.json({ error: "No org" }, { status: 400 });
  const orgId = profile.org_id;

  const body = await request.json();
  const { image_url } = body;

  if (!image_url) {
    return NextResponse.json({ error: "image_url required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Load org, boards, brand profile, keywords
  const [orgRes, boardsRes, brandRes, keywordsRes] = await Promise.all([
    admin.from("organizations").select("name, anthropic_api_key_encrypted").eq("id", orgId).single(),
    admin.from("boards").select("id, name, keywords, category").eq("org_id", orgId).in("status", ["active", "draft"]),
    admin.from("brand_profiles").select("brand_voice, raw_data").eq("org_id", orgId).single(),
    admin.from("keywords").select("keyword, category").eq("org_id", orgId).order("performance_score", { ascending: false }).limit(20),
  ]);

  const org = orgRes.data;
  const boards = boardsRes.data || [];
  const brand = brandRes.data;
  const keywords = keywordsRes.data || [];

  // Get Anthropic API key
  let apiKey: string | undefined;
  if (org?.anthropic_api_key_encrypted) {
    try { apiKey = decrypt(org.anthropic_api_key_encrypted); } catch { /* fallback */ }
  }

  const brandName = org?.name || "Brand";
  const brandVoice = brand?.brand_voice || "";
  const boardList = boards.map((b) => `"${b.name}" (${b.category || "general"}, keywords: ${(b.keywords || []).slice(0, 3).join(", ")})`).join("\n");
  const keywordList = keywords.map((k) => k.keyword).join(", ");

  const systemPrompt = `You are a Pinterest SEO expert. You analyze product/lifestyle images and generate optimized pin content.

RULES:
- Title: max 100 chars, primary keyword in first 40 characters, no brand name at start
- Description: max 500 chars, start with brand name "${brandName}", 3-5 keywords naturally woven in
- No hashtags anywhere
- Keywords: mix of broad and specific, include seasonal terms
- Alt text: describe the image literally for accessibility
- Suggested board: pick the BEST matching board from the list below
${brandVoice ? `- Brand voice: ${brandVoice}` : ""}

Available boards:
${boardList}

Top keywords: ${keywordList}

The image URL will be provided. Describe what you see and generate content accordingly.

Output JSON:
{
  "title": string,
  "description": string,
  "alt_text": string,
  "keywords": string[],
  "suggested_board": string (exact board name from list),
  "text_overlay": string (3-8 words)
}`;

  const userPrompt = `Analyze this Pinterest creative image and generate SEO-optimized content:

Image URL: ${image_url}

Brand: ${brandName}
This is a brand-created organic creative. Generate the best possible Pinterest SEO content for maximum reach and engagement.`;

  try {
    const result = await generateJSON<AnalysisOutput>(
      systemPrompt,
      userPrompt,
      undefined,
      apiKey
    );

    // Find the matching board
    const matchedBoard = boards.find((b) =>
      b.name.toLowerCase() === result.suggested_board?.toLowerCase()
    ) || boards[0];

    return NextResponse.json({
      success: true,
      analysis: {
        ...result,
        board_id: matchedBoard?.id || null,
        board_name: matchedBoard?.name || result.suggested_board,
      },
    });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : "Analysis failed",
    }, { status: 500 });
  }
}
