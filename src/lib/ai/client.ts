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

export async function generateJSON<T>(
  systemPrompt: string,
  userPrompt: string,
  model = "claude-sonnet-4-20250514",
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

  // Extract JSON from response (handles ```json blocks)
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/(\{[\s\S]*\})/);
  if (!jsonMatch?.[1]) {
    throw new Error("Failed to extract JSON from AI response");
  }
  return JSON.parse(jsonMatch[1]) as T;
}

/**
 * Generate JSON with image analysis (multi-modal).
 * Sends an image URL to Claude for visual analysis alongside the text prompt.
 */
export async function generateJSONWithImage<T>(
  systemPrompt: string,
  userPrompt: string,
  imageUrl: string,
  model = "claude-sonnet-4-20250514",
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

  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/(\{[\s\S]*\})/);
  if (!jsonMatch?.[1]) {
    throw new Error("Failed to extract JSON from AI response");
  }
  return JSON.parse(jsonMatch[1]) as T;
}
