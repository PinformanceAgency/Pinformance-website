/** One Claude call that must answer with JSON, and nothing else. */
import { getAnthropicClient } from "@/lib/ai/client";
import { MODEL } from "./constants";

function extractJson<T>(text: string): T {
  const fenced = /```(?:json)?\s*([\s\S]*?)\s*```/.exec(text);
  const candidates = [fenced?.[1], text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)];
  for (const c of candidates) {
    if (!c) continue;
    try {
      return JSON.parse(c) as T;
    } catch {
      /* next */
    }
  }
  throw new Error(`Claude did not return JSON: "${text.trim().slice(0, 300)}"`);
}

export async function askJSON<T>(system: string, user: string, maxTokens = 4096): Promise<T> {
  const res = await getAnthropicClient().messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });
  if (res.stop_reason === "max_tokens") throw new Error("Claude ran out of tokens before finishing the JSON");
  const text = res.content.map((c) => (c.type === "text" ? c.text : "")).join("");
  return extractJson<T>(text);
}
