/**
 * Stage 2 · fathom — last week's delivery meeting and Tycho's deep dives.
 *
 * One transcript chunk per step: a deep dive is one to three hours of solo
 * recording, and a Claude call over all of it does not fit in the ~60 s an
 * invocation really gets. The queue and what each chunk yielded live in the
 * run's payload, so the next invocation carries on where this one stopped.
 */
import { FATHOM, type Stream } from "./constants";
import { askJSON } from "./ai";
import { ATTRIBUTE_SYSTEM, DEEP_DIVE_SYSTEM, MEETING_SYSTEM, attributeUser, deepDiveUser, meetingUser, type StoreRef } from "./prompts";
import type { CollectedStore, FathomQueueItem, RunPayload, Target } from "./types";
import { addDays, fmtPrep } from "./util";

interface FathomMeeting {
  title: string;
  meeting_title: string | null;
  recording_id: number;
  recorded_by?: { name?: string; email?: string };
  created_at: string;
  recording_start_time?: string;
}

async function fathom(path: string, params: Record<string, string> = {}): Promise<any> {
  const key = process.env.FATHOM_API_KEY;
  if (!key) throw new Error("FATHOM_API_KEY is not set");
  const url = new URL(FATHOM.API + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { "X-Api-Key": key }, signal: AbortSignal.timeout(20_000) });
    if (res.status === 429 && attempt < 2) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }
    if (!res.ok) throw new Error(`Fathom ${path}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    return res.json();
  }
}

async function listMeetings(createdAfter: string, createdBefore: string): Promise<FathomMeeting[]> {
  const out: FathomMeeting[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 10; i++) {
    const params: Record<string, string> = { created_after: createdAfter, created_before: createdBefore };
    if (cursor) params.cursor = cursor;
    const page = await fathom("/meetings", params);
    out.push(...((page.items ?? []) as FathomMeeting[]));
    cursor = page.next_cursor ?? null;
    if (!cursor) break;
  }
  return out;
}

const title = (m: FathomMeeting) => `${m.title ?? ""} ${m.meeting_title ?? ""}`.toLowerCase();
const startedAt = (m: FathomMeeting) => m.recording_start_time ?? m.created_at;

/** Find the recordings and build the queue. No chunk is processed here. */
export async function discover(
  stream: Stream,
  meetingDate: string,
  now: Date = new Date(),
  used: Set<number> = new Set(),
): Promise<NonNullable<RunPayload["fathom"]>> {
  // Up to now, not up to the Tuesday: the branded run is on Wednesday night,
  // precisely so the brand deep dives Tycho records on Tuesday are in it.
  const from = addDays(meetingDate, -9);
  const until = now.toISOString();
  const meetings = await listMeetings(`${from}T00:00:00Z`, until);

  // Last week's delivery meeting of this stream: Tuesday (dropship) or
  // Wednesday (branded) of the week before — the latest match before today.
  const wantDay = addDays(meetingDate, -FATHOM.MEETING_DAYS_BEFORE[stream]);
  const meeting = meetings
    .filter((m) => title(m).includes(FATHOM.MEETING_TITLE[stream]) && startedAt(m).slice(0, 10) < meetingDate)
    .sort((a, b) => {
      // the expected weekday first, then the most recent
      const da = startedAt(a).slice(0, 10) === wantDay ? 0 : 1;
      const db = startedAt(b).slice(0, 10) === wantDay ? 0 : 1;
      return da - db || startedAt(b).localeCompare(startedAt(a));
    })[0];

  // Tycho's deep dives: recorded by him, "deepdive" or "deep dive" in the
  // title, and "dropship" or "brand" for the stream — from the day before the
  // previous meeting on, minus what last week's run already read. "Since the
  // previous meeting" lost a whole recording on 30-09-2026: Tycho records a
  // series around the meeting ("brands pt1" the day before, "pt2" after it),
  // and pt1 held Moonhaven.
  const since = `${addDays(meeting ? startedAt(meeting).slice(0, 10) : wantDay, -1)}T00:00:00Z`;
  const streamWord = stream === "dropship" ? "dropship" : "brand";
  const dives = meetings.filter((m) => {
    const t = title(m);
    const by = `${m.recorded_by?.name ?? ""} ${m.recorded_by?.email ?? ""}`.toLowerCase();
    return (
      by.includes(FATHOM.DEEP_DIVE_BY) &&
      /deep\s*dive/.test(t) &&
      t.includes(streamWord) &&
      !used.has(m.recording_id) &&
      startedAt(m) > since &&
      startedAt(m) <= until
    );
  });

  const queue: FathomQueueItem[] = [];
  if (meeting) {
    queue.push({
      recording_id: meeting.recording_id,
      kind: "meeting",
      title: meeting.title,
      recorded_at: startedAt(meeting),
      chunks_total: null,
      chunks_done: 0,
    });
  }
  for (const d of dives.sort((a, b) => startedAt(a).localeCompare(startedAt(b)))) {
    queue.push({
      recording_id: d.recording_id,
      kind: "deep_dive",
      title: d.title,
      recorded_at: startedAt(d),
      chunks_total: null,
      chunks_done: 0,
    });
  }
  return {
    queue,
    meeting_found: meeting ? `${meeting.title} (${startedAt(meeting).slice(0, 10)})` : null,
    meeting_notes: {},
    findings: [],
    deep_dives_found: dives.length,
    done: queue.length === 0,
  };
}

/** Transcript as lines, split on line boundaries into chunks. */
async function transcriptChunks(recordingId: number, size: number): Promise<string[]> {
  const t = await fathom(`/recordings/${recordingId}/transcript`);
  const lines: string[] = (t.transcript ?? []).map(
    (l: any) => `[${l.timestamp ?? ""}] ${l.speaker?.display_name ?? "?"}: ${l.text ?? ""}`,
  );
  const chunks: string[] = [];
  let cur = "";
  for (const l of lines) {
    if (cur.length + l.length > size && cur) {
      chunks.push(cur);
      cur = "";
    }
    cur += l + "\n";
  }
  if (cur.trim()) chunks.push(cur);
  return chunks;
}

export function storeRefs(stores: CollectedStore[], withNumbers: boolean): StoreRef[] {
  return stores.map((s) => {
    const roas = (m: { spend: number; revenue: number }) => (m.spend ? (m.revenue / m.spend).toFixed(2) : "—");
    const clues = [
      s.niche ? `niche ${s.niche}` : "",
      s.countries?.length ? `countries ${s.countries.join("/")}` : "",
      s.currency ? `currency ${s.currency}` : "",
      `buyer ${s.buyer}`,
    ].filter(Boolean).join(", ");
    return {
      name: s.name,
      aliases: [...new Set(s.match_keys)].filter((k) => k !== s.name.toLowerCase()),
      numbers: withNumbers
        ? `ROAS ${roas(s.week)} (${roas(s.prev)}), revenue ${fmtPrep(s.cur, s.week.revenue)} (${fmtPrep(s.cur, s.prev.revenue)}), spend ${fmtPrep(s.cur, s.week.spend)}; ${clues}`
        : undefined,
    };
  });
}

const unread = (q: FathomQueueItem) => q.chunks_total == null || q.chunks_done < q.chunks_total;
const unplaced = (q: FathomQueueItem) => q.kind === "deep_dive" && !unread(q) && !q.attributed;
const fathomDone = (f: NonNullable<RunPayload["fathom"]>) => !f.queue.some((q) => unread(q) || unplaced(q));

/**
 * Place a recording's findings with the whole recording in view. Reading in
 * chunks cannot: Tycho names an account once, or never, and a chunk sees too
 * little of what he reads out to tell (30-09-2026: 50 of 146 findings could
 * not be placed, Moonhaven and Breathfree got none). One call, little output.
 */
async function attribute(payload: RunPayload, item: FathomQueueItem): Promise<void> {
  const f = payload.fathom!;
  const stores = payload.stores ?? [];
  const byName = new Map(stores.map((s) => [s.name.toLowerCase(), s]));
  const mine = f.findings.filter((x) => (x.recording_id ?? null) === item.recording_id || (x.recording_id == null && x.recording === item.title));
  item.attributed = true;
  if (!mine.length) return;
  const transcript = (await transcriptChunks(item.recording_id, Number.MAX_SAFE_INTEGER)).join("");
  const res = await askJSON<{
    segments?: { from: string; to: string; store: string | null; confidence?: string; evidence: string; findings?: number[] }[];
  }>(
    ATTRIBUTE_SYSTEM,
    attributeUser(
      storeRefs(stores, true),
      transcript,
      mine.map((x, i) => `${i}. ${x.short || x.text}`),
      notMeetingStores(payload),
    ),
    FATHOM.ATTRIBUTE_MAX_TOKENS,
  );
  const segments = res.segments ?? [];
  item.segments = segments.slice(0, 60).map(({ from, to, store, evidence }) => ({ from, to, store, evidence }));
  // This pass sees the whole recording, so it decides: a chunk's guess it
  // cannot confirm is dropped, not kept (30-09-2026: The Longevity store's
  // findings landed on Moonhaven because a chunk carried Moonhaven forward).
  for (const x of mine) {
    x.store_key = null;
    x.confidence = "low";
  }
  for (const seg of segments) {
    const s = seg.store ? byName.get(String(seg.store).toLowerCase()) : undefined;
    const confidence = (["high", "medium"].includes(String(seg.confidence)) ? seg.confidence : "low") as "high" | "medium" | "low";
    if (!s || confidence === "low") continue;
    for (const i of seg.findings ?? []) {
      const x = mine[Number(i)];
      if (!x) continue;
      x.store_key = s.key;
      x.confidence = confidence;
    }
  }
}

/** Stores Tycho may look at that are not in this meeting: inactive on
 *  Clients, not set up, or not findable. Named so their findings are not
 *  handed to the nearest store that is. */
function notMeetingStores(payload: RunPayload): string[] {
  const n = payload.notices;
  const clean = (x: string) => x.replace(/\s*\(.*$/, "").replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
  return [...new Set([...(n?.inactive_left_out ?? []), ...(n?.missing_in_settings ?? []), ...(n?.not_on_clients ?? [])].map(clean))];
}

/** Process the next chunk in the queue. Returns false when nothing was left. */
export async function processNext(payload: RunPayload): Promise<boolean> {
  const f = payload.fathom!;
  const toPlace = f.queue.find(unplaced);
  if (toPlace) {
    await attribute(payload, toPlace);
    f.done = fathomDone(f);
    return true;
  }
  const item = f.queue.find(unread);
  if (!item) {
    f.done = true;
    return false;
  }
  const chunks = await transcriptChunks(
    item.recording_id,
    item.kind === "meeting" ? FATHOM.CHUNK_CHARS : FATHOM.DEEP_DIVE_CHUNK_CHARS,
  );
  item.chunks_total = chunks.length;
  if (chunks.length === 0) {
    f.done = fathomDone(f);
    return true;
  }
  const i = item.chunks_done;
  const part = `part ${i + 1} of ${chunks.length} of "${item.title}"`;
  const stores = payload.stores ?? [];
  const byName = new Map(stores.map((s) => [s.name.toLowerCase(), s]));

  if (item.kind === "meeting") {
    const res = await askJSON<{ stores: { store: string; todos: string[]; target: Target | null }[] }>(
      MEETING_SYSTEM,
      meetingUser(storeRefs(stores, false), chunks[i], part),
    );
    for (const r of res.stores ?? []) {
      const s = byName.get(String(r.store).toLowerCase());
      if (!s) continue;
      const n = (f.meeting_notes[s.key] ??= { todos: [], target: null });
      n.todos.push(...(r.todos ?? []).filter(Boolean));
      if (r.target && (r.target.spend_day || r.target.revenue_week || r.target.roas)) {
        n.target = { ...r.target, source: "meeting" };
      }
    }
  } else {
    // What came just before: the store he was on, and the tail of the last
    // chunk, because the name is usually said once, minutes before the finding.
    const context = i > 0 ? chunks[i - 1].slice(-FATHOM.DEEP_DIVE_OVERLAP_CHARS) : "";
    const res = await askJSON<{
      findings: { store: string | null; confidence: string; text: string; short?: string }[];
      last_store?: string | null;
    }>(
      DEEP_DIVE_SYSTEM,
      deepDiveUser(storeRefs(stores, true), chunks[i], part, i > 0 ? item.last_store ?? null : null, context),
      FATHOM.DEEP_DIVE_MAX_TOKENS,
    );
    item.last_store = res.last_store && byName.has(String(res.last_store).toLowerCase()) ? res.last_store : null;
    for (const r of res.findings ?? []) {
      if (!r.text) continue;
      const s = r.store ? byName.get(String(r.store).toLowerCase()) : undefined;
      const confidence = (["high", "medium", "low"].includes(r.confidence) ? r.confidence : "low") as
        | "high"
        | "medium"
        | "low";
      f.findings.push({
        store_key: s && confidence !== "low" ? s.key : null,
        confidence: s ? confidence : "low",
        text: r.text,
        short: r.short || undefined,
        recording: item.title,
        recording_id: item.recording_id,
      });
    }
  }
  item.chunks_done = i + 1;
  f.done = fathomDone(f);
  return true;
}
