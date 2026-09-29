/**
 * Stages 3 and 5 · targets and briefs, plus the prep data they feed.
 *
 * Code decides what code can decide: the numbers line, the week status, and
 * which ASK a store gets (by outcome, the spec's four cases). Claude writes
 * only the prose around them — and the one ASK that needs the to-dos'
 * wording, "why were these not done, and when".
 */
import { BRIEF_BATCH } from "./constants";
import { askJSON } from "./ai";
import { BRIEF_SYSTEM, TARGETS_SYSTEM } from "./prompts";
import type { Brief, CollectedStore, DeckData, DeckStoreRow, RunPayload, Target } from "./types";
import { fmtPrep, meetingDates, pct } from "./util";

/* ---------- targets ---------- */

/** Sections 4 (plan / target line) and 5 (midweek) — where a target is written. */
export function planSections(log: string | null | undefined): string | null {
  if (!log) return null;
  const parts = log.split(/\n(?=## )/).filter((p) => /^## [45]\s*·/.test(p.trim()));
  const text = parts.join("\n").trim();
  return text ? text.slice(0, 2500) : null;
}

/** Stores that still need a target read: they have a log or a meeting target. */
export function targetQueue(payload: RunPayload): CollectedStore[] {
  const seen = new Set(payload.targets_checked ?? []);
  return (payload.stores ?? []).filter(
    (s) => !seen.has(s.key) && (payload.logs?.[s.key]?.archived || payload.fathom?.meeting_notes?.[s.key]?.target),
  );
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
    const meet = payload.fathom?.meeting_notes?.[s.key]?.target;
    blocks.push(
      [
        `### ${s.name}${s.spend_account ? " (spend account)" : ""}`,
        `Last week: spend per day ${fmtPrep(s.cur, s.prev.spend / 7)}, revenue for the week ${fmtPrep(s.cur, s.prev.revenue)}, invoice ROAS ${s.invoice.toFixed(2)}`,
        log ? `Log for the data week (plan and midweek):\n${log}` : "Log for the data week: none",
        meet ? `Meeting target: ${JSON.stringify(meet)}` : "",
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

/* ---------- the numbers line and the question ---------- */

export interface PrepStore {
  key: string;
  name: string;
  buyer: string;
  deck: string;
  status: "on" | "off" | "nodata";
  month_ok: boolean;
  numbers: {
    roas_prev: string;
    roas: string;
    roas_pct: number | null;
    invoice: string;
    volume_label: string;
    volume_prev: string;
    volume: string;
    volume_pct: number | null;
    target: string;
  };
  roas_ok: boolean;
  volume_ok: boolean;
  ask_rule: string;
  brief?: Brief;
}

/** Store rows for the prep, in the deck's order (first prep store = first deck store). */
export function prepStores(payload: RunPayload): PrepStore[] {
  const out: PrepStore[] = [];
  for (const deck of payload.decks ?? []) {
    const data = payload.deck_data?.[deck.key];
    if (!data) continue;
    for (const row of data.stores) {
      const s = payload.stores!.find((x) => x.key === row.key)!;
      out.push(prepRow(payload, deck.key, row, s));
    }
  }
  return out;
}

function prepRow(payload: RunPayload, deck: string, row: DeckStoreRow, s: CollectedStore): PrepStore {
  const [vNow, vPrev] = s.spend_account ? [s.week.spend, s.prev.spend] : [s.week.revenue, s.prev.revenue];
  const roasNow = s.week.spend ? s.week.revenue / s.week.spend : null;
  const roasPrev = s.prev.spend ? s.prev.revenue / s.prev.spend : null;
  const rp = roasNow != null && roasPrev ? (roasNow - roasPrev) / roasPrev : null;
  const vp = pct(vNow, vPrev);
  const noData = s.week_missing || (s.week.spend === 0 && s.week.revenue === 0 && s.prev.spend === 0);
  const numbers = {
    roas_prev: roasPrev ? roasPrev.toFixed(2) : "–",
    roas: roasNow ? roasNow.toFixed(2) : "—",
    roas_pct: rp == null ? null : rp * 100,
    invoice: s.invoice.toFixed(2),
    volume_label: s.spend_account ? "Spend" : "Revenue",
    volume_prev: vPrev ? fmtPrep(s.cur, vPrev) : "–",
    volume: fmtPrep(s.cur, vNow),
    volume_pct: vp == null ? null : vp * 100,
    target: fmtPrep(s.cur, s.week_floor),
  };
  return {
    key: s.key,
    name: s.name,
    buyer: row.buyer,
    deck,
    status: noData ? "nodata" : row.week_ok ? "on" : "off",
    month_ok: row.month_ok,
    numbers,
    roas_ok: row.wk_roas_ok,
    volume_ok: row.wk_rev_ok,
    ask_rule: askFor(payload, s, row, rp, vp),
  };
}

const notDone = (status: string) => !/^done$/i.test(status.trim());

/**
 * The spec's ASK by outcome:
 *   on track / clearly better → it worked, keep it
 *   better but still off      → next step to get above invoice / floor
 *   flat or worse             → what will you do differently
 *   to-dos not done           → why, and when (written by Claude, names them)
 *   no log                    → what is the plan
 */
function askFor(
  payload: RunPayload,
  s: CollectedStore,
  row: DeckStoreRow,
  roasPct: number | null,
  volPct: number | null,
): string {
  const log = payload.logs?.[s.key];
  const todos = payload.todos?.[s.key] ?? [];
  const meeting = payload.fathom?.meeting_notes?.[s.key]?.todos ?? [];
  const end = meetingDates(payload.meeting_date).data_end;
  const open = todos.filter((t) => notDone(t.status) && (!t.deadline || t.deadline <= end));
  const noSpend = s.week.spend === 0 && s.prev.spend === 0;
  if (noSpend || (!log && todos.length === 0 && meeting.length === 0)) return "What is your plan for this store this week?";
  if (open.length) return `WRITE_TODO_QUESTION: ${open.map((t) => `"${t.name}"`).join(", ")}`;
  const r = roasPct ?? 0;
  const v = volPct ?? 0;
  const clearlyBetter = (r >= 0.1 && v >= 0.1) || (r >= 0.2 && v >= 0) || (v >= 0.2 && r >= 0);
  if (row.week_ok || clearlyBetter) return "It worked. What will you do this week to keep this?";
  const better = (r > 0.02 && v >= -0.05) || (v > 0.02 && r >= -0.05);
  if (better) {
    const miss: string[] = [];
    if (!row.wk_roas_ok) miss.push(`invoice ROAS ${s.invoice.toFixed(2)}`);
    if (!row.wk_rev_ok) miss.push(`the ${fmtPrep(s.cur, s.week_floor)} floor`);
    return `It is moving the right way. What is the next step to get above ${miss.join(" and ") || "invoice and floor"}?`;
  }
  return "It went the wrong way. What will you do differently this week?";
}

/* ---------- briefs, a batch per step ---------- */

export function nextBriefBatch(payload: RunPayload): PrepStore[] {
  const done = payload.briefs ?? {};
  return prepStores(payload)
    .filter((p) => !done[p.key])
    .slice(0, BRIEF_BATCH);
}

function numbersLine(p: PrepStore): string {
  const n = p.numbers;
  const pc = (x: number | null) => (x == null ? "" : ` (${x >= 0 ? "+" : ""}${Math.round(x)}%)`);
  return `ROAS ${n.roas_prev} → ${n.roas}${pc(n.roas_pct)} vs invoice ${n.invoice}; ${n.volume_label.toLowerCase()} ${n.volume_prev} → ${n.volume}${pc(n.volume_pct)} vs floor ${n.target}`;
}

export async function writeBriefs(payload: RunPayload, batch: PrepStore[]): Promise<Record<string, Brief>> {
  const findings = payload.fathom?.findings ?? [];
  const blocks = batch.map((p) => {
    const log = payload.logs?.[p.key];
    const todos = payload.todos?.[p.key] ?? [];
    const meeting = payload.fathom?.meeting_notes?.[p.key]?.todos ?? [];
    const dd = findings.filter((f) => f.store_key === p.key && f.confidence !== "low");
    return [
      `### key: ${p.key}`,
      `Store: ${p.name} · buyer: ${p.buyer}`,
      `Numbers (verbatim): ${numbersLine(p)}`,
      `Week status: ${p.status === "on" ? "WEEK ON TRACK" : p.status === "off" ? "WEEK OFF TRACK" : "NO DATA"} (ROAS ${p.roas_ok ? "above" : "below"} invoice, ${p.numbers.volume_label.toLowerCase()} ${p.volume_ok ? "above" : "below"} floor)`,
      `Question to ask: ${p.ask_rule}`,
      `Weekly Store Log for the week: ${log?.archived ?? "none"}`,
      `Live log, section 1 (what the buyer says about last week): ${log?.live_section1 ?? "none"}`,
      `monday to-dos: ${todos.length ? todos.map((t) => `${t.name} [${t.status}]`).join("; ") : "none"}`,
      `To-dos agreed in last week's meeting: ${meeting.length ? meeting.join("; ") : "none"}`,
      `Tycho's deep-dive findings: ${
        dd.length
          ? "\n" + dd.map((f) => "- " + (f.confidence === "medium" ? "(store name unclear in the recording) " : "") + f.text).join("\n")
          : "none"
      }`,
    ].join("\n");
  });
  // Room for a full deep dive per store: four stores of bullets, not four
  // stores of two sentences.
  const res = await askJSON<{ stores: (Brief & { key: string })[] }>(BRIEF_SYSTEM, blocks.join("\n\n"), 12000);
  const out: Record<string, Brief> = {};
  for (const b of res.stores ?? []) {
    const p = batch.find((x) => x.key === b.key);
    if (!p || !b.did || !b.result) continue;
    const dd = findings.filter((f) => f.store_key === p.key && f.confidence !== "low");
    let deep = b.deep_dive || null;
    // A medium match is marked, so nobody reads a guess as Tycho's verdict.
    if (deep && dd.length && dd.every((f) => f.confidence === "medium") && !deep.startsWith("(store name unclear")) {
      deep = "(store name unclear in the recording) " + deep;
    }
    out[p.key] = {
      did: b.did.trim(),
      result: b.result.trim(),
      ask: p.ask_rule.startsWith("WRITE_TODO_QUESTION") ? (b.ask || "").trim() : p.ask_rule,
      deep_dive: dd.length ? deep : null,
    };
  }
  return out;
}

export type { DeckData };
