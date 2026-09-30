/**
 * Delivery meeting pipeline — the decks → a monday to-do for Tycho per
 * meeting, both on Tuesday at 10:00. There is no prep any more: it was built
 * from Tycho's Fathom deep dives until 30-09-2026 and removed, because it cost
 * most of the money and could not reliably tell which store he was on — Tycho
 * and Tristan prepare the meeting themselves.
 *
 *   collect → targets → compute → render → deliver → done
 *
 * WHY STAGED
 * ----------
 * Collecting (dashboard, three monday boards, the logs) plus a Claude call per
 * batch of targets does not fit in the ~60 s a Vercel invocation was measured
 * to get (weekly-update-sync). So each stage is small, the state lives in
 * `delivery_meeting_runs.payload`, and every step is idempotent: a run that
 * dies is picked up by the next invocation exactly where it stopped.
 *
 * WHY EVERY ROUTE CAN ADVANCE EARLIER STAGES
 * ------------------------------------------
 * `advance(ceiling)` does the next step of each run, whatever it is, up to
 * and including `ceiling`. The cron for a stage therefore also finishes an
 * earlier stage that ran late instead of finding "not ready" and doing
 * nothing until next week. A stage that is already past is a no-op.
 *
 * ONE STREAM NEVER BLOCKS THE OTHER
 * ---------------------------------
 * Each stream is its own row, its own lease and its own try/catch, and its own
 * to-do on monday. The steps alternate between the streams so one stream
 * cannot eat the whole budget.
 */
import {
  DELIVER_AT_LOCAL_HOUR,
  MEETING_DAY_OFFSET,
  MIN_STEP_MS,
  MONDAY_DELIVERY,
  RUN_BUDGET_MS,
  STAGES,
  STREAMS,
  TARGET_BATCH,
  type Stage,
  type Stream,
} from "./constants";
import { collect } from "./collect";
import { computeDeck, prevGoalFrom } from "./compute";
import {
  claimRun,
  downloadFile,
  getRun,
  loadBuyers,
  releaseRun,
  resetRun,
  saveRun,
  stageIndex,
  uploadFile,
} from "./db";
import { extractTargets, targetQueue } from "./targets";
import { renderDeck } from "./render-deck";
import { summaryFor } from "./summary";
import { assignPerson, attachFile, createTodo, createUpdate, toUpdateHtml } from "./monday-deliver";
import type { RunPayload, RunRow } from "./types";
import { addDays, amsterdamNow, meetingDates } from "./util";

export interface AdvanceOptions {
  meetingDate: string;
  ceiling: Stage;
  budgetMs?: number;
  dryRun?: boolean;
  /** deliver now instead of waiting for the meeting's local hour (manual runs) */
  ignoreSchedule?: boolean;
  /** deliver to Tristan's group with "[TEST]" in the name, never to Tycho */
  test?: boolean;
  /** throw the run away and collect again */
  force?: boolean;
  /** only these streams */
  streams?: Stream[];
  log?: (msg: string) => void;
  /** local runs write files here instead of Storage */
  outDir?: string;
  now?: Date;
}

export interface AdvanceResult {
  meeting_date: string;
  streams: Record<string, { stage: Stage; status: string; error: string | null; steps: string[] }>;
  delivered: string[];
  elapsed_ms: number;
}

const emptyPayload = (meetingDate: string): RunPayload => {
  const d = meetingDates(meetingDate);
  return {
    meeting_date: meetingDate,
    meeting_week: d.meeting_week,
    data_week: d.data_week,
    data_period: d.data_period,
  };
};

const nextStage = (s: Stage): Stage => STAGES[Math.min(stageIndex(s) + 1, STAGES.length - 1)];

async function ensureRun(meetingDate: string, stream: Stream, force: boolean): Promise<RunRow> {
  const existing = await getRun(meetingDate, stream);
  if (existing && !force) return existing;
  return resetRun(meetingDate, stream, emptyPayload(meetingDate));
}

