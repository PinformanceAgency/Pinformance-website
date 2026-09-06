/**
 * Unsaved form state, kept somewhere other than the browser.
 *
 * Every phase-2 form holds its answers in React state until one Save button
 * at the bottom succeeds. Anything between typing and that button — a thrown
 * render, a save the server refuses, a closed tab — takes the lot with it,
 * which is how Fit Cherries lost a day of market research on 06-09-2026.
 *
 * A draft is not a record. `grid_analyses` and friends stay the source of
 * truth and a draft is deleted the moment a real save lands. It exists so the
 * browser is never the only place the work exists.
 */
import { organicPool } from "./db";

export interface Draft {
  payload: unknown;
  updated_at: string;
}

export async function saveDraft(
  orgId: string, taskId: string, payload: unknown, updatedBy?: string | null
): Promise<{ updated_at: string }> {
  const r = await organicPool().query(
    `INSERT INTO organic.form_drafts (org_id, task_id, payload, updated_at, updated_by)
     VALUES ($1, $2, $3::jsonb, now(), $4)
     ON CONFLICT (org_id, task_id) DO UPDATE
       SET payload = EXCLUDED.payload, updated_at = now(), updated_by = EXCLUDED.updated_by
     RETURNING updated_at`,
    [orgId, taskId, JSON.stringify(payload ?? null), updatedBy ?? null]
  );
  return { updated_at: r.rows[0].updated_at };
}

export async function loadDraft(orgId: string, taskId: string): Promise<Draft | null> {
  const r = await organicPool().query(
    `SELECT payload, updated_at FROM organic.form_drafts WHERE org_id=$1 AND task_id=$2`,
    [orgId, taskId]
  );
  return r.rows[0] ?? null;
}

export async function clearDraft(orgId: string, taskId: string): Promise<void> {
  await organicPool().query(
    `DELETE FROM organic.form_drafts WHERE org_id=$1 AND task_id=$2`, [orgId, taskId]
  );
}

/** Every task on this org that has work typed into it but not saved — so a
 *  board can say so rather than leaving it to be discovered by accident. */
export async function loadDraftIndex(orgId: string): Promise<Record<string, string>> {
  const r = await organicPool().query(
    `SELECT task_id, updated_at FROM organic.form_drafts WHERE org_id=$1`, [orgId]
  );
  return Object.fromEntries(r.rows.map((x) => [x.task_id as string, x.updated_at as string]));
}
