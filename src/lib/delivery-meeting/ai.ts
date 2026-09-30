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
    // Sonnet 5 thinks by default and bills it as output. Measured 30-09-2026 on
    // a 10k deep-dive chunk: 4,853 output tokens of which 3,653 thinking, 51 s;
    // at low effort 1,526 tokens, 16 s, and the same findings text. Low keeps
    // every step inside one cron tick and halves what a run costs (~$0.55).
    output_config: { effort: "low" },
    system,
    messages: [{ role: "user", content: user }],
  });
  if (res.stop_reason === "max_tokens") throw new Error("Claude ran out of tokens before finishing the JSON");
  const text = res.content.map((c) => (c.type === "text" ? c.text : "")).join("");
  return extractJson<T>(text);
}