/** One unit of work for one run. Mutates and returns the payload. */
async function step(
  run: RunRow,
  opts: AdvanceOptions,
): Promise<{ payload: RunPayload; done: boolean; note: string; wait?: boolean }> {
  const p = run.payload;
  switch (run.stage) {
    case "collect": {
      const collected = await collect(run.stream, run.meeting_date);
      return { payload: collected, done: true, note: `collected ${collected.stores?.length ?? 0} stores` };
    }
    case "targets": {
      const batch = targetQueue(p).slice(0, TARGET_BATCH);
      if (!batch.length) return { payload: p, done: true, note: "targets done" };
      const got = await extractTargets(p, batch);
      p.targets = { ...(p.targets ?? {}), ...got };
      p.targets_checked = [...(p.targets_checked ?? []), ...batch.map((s) => s.key)];
      const left = targetQueue(p).length;
      return { payload: p, done: left === 0, note: `targets: ${Object.keys(got).length} of ${batch.length} stores, ${left} left` };
    }
    case "compute": {
      const buyers = await loadBuyers();
      const last = await getRun(addDays(run.meeting_date, -7), run.stream);
      p.deck_data = {};
      for (const deck of p.decks ?? []) {
        p.deck_data[deck.key] = computeDeck({
          deck,
          stream: run.stream === "dropship" ? "DROPSHIP" : `BRANDED · ${deck.label.toUpperCase()}`,
          stores: (p.stores ?? []).filter((s) => s.deck === deck.key),
          targets: p.targets ?? {},
          buyers,
          meetingWeek: p.meeting_week,
          dataWeek: p.data_week,
          dataPeriod: p.data_period,
          prev: prevGoalFrom(last?.payload?.deck_data?.[deck.key]),
        });
      }
      return { payload: p, done: true, note: `computed ${p.decks?.length ?? 0} deck(s)` };
    }
    case "render": {
      const files: NonNullable<RunPayload["files"]> = [];
      const put = async (name: string, data: Buffer, type: string, kind: "deck") => {
        const path = `${run.meeting_date}/${name}`;
        if (opts.outDir) {
          const { writeFileSync, mkdirSync } = await import("fs");
          mkdirSync(opts.outDir, { recursive: true });
          writeFileSync(`${opts.outDir}/${name}`, data);
        }
        // Uploaded on a dry run too: a later real run delivers from Storage.
        await uploadFile(path, data, type);
        files.push({ name, path, kind });
      };
      for (const deck of p.decks ?? []) {
        const d = p.deck_data?.[deck.key];
        if (d) await put(deck.file, await renderDeck(d), "application/vnd.openxmlformats-officedocument.presentationml.presentation", "deck");
      }
      p.files = files;
      return { payload: p, done: true, note: `rendered ${files.map((f) => f.name).join(", ")}` };
    }
    case "deliver": {
      // Not before the meeting's local hour (both Tuesday 10:00, Amsterdam). The work is done; only the hand-over waits.
      const dueDate = addDays(run.meeting_date, MEETING_DAY_OFFSET[run.stream]);
      const local = amsterdamNow(opts.now ?? new Date());
      const due = local.date > dueDate || (local.date === dueDate && local.hour >= DELIVER_AT_LOCAL_HOUR[run.stream]);
      if (!due && !opts.ignoreSchedule && !opts.test) {
        return { payload: p, done: false, wait: true, note: `ready, delivers ${dueDate} ${DELIVER_AT_LOCAL_HOUR[run.stream]}:00 Amsterdam` };
      }
      // one to-do per meeting, for Tycho, due on the meeting day
      // A test run keeps its own ids, so the real delivery is not marked as done by it.
      const m = opts.test
        ? (p.monday_test ??= { item_id: null, update_id: null, uploaded: [] })
        : (p.monday ??= { item_id: null, update_id: null, uploaded: [] });
      const label = run.stream === "dropship" ? "Dropship" : "Branded";
      if (!m.item_id) {
        m.item_id = await createTodo({
          name: `${opts.test ? "[TEST] " : ""}Delivery meeting ${label} · week ${p.meeting_week} (${p.data_period})`,
          deadline: addDays(run.meeting_date, MEETING_DAY_OFFSET[run.stream]),
          personId: opts.test ? MONDAY_DELIVERY.PERSON_TRISTAN : MONDAY_DELIVERY.PERSON_TYCHO,
          group: opts.test ? MONDAY_DELIVERY.GROUP_TRISTAN : MONDAY_DELIVERY.GROUP_TYCHO,
        });
        // saved before anything else can fail: a retry must not make a second to-do
        return { payload: p, done: false, note: `monday to-do ${m.item_id} created` };
      }
      if (!m.update_id) {
        await assignPerson(m.item_id, opts.test ? MONDAY_DELIVERY.PERSON_TRISTAN : MONDAY_DELIVERY.PERSON_TYCHO);
        m.update_id = await createUpdate(m.item_id, toUpdateHtml(summaryFor(run)));
        return { payload: p, done: false, note: `summary posted on ${m.item_id}` };
      }
      const files = p.files ?? [];
      for (const f of files) {
        if (m.uploaded.includes(f.name)) continue;
        await attachFile(m.update_id, f.name, await downloadFile(f.path));
        m.uploaded.push(f.name);
      }
      // A test hand-over must leave the run at deliver. It used to move it to
      // done, and on 30-09-2026 the real branded run then found nothing left
      // to do and Tycho got nothing.
      if (opts.test) {
        return { payload: p, done: false, wait: true, note: `test: ${m.uploaded.length} file(s) on monday item ${m.item_id}; run stays at deliver for Tycho` };
      }
      p.delivered_at = new Date().toISOString();
      p.delivered_files = [...m.uploaded];
      return { payload: p, done: true, note: `${m.uploaded.length} file(s) on monday item ${m.item_id}` };
    }
    default:
      return { payload: p, done: false, note: `nothing to do at ${run.stage}` };
  }
}

