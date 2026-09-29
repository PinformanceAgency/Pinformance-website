/**
 * Delivery meeting pipeline — decks + Tycho's prep → one Slack DM, Tuesdays.
 *
 *   collect → fathom → targets → compute → briefs → render → deliver → done
 *
 * WHY STAGED
 * ----------
 * A Fathom transcript plus a Claude call does not fit in the ~60 s a Vercel
 * invocation really gets (measured on weekly-update-sync, whatever
 * `maxDuration` says). So each stage is small, the state lives in
 * `delivery_meeting_runs.payload`, and every step is idempotent: a run that
 * dies is picked up by the next invocation exactly where it stopped.
 *
 * WHY EVERY ROUTE CAN ADVANCE EARLIER STAGES
 * ------------------------------------------
 * `advance(ceiling)` does the next step of each run, whatever it is, up to
 * and including `ceiling`. The cron for a stage therefore also finishes an
 * earlier stage that ran late — the briefs cron at 08:15 finishes a fathom
 * stage that was still going — instead of finding "not ready" and doing
 * nothing until next week. A stage that is already past is a no-op.
 *
 * ONE STREAM NEVER BLOCKS THE OTHER
 * ---------------------------------
 * Each stream is its own row, its own lease and its own try/catch. The steps
 * alternate between the streams so one stream's briefs cannot eat the whole
 * budget. Only `deliver` looks at both: it waits for both until
 * DELIVER_WAIT_UNTIL_UTC and then sends what exists, naming what is missing.
 */
import {
  DELIVER_WAIT_UNTIL_UTC,
  MIN_STEP_MS,
  RUN_BUDGET_MS,
  STAGES,
  STREAMS,
  TARGET_BATCH,
  type Stage,
  type Stream,
} from "./constants";
import { collect, buyerLabel } from "./collect";
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
import { discover, processNext } from "./fathom";
import { extractTargets, nextBriefBatch, prepStores, targetQueue, writeBriefs } from "./briefs";
import { renderDeck } from "./render-deck";
import { renderPrep } from "./render-prep";
import { combinedSummary } from "./summary";
import type { RunPayload, RunRow } from "./types";
import { addDays, meetingDates } from "./util";

