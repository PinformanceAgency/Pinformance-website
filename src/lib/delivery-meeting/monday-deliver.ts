/**
 * Delivery on monday instead of Slack: per meeting a to-do for Tycho in
 * "Tycho To Do's" (Operations To Do's), with the Dutch summary as an update
 * and the decks and the prep attached to that update. The monday token the
 * weekly-update crons already use can do all of it — no Slack app, no bot
 * token (Tristan, 29-09-2026).
 *
 * Idempotent per step: the item id, the update id and every file that has
 * landed are kept in the run's payload, so a run that dies half-way uploads
 * only what is still missing and never creates a second to-do.
 */
import { MONDAY_DELIVERY } from "./constants";

type Q = (query: string, variables: Record<string, unknown>) => Promise<any>;
let q: Q | null = null;
async function monday(query: string, variables: Record<string, unknown> = {}) {
  if (!q) q = (await import("../../../scripts/weekly-update-sync")).mondayQuery as Q;
  return q(query, variables);
}

export async function createTodo(opts: {
  name: string;
  deadline: string;
  personId: number;
  group: string;
}): Promise<string> {
  const values = {
    [MONDAY_DELIVERY.COL_PERSON]: { personsAndTeams: [{ id: opts.personId, kind: "person" }] },
    [MONDAY_DELIVERY.COL_STATUS]: { label: MONDAY_DELIVERY.STATUS_TODO },
    [MONDAY_DELIVERY.COL_DEADLINE]: { date: opts.deadline },
    [MONDAY_DELIVERY.COL_PRIORITY]: { label: MONDAY_DELIVERY.PRIORITY },
  };
  const data = await monday(
    `mutation ($b: ID!, $g: String!, $n: String!, $v: JSON!) {
       create_item(board_id: $b, group_id: $g, item_name: $n, column_values: $v, create_labels_if_missing: false) { id }
     }`,
    { b: String(MONDAY_DELIVERY.BOARD), g: opts.group, n: opts.name, v: JSON.stringify(values) },
  );
  return String(data.create_item.id);
}

export async function createUpdate(itemId: string, html: string): Promise<string> {
  const data = await monday(`mutation ($i: ID!, $b: String!) { create_update(item_id: $i, body: $b) { id } }`, {
    i: itemId,
    b: html,
  });
  return String(data.create_update.id);
}

/**
 * One file onto an update. The file endpoint takes multipart, not JSON, so
 * this is a plain fetch with the same token rather than mondayQuery.
 */
export async function attachFile(updateId: string, name: string, data: Buffer): Promise<void> {
  const token = process.env.MONDAY_API_TOKEN;
  if (!token) throw new Error("MONDAY_API_TOKEN is not set");
  const form = new FormData();
  form.append("query", `mutation ($file: File!) { add_file_to_update(update_id: ${Number(updateId)}, file: $file) { id } }`);
  form.append("variables[file]", new Blob([new Uint8Array(data)]), name);
  const res = await fetch("https://api.monday.com/v2/file", {
    method: "POST",
    headers: { Authorization: token, "API-Version": "2024-10" },
    body: form,
    signal: AbortSignal.timeout(40_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.errors || body.error_message) {
    throw new Error(`monday upload of ${name}: ${res.status} ${JSON.stringify(body.errors ?? body.error_message ?? body).slice(0, 300)}`);
  }
}

/** Slack-style *bold* lines → the HTML a monday update renders. */
export function toUpdateHtml(text: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc(text)
    .replace(/\*([^*\n]+)\*/g, "<b>$1</b>")
    .split("\n")
    .join("<br>");
}
