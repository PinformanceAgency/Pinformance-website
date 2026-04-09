import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { generateJSON, generateJSONWithImage } from "@/lib/ai/client";
import { decrypt } from "@/lib/encryption";
import { DeepgramClient } from "@/lib/deepgram/client";

export const maxDuration = 120; // Transcription can take time

interface AnalysisOutput {
  title: string;
  description: string;
  alt_text: string;
  keywords: string[];
  suggested_boards?: string[];
  suggested_board?: string; // backwards compat
  text_overlay: string;
}

/**
 * POST /api/ai/analyze-creative
 * For images: analyzes visually via Claude
 * For videos: transcribes audio via Deepgram, then uses transcript for SEO
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
  const { image_url, media_type, file_name, thumbnail_url } = body;

  if (!image_url) {
    return NextResponse.json({ error: "image_url required" }, { status: 400 });
  }

  const isVideo = media_type === "video" || /\.(mov|mp4|avi|webm|mkv)$/i.test(file_name || "");

  const admin = createAdminClient();

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

  let apiKey: string | undefined;
  if (org?.anthropic_api_key_encrypted) {
    try { apiKey = decrypt(org.anthropic_api_key_encrypted); } catch { /* fallback */ }
  }

  const brandName = org?.name || "Brand";
  const brandVoice = brand?.brand_voice || "";
  const boardList = boards.map((b) => `"${b.name}" (${b.category || "general"}, keywords: ${(b.keywords || []).slice(0, 3).join(", ")})`).join("\n");
  const keywordList = keywords.map((k) => k.keyword).join(", ");

  // For videos: transcribe first, then use transcript for SEO
  let transcript = "";
  if (isVideo) {
    const deepgramKey = process.env.DEEPGRAM_API_KEY;
    if (deepgramKey) {
      try {
        const deepgram = new DeepgramClient(deepgramKey);
        console.log(`[AnalyzeCreative] Transcribing video: ${file_name}`);

        // Create a signed URL that Deepgram can access (public URLs may be blocked)
        const storagePath = image_url.split("/object/public/pin-images/")[1];
        if (storagePath) {
          // Try signed URL first (Deepgram fetches directly)
          const { data: signedData } = await admin.storage
            .from("pin-images")
            .createSignedUrl(storagePath, 300); // 5 min expiry

          if (signedData?.signedUrl) {
            console.log(`[AnalyzeCreative] Using signed URL for Deepgram`);
            transcript = await deepgram.transcribe(signedData.signedUrl);
          }

          // Fallback: download and send as binary
          if (!transcript) {
            console.log(`[AnalyzeCreative] Signed URL failed, trying binary download`);
            const { data: fileData, error: downloadErr } = await admin.storage
              .from("pin-images")
              .download(storagePath);

            if (fileData && !downloadErr) {
              const buffer = Buffer.from(await fileData.arrayBuffer());
              const chunk = buffer.subarray(0, 10 * 1024 * 1024);
              transcript = await deepgram.transcribeBinary(chunk, fileData.type || "video/mp4");
            } else {
              console.error(`[AnalyzeCreative] Download failed:`, downloadErr?.message);
            }
          }

          if (transcript) {
            console.log(`[AnalyzeCreative] Transcript (${transcript.length} chars): ${transcript.substring(0, 200)}`);
          }
        }
      } catch (err) {
        console.error(`[AnalyzeCreative] Transcription failed:`, err instanceof Error ? err.message : err);
      }
    }
  }

  const systemPrompt = `You are a Pinterest SEO expert. You analyze content and generate optimized pin titles, descriptions, and keywords.

CRITICAL RULES:
- The SEO MUST be based on the ACTUAL CONTENT of the creative, not generic product keywords
- Title: max 100 chars. Short, concise — one clear phrase. Must contain the primary keyword. Every word must earn its place — no filler.
- Description: max 500 chars but keep concise and meaningful. Brand name "${brandName}" in first sentence. Include 1-2 relevant keywords naturally. Written as natural helpful sentences — not keyword lists. Include a soft CTA where appropriate.
- Keywords: mix of broad and specific, include seasonal terms where relevant.
- Suggested boards: pick ALL boards that match this content (usually 2-4 boards)
${brandVoice ? `- Brand voice: ${brandVoice}` : ""}
- No hashtags anywhere

BRAND USP (always weave in naturally):
- Fit Cherries bras are designed for small bust women and create a beautiful, flattering silhouette
- The key selling point: bras that make your bust look fuller and more shapely — a perfect fit that enhances your natural figure
- Use phrases like: "flattering fit", "enhances your silhouette", "fuller look", "perfect shape", "confidence-boosting fit"

STRICT ACCURACY RULES:
- NEVER guess specific technical bra features (wireless, push-up, padded, seamless) unless visually obvious
- NEVER use "before and after", "transformation", or "comparison" unless two side-by-side images are shown
- NEVER use "tutorial" or "how to" unless there are actual instructional steps
- NEVER use "collection" or "Group" followed by numbers
- Describe the visible color, style (lace, solid, strappy), and setting
- A single person wearing a product = PRODUCT SHOWCASE
- Keywords must match what is visually confirmed PLUS the brand USP terms above

Available boards:
${boardList}

Brand keywords (use ONLY if relevant to this content): ${keywordList}

Output JSON:
{
  "title": string,
  "description": string,
  "alt_text": string,
  "keywords": string[],
  "suggested_boards": string[] (exact board names from list, ALL that match),
  "text_overlay": string (3-8 words)
}`;

  let userPrompt: string;

  if (isVideo && transcript) {
    // Video with transcript — use the actual spoken content
    userPrompt = `Generate Pinterest SEO for this video based on its ACTUAL CONTENT.

Video filename: ${file_name || "video.mp4"}
Brand: ${brandName}

VIDEO TRANSCRIPT:
"""
${transcript}
"""

Based on what is actually said and shown in this video, generate accurate SEO content.
The title and description must reflect what THIS specific video is about — not generic product descriptions.
If the video is about ranking places, the SEO should be about ranking places.
If it's a tutorial, the SEO should describe that specific tutorial.
If it's a review or comparison, reflect that in the SEO.`;

  } else if (isVideo) {
    // Video without transcript — use client-extracted thumbnail for Claude Vision
    // The client sends thumbnail_url (a JPEG of the first frame)
    const thumbUrl = thumbnail_url || null;

    if (thumbUrl) {
      // Get signed URL for thumbnail if it's in Supabase
      let accessibleThumbUrl = thumbUrl;
      const thumbPath = thumbUrl.split("/object/public/pin-images/")[1];
      if (thumbPath) {
        const { data: thumbSigned } = await admin.storage.from("pin-images").createSignedUrl(thumbPath, 300);
        if (thumbSigned?.signedUrl) accessibleThumbUrl = thumbSigned.signedUrl;
      }

      userPrompt = `This is a frame from a video by ${brandName}.

Brand: ${brandName}

Look at this image carefully. Describe EXACTLY what you see:
- What specific products are shown? (color, style, type)
- What are the people wearing?
- What is the setting/background?
- How many people are visible?

Generate Pinterest SEO that accurately describes THIS specific visual content.
Do NOT use the words "collection", "Group", or numbers from filenames.
Do NOT say "before and after" or "transformation" unless you see two side-by-side comparison images.
Describe the actual bra/lingerie styles, colors, and the mood of the shot.`;

      try {
        const result = await generateJSONWithImage<AnalysisOutput>(systemPrompt, userPrompt, accessibleThumbUrl, undefined, apiKey);
        const suggestedNames = result.suggested_boards || (result.suggested_board ? [result.suggested_board] : []);
        const matchedBoards = suggestedNames.map((name) => boards.find((b) => b.name.toLowerCase() === name.toLowerCase())).filter(Boolean) as typeof boards;
        if (matchedBoards.length === 0 && boards.length > 0) matchedBoards.push(boards[0]);

        return NextResponse.json({
          success: true,
          analysis: { ...result, board_id: matchedBoards[0]?.id || null, board_name: matchedBoards[0]?.name || "", boards: matchedBoards.map((b) => ({ id: b.id, name: b.name })) },
          method: "video-thumbnail-vision",
        });
      } catch (visionErr) {
        console.error("[AnalyzeCreative] Thumbnail vision failed:", visionErr instanceof Error ? visionErr.message : visionErr);
      }
    }

    // Final fallback: filename-based (no thumbnail available)
    userPrompt = `Generate Pinterest SEO for a video by ${brandName} (lingerie/bra brand for small bust women).
The video likely shows lingerie/bra products being modeled.
Do NOT use numbers, "Group", or "collection" from the filename "${file_name}".
Generate SEO about the type of lingerie content this brand creates.`;

  } else {
    // Image — will be analyzed visually by Claude
    userPrompt = `Look at this image carefully. Describe what you see — the subject, the setting, the style, the mood.

Brand: ${brandName}

Based on what you ACTUALLY SEE in this image, generate Pinterest SEO content.
- If it shows a painting tutorial, describe that specific tutorial
- If it shows a product in use, describe how it's being used
- If it shows finished artwork, describe the artwork
- Do NOT generate generic product descriptions — be specific to what's in this image`;
  }

  try {
    // Use vision for images, text-only for videos (transcript-based)
    const result = isVideo
      ? await generateJSON<AnalysisOutput>(systemPrompt, userPrompt, undefined, apiKey)
      : await generateJSONWithImage<AnalysisOutput>(systemPrompt, userPrompt, image_url, undefined, apiKey);

    // Match all suggested boards
    const suggestedNames = result.suggested_boards || (result.suggested_board ? [result.suggested_board] : []);
    const matchedBoards = suggestedNames
      .map((name) => boards.find((b) => b.name.toLowerCase() === name.toLowerCase()))
      .filter(Boolean) as typeof boards;

    // Fallback: if no boards matched, use first board
    if (matchedBoards.length === 0 && boards.length > 0) {
      matchedBoards.push(boards[0]);
    }

    return NextResponse.json({
      success: true,
      analysis: {
        ...result,
        // Primary board (backwards compat)
        board_id: matchedBoards[0]?.id || null,
        board_name: matchedBoards[0]?.name || suggestedNames[0] || "",
        // All matching boards
        boards: matchedBoards.map((b) => ({ id: b.id, name: b.name })),
      },
      transcript: transcript ? transcript.substring(0, 500) : null,
    });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : "Analysis failed",
    }, { status: 500 });
  }
}