export interface AdvanceOptions {
  meetingDate: string;
  ceiling: Stage;
  budgetMs?: number;
  dryRun?: boolean;
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
async function step(run: RunRow, opts: AdvanceOptions): Promise<{ payload: RunPayload; done: boolean; note: string }> {
  const p = run.payload;
  switch (run.stage) {
    case "collect": {
      const collected = await collect(run.stream, run.meeting_date);
      return { payload: collected, done: true, note: `collected ${collected.stores?.length ?? 0} stores` };
    }
    case "fathom": {
      if (!process.env.FATHOM_API_KEY) {
        p.fathom = { queue: [], meeting_found: null, meeting_notes: {}, findings: [], deep_dives_found: 0, done: true };
        (p.issues ??= []).push("FATHOM_API_KEY is not set: no meeting notes and no deep dive this week");
        return { payload: p, done: true, note: "fathom skipped (no key)" };
      }
      if (!p.fathom) {
        p.fathom = await discover(run.stream, run.meeting_date);
        return {
          payload: p,
          done: p.fathom.done,
          note: `fathom: meeting ${p.fathom.meeting_found ? "found" : "not found"}, ${p.fathom.deep_dives_found} deep dive(s)`,
        };
      }
      const did = await processNext(p);
      const left = p.fathom.queue.filter((q) => q.chunks_total == null || q.chunks_done < q.chunks_total).length;
      return { payload: p, done: p.fathom.done, note: did ? `fathom chunk done, ${left} recording(s) left` : "fathom done" };
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
    case "briefs": {
      const batch = nextBriefBatch(p);
      if (!batch.length) return { payload: p, done: true, note: "briefs done" };
      const got = await writeBriefs(p, batch);
      p.briefs = { ...(p.briefs ?? {}), ...got };
      // A store Claude skipped twice gets a brief with only the facts, so one
      // stubborn store cannot hold the prep for everybody.
      p.brief_errors ??= {};
      for (const s of batch) {
        if (got[s.key]) continue;
        const n = Number(p.brief_errors[s.key] ?? 0) + 1;
        p.brief_errors[s.key] = String(n);
        if (n >= 2) {
          p.briefs[s.key] = {
            did: `${s.buyer}, no summary could be written for this store — read the log.`,
            result: `ROAS ${s.numbers.roas_prev} → ${s.numbers.roas} against invoice ${s.numbers.invoice}; ${s.numbers.volume_label.toLowerCase()} ${s.numbers.volume_prev} → ${s.numbers.volume} against the ${s.numbers.target} floor.`,
            ask: s.ask_rule.startsWith("WRITE_TODO_QUESTION") ? "Which of last week's to-dos were not done, and when will they be?" : s.ask_rule,
            deep_dive: null,
          };
        }
      }
      const left = nextBriefBatch(p).length;
      return { payload: p, done: left === 0, note: `briefs: ${Object.keys(got).length} written` };
    }
    case "render": {
      const files: NonNullable<RunPayload["files"]> = [];
      const put = async (name: string, data: Buffer, type: string, kind: "deck" | "prep") => {
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
      const prep = prepStores(p).map((s) => ({ ...s, brief: p.briefs?.[s.key] }));
      const buyers = await loadBuyers();
      const NN = String(p.meeting_week).padStart(2, "0");
      const streamWord = run.stream === "dropship" ? "DROPSHIP" : "BRANDED";
      const sections = (p.decks ?? []).map((deck) => ({
        kicker: `MEETING PREP · ${streamWord} · ${deck.buyers
          .map((b) => buyerLabel(buyers.find((x) => x.buyer === b), b).toUpperCase())
          .join(" & ")}`,
        stores: prep.filter((s) => s.deck === deck.key),
      }));
      const { pdf, shortened } = await renderPrep({
        sections,
        footer: `MEETING PREP · ${streamWord} · WEEK ${p.meeting_week} · RESULTS ${p.data_period}`,
      });
      if (shortened.length) (p.issues ??= []).push(`Prep text shortened to fit: ${shortened.join(", ")}`);
      await put(`Prep_${run.stream === "dropship" ? "Dropship" : "Branded"}_week${NN}.pdf`, pdf, "application/pdf", "prep");
      p.files = files;
      return { payload: p, done: true, note: `rendered ${files.map((f) => f.name).join(", ")}` };
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
        if (run.stage === "deliver" || run.stage === "done") continue;
        if (stageIndex(run.stage) > ceilingIdx) continue;
        if (left() < MIN_STEP_MS && opts.budgetMs !== Infinity) continue;
        try {
          const t0 = Date.now();
          const { payload, done, note } = await step(run, opts);
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

    // deliver: one DM for both streams
    if (ceilingIdx >= stageIndex("deliver")) {
      const ready = [...runs.values()].filter((r) => r.stage === "deliver");
      if (ready.length) {
        const now = opts.now ?? new Date();
        const pastWait =
          now.getUTCHours() > DELIVER_WAIT_UNTIL_UTC.h ||
          (now.getUTCHours() === DELIVER_WAIT_UNTIL_UTC.h && now.getUTCMinutes() >= DELIVER_WAIT_UNTIL_UTC.m) ||
          opts.meetingDate < now.toISOString().slice(0, 10);
        const others = await Promise.all(
          STREAMS.filter((s) => !ready.some((r) => r.stream === s)).map((s) => getRun(opts.meetingDate, s)),
        );
        const notReady = others.filter((r) => !r || stageIndex(r.stage) < stageIndex("deliver"));
        if (notReady.length === 0 || pastWait) {
          const missing = STREAMS.filter(
            (s) => !ready.some((r) => r.stream === s) && !others.some((o) => o?.stream === s && o.stage === "done"),
          );
          const delivered = await deliver(ready, missing, opts, log);
          // A dry run leaves the runs at "deliver", so the real cron still sends.
          for (const r of opts.dryRun ? [] : delivered) {
            const saved = await saveRun(r, { stage: "done", status: "done", error: null, payload: r.payload });
            runs.set(r.stream, saved);
            result.delivered.push(r.stream);
          }
        } else {
          log(`deliver: waiting for ${notReady.map((r) => r?.stream ?? "?").join(", ")}`);
        }
      }
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

async function deliver(
  ready: RunRow[],
  missing: Stream[],
  opts: AdvanceOptions,
  log: (m: string) => void,
): Promise<RunRow[]> {
  const order = (r: RunRow) => STREAMS.indexOf(r.stream);
  ready.sort((a, b) => order(a) - order(b));
  const text = combinedSummary(ready, ready[0].meeting_date, missing);
  if (opts.dryRun) {
    log(`deliver (dry run) — would DM ${ready.flatMap((r) => r.payload.files ?? []).map((f) => f.name).join(", ")}`);
    log("\n" + text);
    return ready;
  }
  const { openDm, uploadFiles, postMessage } = await import("./slack");
  const channel = await openDm();
  // decks first, then the preps: the order the table in the spec lists them
  const files = ready.flatMap((r) => r.payload.files ?? []).sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "deck" ? -1 : 1));
  const data = await Promise.all(files.map(async (f) => ({ name: f.name, data: await downloadFile(f.path) })));
  await uploadFiles(channel, data);
  await postMessage(channel, text);
  for (const r of ready) {
    r.payload.delivered_at = new Date().toISOString();
    r.payload.delivered_files = files.filter((f) => f.path.startsWith(r.meeting_date)).map((f) => f.name);
  }
  log(`delivered ${files.length} files to Slack`);
  return ready;
}

/** The 10:30 watchdog: anything not done is reported. Read-only on the runs. */
export async function check(meetingDate: string): Promise<{ ok: boolean; problems: string[] }> {
  const problems: string[] = [];
  for (const s of STREAMS) {
    const r = await getRun(meetingDate, s);
    if (!r) problems.push(`${s}: no run row at all — collect never ran`);
    else if (r.status !== "done") {
      problems.push(`${s}: stopped at "${r.stage}"${r.error ? ` — ${r.error}` : ""} (attempts ${r.attempts})`);
    }
  }
  return { ok: problems.length === 0, problems };
}
