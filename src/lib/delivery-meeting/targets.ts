/**
 * Stage · targets: the target each buyer set for the data week, read from the
 * Weekly Store Logs. The decks show it next to each store.
 */
import { askJSON } from "./ai";
import { TARGETS_SYSTEM } from "./prompts";
import type { CollectedStore, RunPayload, Target } from "./types";
import { fmtPrep, meetingDates } from "./util";

/* ---------- targets ---------- */

/** Sections 4 (plan / target line) and 5 (midweek) — where a target is written. */
export function planSections(log: string | null | undefined): string | null {
  if (!log) return null;
  const parts = log.split(/\n(?=## )/).filter((p) => /^## [45]\s*·/.test(p.trim()));
  const text = parts.join("\n").trim();
  return text ? text.slice(0, 2500) : null;
}

/** Stores that still need a target read: they have a log. */
export function targetQueue(payload: RunPayload): CollectedStore[] {
  const seen = new Set(payload.targets_checked ?? []);
  return (payload.stores ?? []).filter((s) => !seen.has(s.key) && payload.logs?.[s.key]?.archived);
}

/**
 * Targets for one batch of stores. Batched because the answer for a whole
 * stream (26 stores) took 54 s at the model's ~60 tokens a second — no room
 * left in an invocation for anything else.
 */
export async function extractTargets(payload: RunPayload, batch: CollectedStore[]): Promise<Record<string, Target>> {
  const blocks: string[] = [];
  for (const s of batch) {
    const log = planSections(payload.logs?.[s.key]?.archived);
    blocks.push(
      [
        `### ${s.name}${s.spend_account ? " (spend account)" : ""}`,
        `Last week: spend per day ${fmtPrep(s.cur, s.prev.spend / 7)}, revenue for the week ${fmtPrep(s.cur, s.prev.revenue)}, invoice ROAS ${s.invoice.toFixed(2)}`,
        log ? `Log for the data week (plan and midweek):\n${log}` : "Log for the data week: none",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  if (!blocks.length) return {};
  const dates = meetingDates(payload.meeting_date);
  const res = await askJSON<{ targets: (Target & { store: string })[] }>(
    TARGETS_SYSTEM,
    `The data week is ${dates.data_start} to ${dates.data_end}.\n\n${blocks.join("\n\n")}`,
    6000,
  );
  const byName = new Map(batch.map((s) => [s.name.toLowerCase(), s]));
  const out: Record<string, Target> = {};
  for (const t of res.targets ?? []) {
    const s = byName.get(String(t.store).toLowerCase());
    if (!s) continue;
    const { store: _drop, ...rest } = t;
    void _drop;
    out[s.key] = rest;
  }
  return out;
}
