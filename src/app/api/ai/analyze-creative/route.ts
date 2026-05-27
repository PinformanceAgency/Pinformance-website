import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { generateJSON, generateJSONWithImage } from "@/lib/ai/client";
import { decrypt } from "@/lib/encryption";
import { DeepgramClient } from "@/lib/deepgram/client";
import { getOrgIdFromProfile } from "@/lib/auth/effective-org";

import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";

async function ensureClaudeSafeSize(imageUrl: string, admin: SupabaseClient): Promise<string> {
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return imageUrl;
    const buf = Buffer.from(await res.arrayBuffer());
    const meta = await sharp(buf).metadata();
    if ((meta.width || 0) <= 7500 && (meta.height || 0) <= 7500) return imageUrl;
    const resized = await sharp(buf).rotate().resize(7500, 7500, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 95, mozjpeg: true }).toBuffer();
    const path = `tmp/claude-resize/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const { error } = await admin.storage.from("pin-images").upload(path, resized, { contentType: "image/jpeg", upsert: true });
    if (error) return imageUrl;
    const { data: signed } = await admin.storage.from("pin-images").createSignedUrl(path, 600);
    return signed?.signedUrl || imageUrl;
  } catch {
    return imageUrl;
  }
}

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
    .select("org_id, role, active_org_id")
    .eq("id", user.id)
    .single();

  if (!getOrgIdFromProfile(profile)) return NextResponse.json({ error: "No org" }, { status: 400 });
  const orgId = getOrgIdFromProfile(profile);

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

  // Brand-specific context lives on the brand profile (raw_data). Pull
  // whatever's available so Claude has accurate per-brand context.
  const brandRaw = (brand?.raw_data as Record<string, unknown> | null) || {};

  // Resolve the brand's preferred title length. The picker lives in the
  // creatives settings tab; default to "medium" when nothing is set or
  // the saved value is unrecognized. Keep this table in sync with
  // TITLE_LENGTH_BANDS in src/components/creatives/overlay-settings.tsx.
  const TITLE_LENGTH_INSTRUCTIONS: Record<string, { range: string; guidance: string }> = {
    really_small: {
      range: "2–3 words (about 10–20 characters)",
      guidance: "Punchy hook — image carries the meaning. No filler words.",
    },
    small: {
      range: "4–5 words (about 20–35 characters)",
      guidance: "Short headline that reads fast in the Pinterest feed on mobile.",
    },
    medium: {
      range: "6–8 words (about 35–55 characters)",
      guidance: "Balanced — primary keyword plus a clear value prop.",
    },
    large: {
      range: "9–11 words (about 55–75 characters)",
      guidance: "Descriptive — keyword + benefit + audience cue.",
    },
    really_large: {
      range: "12–15 words (about 75–100 characters, must stay ≤100)",
      guidance: "SEO-heavy — multiple long-tail keywords, still natural English.",
    },
  };
  const titleLengthKey =
    typeof brandRaw.title_length === "string" && brandRaw.title_length in TITLE_LENGTH_INSTRUCTIONS
      ? (brandRaw.title_length as string)
      : "medium";
  const titleLengthRule = TITLE_LENGTH_INSTRUCTIONS[titleLengthKey];
  const pickString = (...keys: string[]): string => {
    for (const k of keys) {
      const v = brandRaw[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
  };
  const brandUsp = pickString("usp", "positioning", "brand_usp");
  const brandDescription = pickString("description", "about", "summary");
  const brandIndustry = pickString("industry", "category");
  const brandStyle = pickString("brand_style", "style", "aesthetic");

  const boardList = boards.map((b) => `"${b.name}" (${b.category || "general"}, keywords: ${(b.keywords || []).slice(0, 3).join(", ")})`).join("\n");
  const keywordList = keywords.map((k) => k.keyword).join(", ");

  const brandContextBlock = [
    brandIndustry && `- Industry / category: ${brandIndustry}`,
    brandDescription && `- About the brand: ${brandDescription}`,
    brandStyle && `- Visual style / aesthetic: ${brandStyle}`,
    brandVoice && `- Brand voice: ${brandVoice}`,
    brandUsp && `- USP / positioning: ${brandUsp}`,
  ].filter(Boolean).join("\n");

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
- Title: max 100 chars. TARGET LENGTH: ${titleLengthRule.range}. ${titleLengthRule.guidance} Must contain the primary keyword. Every word must earn its place — no filler.
- Description: max 500 chars but keep concise and meaningful. Brand name "${brandName}" in first sentence. Include 1-2 relevant keywords naturally. Written as natural helpful sentences — not keyword lists. Include a soft CTA where appropriate.
- Keywords: mix of broad and specific, include seasonal terms where relevant.
- Suggested boards: pick ALL boards that match this content (usually 2-4 boards)
- No hashtags anywhere
${brandContextBlock ? `\nBRAND CONTEXT (use to inform tone, terminology, audience — weave naturally, don't force-fit):\n${brandContextBlock}\n` : ""}

STRICT ACCURACY RULES:
- Describe ONLY what you can actually see. Never invent product features, materials, or attributes that aren't clearly visible.
- NEVER use "before and after", "transformation", or "comparison" unless two side-by-side images are shown
- NEVER use "tutorial" or "how to" unless there are actual instructional steps
- NEVER use "collection" or "Group" followed by numbers (e.g., from filenames)
- Describe visible colors, styles, setting, mood
- A single person/object shown straight = PRODUCT SHOWCASE
- Keywords must match what is visually confirmed in the image

OUTPUT FORMAT — IMPORTANT:
Respond with ONLY a JSON object (no preamble, no markdown fences, no commentary).
Even if the image doesn't perfectly match the brand or you're uncertain, you MUST still
return a valid JSON object describing what you see honestly. If you genuinely cannot
describe the image, return a JSON object with conservative generic descriptions of the
visible subject matter — do NOT refuse with prose.

Available boards:
${boardList}

Brand keywords (use ONLY if relevant to this content): ${keywordList}

JSON shape:
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
- What specific products or subjects are shown? (color, style, type)
- What is in the foreground? Setting/background?
- How many people/items are visible?

Generate Pinterest SEO that accurately describes THIS specific visual content.
Do NOT use the words "collection", "Group", or numbers from filenames.
Do NOT say "before and after" or "transformation" unless you see two side-by-side comparison images.
Describe the actual visible styles, colors, and mood of the shot.`;

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
    userPrompt = `Generate Pinterest SEO for a video by ${brandName}.
${brandContextBlock ? `Brand context:\n${brandContextBlock}\n` : ""}
Do NOT use numbers, "Group", or "collection" from the filename "${file_name}".
Generate SEO consistent with this brand's typical content.`;

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
      : await generateJSONWithImage<AnalysisOutput>(systemPrompt, userPrompt, await ensureClaudeSafeSize(image_url, createAdminClient()), undefined, apiKey);

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