export async function advance(opts: AdvanceOptions): Promise<AdvanceResult> {
  const started = Date.now();
  const budget = opts.budgetMs ?? RUN_BUDGET_MS;
  const left = () => budget - (Date.now() - started);
  const log = opts.log ?? ((m: string) => console.log(`[delivery-meeting] ${m}`));
  const streams = opts.streams ?? [...STREAMS];
  const result: AdvanceResult = { meeting_date: opts.meetingDate, streams: {}, delivered: [], elapsed_ms: 0 };
  const ceilingIdx = stageIndex(opts.ceiling === "done" ? "deliver" : opts.ceiling);

  const runs = new Map<Stream, RunRow>();
  for (const s of streams) {
    const r = await ensureRun(opts.meetingDate, s, !!opts.force);
    const claimed = await claimRun(opts.meetingDate, s);
    if (!claimed) {
      log(`${s}: held by another invocation — skipped`);
      result.streams[s] = { stage: r.stage, status: "locked", error: null, steps: [] };
      continue;
    }
    runs.set(s, claimed);
    result.streams[s] = { stage: claimed.stage, status: claimed.status, error: claimed.error, steps: [] };
  }

  try {
    // alternate one step per stream until nothing is left to do or the
    // budget would not cover another step
    const blocked = new Set<Stream>();
    for (;;) {
      let progressed = false;
      for (const [s, run] of runs) {
        if (blocked.has(s)) continue;
        if (run.stage === "done") continue;
        if (run.stage === "deliver" && opts.dryRun) continue; // a dry run never touches monday
        if (stageIndex(run.stage) > ceilingIdx) continue;
        if (left() < MIN_STEP_MS && opts.budgetMs !== Infinity) continue;
        try {
          const t0 = Date.now();
          const { payload, done, note, wait } = await step(run, opts);
          if (wait) {
            blocked.add(s); // nothing to do until the hour; not an error
            runs.set(s, await saveRun(run, { payload, status: "running", error: null }));
            result.streams[s].steps.push(`${run.stage}: ${note}`);
            log(`${s}: ${run.stage}: ${note}`);
            continue;
          }
          const stage = done ? nextStage(run.stage) : run.stage;
          const saved = await saveRun(run, { payload, stage, status: "running", error: null, attempts: 0 });
          runs.set(s, saved);
          result.streams[s].steps.push(`${run.stage}: ${note} (${Date.now() - t0} ms)`);
          log(`${s}: ${run.stage}: ${note} (${Date.now() - t0} ms)`);
          progressed = true;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          const saved = await saveRun(run, { status: "error", error: `${run.stage}: ${msg}`, attempts: run.attempts + 1 });
          runs.set(s, saved);
          blocked.add(s); // retried by the next invocation, not in a loop here
          result.streams[s].steps.push(`${run.stage}: ERROR ${msg}`);
          log(`${s}: ${run.stage}: ERROR ${msg}`);
        }
      }
      if (!progressed) break;
    }

    // a dry run shows what would have gone to monday
    if (opts.dryRun) {
      for (const r of runs.values()) {
        if (r.stage !== "deliver") continue;
        log(`deliver (dry run) — would put ${(r.payload.files ?? []).map((f) => f.name).join(", ")} on a monday to-do for Tycho`);
        log("\n" + summaryFor(r));
      }
    }
    for (const r of runs.values()) if (r.stage === "done" && r.status !== "done") {
      runs.set(r.stream, await saveRun(r, { status: "done" }));
      result.delivered.push(r.stream);
    }
  } finally {
    for (const r of runs.values()) await releaseRun(r).catch(() => undefined);
  }

  for (const [s, r] of runs) {
    result.streams[s] = { ...result.streams[s], stage: r.stage, status: r.status, error: r.error };
  }
  result.elapsed_ms = Date.now() - started;
  return result;
}

