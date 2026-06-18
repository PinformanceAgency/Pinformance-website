import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function getAnthropicClient(apiKey?: string): Anthropic {
  // If a per-org key is provided, create a new (non-singleton) client
  if (apiKey) {
    return new Anthropic({ apiKey });
  }
  // Otherwise use the global singleton backed by env var
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

function extractJsonFromText<T>(text: string): T {
  // Try multiple patterns in order of preference.
  const patterns: RegExp[] = [
    /```json\s*([\s\S]*?)\s*```/,
    /```\s*([\s\S]*?)\s*```/,
    /(\{[\s\S]*\})/, // greedy: first `{` to last `}` in the response
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) {
      try {
        return JSON.parse(m[1]) as T;
      } catch {
        // try next pattern
      }
    }
  }
  // Include a short excerpt of what Claude actually said — makes debugging
  // refusals / wrong-format responses far easier than a blanket "Failed to
  // extract JSON from AI response".
  const excerpt = (text || "").trim().slice(0, 300) || "(empty response)";
  throw new Error(
    `Failed to extract JSON from AI response. Claude said: "${excerpt}${text.length > 300 ? "…" : ""}"`
  );
}

export async function generateJSON<T>(
  systemPrompt: string,
  userPrompt: string,
  model = "claude-sonnet-4-6",
  apiKey?: string
): Promise<T> {
  const anthropic = getAnthropicClient(apiKey);
  const response = await anthropic.messages.create({
    model,
    max_tokens: 8192,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";
  return extractJsonFromText<T>(text);
}

/**
 * Generate JSON with image analysis (multi-modal).
 * Sends an image URL to Claude for visual analysis alongside the text prompt.
 */
export async function generateJSONWithImage<T>(
  systemPrompt: string,
  userPrompt: string,
  imageUrl: string,
  model = "claude-sonnet-4-6",
  apiKey?: string
): Promise<T> {
  const anthropic = getAnthropicClient(apiKey);
  const response = await anthropic.messages.create({
    model,
    max_tokens: 8192,
    system: systemPrompt,
    messages: [{
      role: "user",
      content: [
        {
          type: "image",
          source: { type: "url", url: imageUrl },
        },
        {
          type: "text",
          text: userPrompt,
        },
      ],
    }],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";
  return extractJsonFromText<T>(text);
}
