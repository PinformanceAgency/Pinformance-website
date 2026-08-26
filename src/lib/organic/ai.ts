/**
 * Anthropic wrapper for the organic AI_DRAFT tasks (P3.2.1 / P3.2.2 /
 * P3.3.3). Every call is validated against the target's hard rules
 * (character limits, keyword-must-appear, no forbidden characters) and
 * regenerated up to N times before returning to the operator, so a
 * proposal that fails a validator is not shown.
 *
 * Every generation lands in organic.ai_drafts with prompt_version + a
 * timestamp, whether or not it gets approved. When the operator approves
 * (with edits), the approved_text is written back to the same row so we
 * can measure how much editing each AI surface required.
 */
import Anthropic from "@anthropic-ai/sdk";
import { organicPool } from "./db";

const MODEL_ID = "claude-haiku-4-5-20251001";
const PROMPT_VERSION = "v1-2026-08";
const MAX_ATTEMPTS = 3;

export type DraftKind =
  | "DISPLAY_NAME"
  | "BIO"
  | "BOARD_DESCRIPTION"
  | "MARKET_ANALYSIS"
  /** P4.2.8 — the four copy sets for one URL's designs. */
  | "PIN_COPY"
  /** P4.2.4, AI route — the prompt a designer or an image model runs. */
  | "IMAGE_PROMPT";

function anthropicClient(): Anthropic {
  const key = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPHIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");
  return new Anthropic({ apiKey: key });
}

/** Prompt + validator harness — regenerates on validator failure with
 *  explicit "you produced X but Y failed" feedback so the second attempt
 *  actually corrects instead of re-drafting from scratch. */
export async function generateWithValidator(
  systemPrompt: string,
  userPrompt: string,
  validate: (text: string) => { ok: boolean; errors: string[] },
  maxTokens = 400
): Promise<{ text: string; attempts: number; failed_attempts: string[] }> {
  const client = anthropicClient();
  const failed: string[] = [];
  let feedback = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const resp = await client.messages.create({
      model: MODEL_ID,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: attempt === 1 ? userPrompt : `${userPrompt}\n\nYour previous attempt was:\n"""${failed[failed.length - 1]}"""\n\nIt was rejected because: ${feedback}\n\nProduce a new attempt that fixes ALL of the above. Output the copy only, no preamble.` }],
    });
    const text = resp.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("")
      .trim()
      .replace(/^["']|["']$/g, "");
    const v = validate(text);
    if (v.ok) return { text, attempts: attempt, failed_attempts: failed };
    failed.push(text);
    feedback = v.errors.join("; ");
  }
  throw new Error(`AI failed all ${MAX_ATTEMPTS} attempts. Last errors: ${feedback}. Last output: "${failed[failed.length - 1].slice(0, 120)}"`);
}

/** Record every generation, whether approved or not. Returns the draft id. */
export async function persistDraft(orgId: string, kind: DraftKind, targetId: string | null, generatedText: string): Promise<string> {
  const pool = organicPool();
  const r = await pool.query<{ id: string }>(
    `INSERT INTO organic.ai_drafts (org_id, kind, target_id, generated_text, prompt_version, model_version)
     VALUES ($1, $2::text, $3, $4, $5, $6) RETURNING id::text`,
    [orgId, kind, targetId, generatedText, PROMPT_VERSION, MODEL_ID]
  );
  return r.rows[0].id;
}

export async function approveDraft(draftId: string, approvedText: string): Promise<void> {
  const pool = organicPool();
  await pool.query(
    `UPDATE organic.ai_drafts SET approved_text = $1, approved_at = now() WHERE id = $2`,
    [approvedText, draftId]
  );
}

/** Return the most recent draft for a kind + target, so re-opening a form
 *  shows what was last generated (and what was approved on top of it). */
export async function latestDraft(orgId: string, kind: DraftKind, targetId: string | null) {
  const pool = organicPool();
  const r = await pool.query(
    `SELECT id::text, generated_text, approved_text, generated_at::text, approved_at::text
       FROM organic.ai_drafts
      WHERE org_id = $1 AND kind = $2
        AND (target_id = $3 OR ($3::uuid IS NULL AND target_id IS NULL))
      ORDER BY generated_at DESC LIMIT 1`,
    [orgId, kind, targetId]
  );
  return r.rows[0] ?? null;
}