/** The 10:30 watchdog: anything not done is reported. Read-only on the runs. */
export async function check(
  meetingDate: string,
  streams: readonly Stream[] = STREAMS,
): Promise<{ ok: boolean; problems: string[] }> {
  const problems: string[] = [];
  for (const s of streams) {
    const r = await getRun(meetingDate, s);
    if (!r) problems.push(`${s}: no run row at all — collect never ran`);
    else if (r.status !== "done") {
      problems.push(`${s}: stopped at "${r.stage}"${r.error ? ` — ${r.error}` : ""} (attempts ${r.attempts})`);
    }
  }
  return { ok: problems.length === 0, problems };
}

/**
 * The check's findings, where Tristan sees them without a Slack webhook: a
 * to-do in his own group on Operations To Do's, due today, with the problems
 * as its update. The Slack alert still goes out too, for when a webhook is set.
 */
export async function reportProblems(meetingDate: string, problems: string[]): Promise<string> {
  const week = meetingDates(meetingDate).meeting_week;
  const item = await createTodo({
    name: `Delivery meeting week ${week}: niet (helemaal) klaar`,
    deadline: meetingDate,
    personId: MONDAY_DELIVERY.PERSON_TRISTAN,
    group: MONDAY_DELIVERY.GROUP_TRISTAN,
  });
  await createUpdate(
    item,
    toUpdateHtml(
      `*De delivery meeting van ${meetingDate} is niet (helemaal) bij Tycho aangekomen.*\n` +
        problems.map((p) => `• ${p}`).join("\n") +
        `\n\nOpnieuw proberen: /api/cron/delivery-meeting/deliver?date=${meetingDate} (met x-cron-secret), of lokaal scripts/delivery-meeting.ts all --date ${meetingDate}.`,
    ),
  );
  return item;
}
