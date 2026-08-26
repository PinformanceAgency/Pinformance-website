/**
 * Help Center orchestrator.
 *
 * Calls the Claude API with three "modes" exposed as tool definitions:
 *   1. One tool per Help Center capability (apply mutation).
 *   2. `answer_question` — read-only natural answer (no mutation).
 *   3. `mark_unsupported` — request requires a developer / code change.
 *
 * Claude picks exactly one tool based on the admin's prompt. The API
 * route then dispatches to the matching capability handler or just
 * relays the answer / unsupported message back to the admin.
 */
import { getAnthropicClient } from "@/lib/ai/client";
import { CAPABILITY_REGISTRY } from "./capabilities";

export type OrchestratorResult =
  | {
      kind: "apply";
      capability: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      params: any;
    }
  | { kind: "answer"; message: string }
  | { kind: "unsupported"; reason: string };

interface OrchestratorContext {
  orgName: string;
  /** Concise summary of the current brand profile so Claude has context. */
  brandSummary: string;
  /** Optional per-org Anthropic API key (decrypted). Falls back to the
   *  global ANTHROPIC_API_KEY env var when omitted. */
  anthropicApiKey?: string;
}

const SYSTEM_PROMPT = `You are the Pinformance Help Center assistant.

Pinformance is a Pinterest media-buying agency SaaS that manages multiple e-commerce client organizations (orgs). You assist an **agency admin** who is logged in and is asking for a change OR an answer related to ONE specific org (the active org).

Your job is to map the admin's request to exactly ONE of the available tools:

1. **A capability tool** — when the admin asks for a concrete, factual change to brand settings, naming, copy, or configuration that one of the listed capabilities can perform. Pick the most specific capability that matches.

2. **answer_question** — when the admin is asking a question, asking for information, or asking for help understanding something. No mutation.

3. **mark_unsupported** — when the request requires a code change (new feature, visual layout change, bug fix in the app itself), or when it cannot be expressed cleanly with any of the listed capabilities, or when it's too subjective for a deterministic mapping. In the \`reason\` field, briefly explain why the developer is needed.

GUIDELINES:
- If the admin is fixing a typo in the brand name, use \`update_org_name\`.
- If they're updating brand voice, target audience, USPs, colors, tone/avoid keywords — use the dedicated capability.
- If they're updating a free-form text field like 'website', 'description', 'default landing page', 'pin title template' — use \`update_brand_raw_field\` with the appropriate snake_case field key.
- Don't invent capabilities that aren't in the tool list. If unsure, mark_unsupported.
- For questions about which client to act on: assume the active org passed in the system context.
- Be concise; the admin already typed what they want.`;

function buildToolDefinitions() {
  const capabilityTools = CAPABILITY_REGISTRY.map((cap) => ({
    name: cap.name,
    description: cap.description,
    input_schema: cap.jsonSchema as { type: "object"; [k: string]: unknown },
  }));
  const answerTool = {
    name: "answer_question",
    description:
      "Answer the admin's question in plain language. Use when no mutation is requested.",
    input_schema: {
      type: "object" as const,
      properties: {
        message: { type: "string", description: "The answer to show the admin." },
      },
      required: ["message"],
    },
  };
  const unsupportedTool = {
    name: "mark_unsupported",
    description:
      "Mark the request as requiring the developer (code change, new feature, anything not in the capability list).",
    input_schema: {
      type: "object" as const,
      properties: {
        reason: {
          type: "string",
          description:
            "Brief 1-2 sentence explanation of why the developer is needed.",
        },
      },
      required: ["reason"],
    },
  };
  return [...capabilityTools, answerTool, unsupportedTool];
}

export async function orchestrate(
  prompt: string,
  ctx: OrchestratorContext
): Promise<OrchestratorResult> {
  const anthropic = getAnthropicClient(ctx.anthropicApiKey);
  const userMessage =
    `Active org: ${ctx.orgName}\n` +
    `Current brand profile (snapshot):\n${ctx.brandSummary}\n\n` +
    `Admin request:\n${prompt}`;

  const response = await anthropic.messages.create({
    // Same model the rest of the codebase uses for AI tasks (see src/lib/ai/client.ts).
    // The previous date-suffixed ID (claude-sonnet-4-20250514) was decommissioned
    // and returned 404 not_found_error; claude-sonnet-4-6 is the current Sonnet.
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    tools: buildToolDefinitions(),
    tool_choice: { type: "any" },
    messages: [{ role: "user", content: userMessage }],
  });

  // Find the first tool_use block in the response.
  for (const block of response.content) {
    if (block.type === "tool_use") {
      const name = block.name;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const input = block.input as any;
      if (name === "answer_question") {
        return { kind: "answer", message: String(input?.message ?? "") };
      }
      if (name === "mark_unsupported") {
        return { kind: "unsupported", reason: String(input?.reason ?? "") };
      }
      // Otherwise it's a capability.
      return { kind: "apply", capability: name, params: input };
    }
  }

  // Fallback: Claude didn't return a tool_use block. Treat as unsupported.
  return {
    kind: "unsupported",
    reason:
      "The system could not classify your request automatically. Try phrasing it more concretely, or ask a developer.",
  };
}
