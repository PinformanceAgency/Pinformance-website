/**
 * P4.4.1 and P4.4.2 — putting the waterfall live, and watching it.
 *
 * Until now `pushWaterfallToPinterest` returned `{ queued: 0, mode:
 * "handoff-todo" }`. The button existed, the API answered 200, and nothing
 * reached Pinterest. Everything upstream — the research, the brief, the
 * designs, the copy, the rotation — ended in a no-op.
 *
 * The split here matters and is not an implementation detail:
 *
 *   scheduleWaterfall()  is the approval. It moves sixteen PLANNED pins to
 *                        SCHEDULED and the waterfall to RUNNING. It posts
 *                        nothing, because the sixteen pins are deliberately
 *                        spread over weeks — publishing them on approval
 *                        would collapse the whole waterfall into one day
 *                        and undo the only thing it exists to do.
 *
 *   publishDuePins()     is the cron. Every quarter of an hour it takes the
 *                        pins whose date has arrived and posts them, and
 *                        that is where the caps live: the 5/day hard
 *                        ceiling, the store's own daily target, and a
 *                        minimum gap so a day's pins do not all land at
 *                        06:00.
 *
 * Enforcing the caps at publish time rather than at generate time is what
 * lets two cycles run concurrently without either of them knowing about the
 * other. A generator that reserved slots would have to hold a lock across
 * the whole account.
 */
import { organicPool } from "./db";
import { completeCycleTask } from "./phase4";
import { ORGANIC_DAILY_CAP } from "./pacing";
import { MAX_VIDEO_BYTES } from "./video";
import {
  pinterestClientsForOrgs,
  type PinterestAuthError,
} from "@/lib/pinterest/for-org";
import type { PinterestClient } from "@/lib/pinterest/client";

/** The method's absolute ceiling per store, per day — see pacing.ts, which
 *  the CHECK and the check_daily_volume() trigger mirror. A ceiling is not a
 *  target: the store's own daily_pin_target still binds first, and a new
 *  account starts at 1 and ramps. */
const HARD_DAILY_CAP = ORGANIC_DAILY_CAP;

/* ------------------------------------------------------------------ */
/* Wat een video kost, en waarom de run zichzelf een budget geeft      */
/* ------------------------------------------------------------------ */

/**
 * Een image-pin is één API-call van ongeveer anderhalve seconde. Een video is
 * registreren, het hele bestand ophalen, het naar de S3 van Pinterest duwen en
 * daarna wachten tot Pinterest klaar is met verwerken — bij elkaar tientallen
 * seconden, met het bestand als één Buffer in het geheugen.
 *
 * `maxDuration = 300` is wat we vragen, niet wat we krijgen: de betaalde
 * post-pins route is er twee keer op één ochtend uitgegooid met "instance was
 * killed because it ran out of available memory", en dat was één bestand van
 * 303 MB. Vandaar de maat-grens in video.ts en vandaar dit budget: een run
 * begint alleen aan een video als er een hele in past, en stopt netjes in
 * plaats van halverwege een upload te worden afgekapt. Wat blijft liggen is
 * over een kwartier gewoon weer aan de beurt — de volgorde is per store en de
 * pins zijn gedateerd, dus niets raakt achterin de rij.
 */
const RUN_BUDGET_MS = 200_000;
/** Wat één video in het slechtste geval kost: ophalen, uploaden, pollen. */
const VIDEO_NEEDS_MS = 75_000;
const MAX_VIDEOS_PER_RUN = 2;
/** Pinterest is meestal binnen enkele seconden klaar; de eerste blik is dus
 *  snel en daarna groeit de wachttijd. */
const MEDIA_POLL_STEPS = 12;

/** A publish attempt that should be retried rather than recorded as a failure. */
function isTransient(message: string): boolean {
  // 429 is the rate limit; 5xx is Pinterest having a moment. Neither means
  // the pin is wrong, so neither may consume its one chance to go out.
  return /Pinterest API error (429|5\d\d)\b/.test(message) ||
         /fetch failed|ETIMEDOUT|ECONNRESET|socket hang up/i.test(message);
}

/* ------------------------------------------------------------------ */
/* P4.4.1 — approval                                                   */
/* ------------------------------------------------------------------ */

/**
 * The waterfall a cycle is currently on.
 *
 * Every phase-4 control in the UI is addressed by URL — that is the unit a
 * cycle is, and the manager never sees a waterfall id. Resolving it here
 * keeps that true for the publishing step as well.
 */
export async function currentWaterfallForUrl(
  orgId: string,
  urlId: string
): Promise<string> {
  const pool = organicPool();
  const r = await pool.query<{ id: string }>(
    `SELECT id::text FROM organic.waterfalls
      WHERE org_id = $1 AND url_id = $2
        AND status <> 'ABANDONED'::organic.waterfall_status
      ORDER BY created_at DESC
      LIMIT 1`,
    [orgId, urlId]
  );
  if (r.rowCount === 0) {
    throw new Error("No waterfall for this URL yet — generate it first (P4.3.1)");
  }
  return r.rows[0].id;
}

export interface ScheduleReport {
  waterfall_id: string;
  scheduled: number;
  /** Pins that cannot be posted at all. These are hard stops. */
  blocked: Array<{ sequence: number; reason: string }>;
  /** Things worth knowing that do not stop the run. */
  warnings: string[];
  first_date: string | null;
  last_date: string | null;
}

/**
 * Move an approved waterfall into the publishing queue.
 *
 * Blocks only on what makes the API call impossible or the result wrong:
 * no image, no board on Pinterest, no title, or copy a human explicitly
 * rejected. Everything else warns. That line is deliberate — the manager
 * may always overrule a rule of the method, but "publish a design nobody
 * has an image for" is not an override, it is a crash.
 */
export async function scheduleWaterfall(
  orgId: string,
  waterfallId: string
): Promise<ScheduleReport> {
  const pool = organicPool();


  const rows = await pool.query<{
    id: string;
    sequence_number: number;
    scheduled_date: string;
    status: string;
    image_path: string | null;
    pinterest_board_id: string | null;
    board_name: string;
    title: string | null;
    description: string | null;
    human_qc_status: string | null;
    validator_status: string | null;
    design_qc: string | null;
    media_type: string | null;
    video_path: string | null;
  }>(
    `SELECT p.id::text,
            p.sequence_number,
            p.scheduled_date,
            p.status::text                AS status,
            p.image_path,
            b.pinterest_board_id,
            b.name                        AS board_name,
            cs.title,
            cs.description,
            cs.human_qc_status::text      AS human_qc_status,
            cs.validator_status::text     AS validator_status,
            d.qc_status::text             AS design_qc,
            d.media_type::text            AS media_type,
            p.video_path
       FROM organic.pins p
       JOIN organic.waterfalls w ON w.id = p.waterfall_id
       JOIN organic.boards b     ON b.id = p.board_id
       LEFT JOIN organic.copy_sets cs ON cs.id = p.copy_set_id
       LEFT JOIN organic.designs d    ON d.id = p.design_id
      WHERE p.waterfall_id = $1 AND w.org_id = $2
      ORDER BY p.sequence_number`,
    [waterfallId, orgId]
  );
  if (rows.rowCount === 0) throw new Error("Waterfall not found for this org");

  const blocked: ScheduleReport["blocked"] = [];
  const warnings: string[] = [];
  const ready: string[] = [];

  let pendingCopyQc = 0;
  let pendingDesignQc = 0;

  for (const p of rows.rows) {
    const problems: string[] = [];
    if (!p.image_path) problems.push("no image — run P4.2.4 and P4.2.5");
    // Een video-pin zonder mp4 is niet "bijna goed": hij zou als image-pin van
    // het posterframe uitgaan, met succes, en dat is het stilste verkeerde
    // resultaat dat deze cron kan opleveren.
    if (p.media_type === "VIDEO" && !p.video_path) {
      problems.push("this is a video pin with no video file — run P4.2.5 after uploading the mp4");
    }
    if (!p.pinterest_board_id) problems.push(`board "${p.board_name}" does not exist on Pinterest yet`);
    if (!p.title?.trim()) problems.push("no title — run P4.2.8");
    if (p.human_qc_status === "REJECTED") problems.push("copy was rejected in QC");
    if (p.design_qc === "REJECTED") problems.push("design was rejected in QC");

    if (problems.length > 0) {
      blocked.push({ sequence: p.sequence_number, reason: problems.join("; ") });
      continue;
    }
    if (p.human_qc_status !== "APPROVED") pendingCopyQc += 1;
    if (p.design_qc !== "APPROVED") pendingDesignQc += 1;
    if (p.validator_status === "FAIL") {
      warnings.push(`Pin ${p.sequence_number}: copy still fails the validator.`);
    }
    // Already published or cancelled pins are left alone — re-approving a
    // waterfall must never repost what is already live.
    if (p.status === "PLANNED" || p.status === "FAILED") ready.push(p.id);
  }

  if (pendingCopyQc > 0) {
    warnings.push(`${pendingCopyQc} copy set(s) have not passed copy QC (P4.2.10).`);
  }
  if (pendingDesignQc > 0) {
    warnings.push(`${pendingDesignQc} design(s) have not passed design QC (P4.2.7).`);
  }

  if (ready.length > 0) {
    await pool.query(
      `UPDATE organic.pins
          SET status = 'SCHEDULED'::organic.pin_status,
              failure_reason = NULL
        WHERE id = ANY($1::uuid[])`,
      [ready]
    );
    await pool.query(
      `UPDATE organic.waterfalls
          SET status = 'RUNNING'::organic.waterfall_status,
              end_date = (SELECT MAX(scheduled_date) FROM organic.pins WHERE waterfall_id = $1)
        WHERE id = $1`,
      [waterfallId]
    );
  }

  // Queueing the waterfall is what P4.3.2 asks for — the approval that hands
  // the sixteen pins to the cron. Only when something actually moved: a run
  // that scheduled nothing because every pin was blocked has not approved
  // anything.
  if (ready.length > 0) {
    const url = await pool.query<{ url_id: string }>(
      `SELECT url_id::text FROM organic.waterfalls WHERE id = $1`, [waterfallId]);
    const urlId = url.rows[0]?.url_id;
    if (urlId) {
      await completeCycleTask(
        orgId, `URL-${urlId.slice(0, 8)}`, "P4.3.2", 0,
        `${ready.length} pin(s) queued from ${waterfallId.slice(0, 8)}; the cron publishes each on its date.`
      );
    }
  }

  const dates = rows.rows.map((r) => r.scheduled_date).sort();
  return {
    waterfall_id: waterfallId,
    scheduled: ready.length,
    blocked,
    warnings,
    first_date: dates[0] ?? null,
    last_date: dates[dates.length - 1] ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* P4.4.1 — the cron that actually posts                               */
/* ------------------------------------------------------------------ */

interface DuePin {
  pin_id: string;
  org_id: string;
  sequence_number: number;
  /** Altijd een afbeelding. Bij een video-pin is dit het posterframe, dat
   *  Pinterest als cover meekrijgt — zie migratie 103. */
  image_path: string;
  /** Gezet = dit wordt een video-pin. */
  video_path: string | null;
  pinterest_board_id: string;
  title: string;
  description: string | null;
  url: string;
  alt_text: string | null;
  daily_pin_target: number | null;
}

export interface PublishRunReport {
  due: number;
  published: number;
  /** Hoeveel daarvan video-pins waren. Apart, omdat ze de duur van de run
   *  bepalen en een run die niets anders deed dan één video toch klopt. */
  videos_published: number;
  failed: number;
  /** Held back by a cap, a gap, or a rate limit. Retried next run. */
  deferred: number;
  /** De run hield op omdat zijn tijd op was, niet omdat hij klaar was. Wat
   *  bleef liggen staat in `deferred` en is over een kwartier weer aan de
   *  beurt; dit is het verschil tussen "niets te doen" en "niet toegekomen". */
  budget_exhausted: boolean;
  orgs: Array<{
    org_id: string;
    org_name: string;
    published: number;
    failed: number;
    deferred: number;
    note?: string;
  }>;
  /** Stilgezet door een mens, met de reden. Apart van `deferred`: dat is werk
   *  dat straks alsnog gaat, dit is werk dat wacht op een besluit. */
  paused: Array<{ org_id: string; org_name: string; scope: "store" | "cycle"; reason: string | null; pins: number }>;
  /** Stores that need a human to reconnect. These never fix themselves. */
  reconnect_required: Array<{
    org_id: string;
    org_name: string;
    reason: PinterestAuthError["reason"];
    message: string;
  }>;
}

/**
 * Een video-pin plaatsen: registreren → uploaden → wachten → pin maken.
 *
 * Woord voor woord dezelfde volgorde als de betaalde post-pins route, die dit
 * al ruim vijfhonderd keer heeft gedaan. Twee dingen die daar geleerd zijn en
 * hier meekomen:
 *
 *   - **de maat wordt gecheckt vóór het bestand in het geheugen komt**, aan de
 *     content-length. Het bestand is bij ons al aan de deur begrensd, maar een
 *     object kan vervangen zijn en dit is de laatste plek waar het nog
 *     goedkoop is om nee te zeggen.
 *   - **een signed URL om het bestand zelf op te halen**, ook al is de bucket
 *     publiek: dat is wat de betaalde route doet en het houdt de mp4 buiten
 *     eventuele caches. Pinterest krijgt wel de publieke URL van het
 *     posterframe, want dat haalt Pinterest zélf op.
 */
async function publishVideoPin(
  client: PinterestClient,
  pin: DuePin,
  deadline: () => number
): Promise<{ id?: string } | null> {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();

  const media = await client.registerMediaUpload();

  let videoUrl = pin.video_path!;
  const objectPath = videoUrl.split("/object/public/pin-images/")[1];
  if (objectPath) {
    const { data } = await admin.storage
      .from("pin-images")
      .createSignedUrl(decodeURIComponent(objectPath), 300);
    if (data?.signedUrl) videoUrl = data.signedUrl;
  }

  const res = await fetch(videoUrl);
  if (!res.ok) throw new Error(`Video download: ${res.status}`);
  const declared = Number(res.headers.get("content-length") || 0);
  if (declared > MAX_VIDEO_BYTES) {
    throw new Error(
      `Video is ${Math.round(declared / 1048576)}MB, over the ${MAX_VIDEO_BYTES / 1048576}MB limit`
    );
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") || "video/mp4";

  await client.uploadVideoToS3(media.upload_url, media.upload_parameters, buffer, contentType);

  let ready = false;
  for (let poll = 0; poll < MEDIA_POLL_STEPS; poll++) {
    await new Promise((r) => setTimeout(r, poll === 0 ? 1500 : 5000));
    if (deadline() <= 0) break;
    try {
      const status = await client.getMediaStatus(media.media_id);
      if (status.status === "succeeded" || status.status === "registered") { ready = true; break; }
      if (status.status === "failed") {
        throw new Error(`Video processing failed for media ${media.media_id}`);
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes("processing failed")) throw e;
      // Een mislukte statuscheck is geen mislukte upload — doorpollen.
    }
  }
  if (!ready) {
    // Bewust een gewone fout en geen retry-melding: de media staat bij
    // Pinterest, maar wij weten niet of hij goed is. De volgende run begint
    // schoon opnieuw, wat een nieuwe media_id oplevert en geen dubbele pin.
    throw new Error(`Video processing timeout for media ${media.media_id}`);
  }

  return client.createVideoPin({
    board_id: pin.pinterest_board_id,
    title: pin.title.slice(0, 100),
    description: pin.description ?? undefined,
    link: pin.url,
    alt_text: pin.alt_text?.slice(0, 500) ?? undefined,
    media_id: media.media_id,
    // Het posterframe dat bij de upload uit de video is gehaald. Publieke URL,
    // want Pinterest haalt deze zelf op.
    cover_image_url: pin.image_path,
  });
}

export async function publishDuePins(
  opts: {
    orgId?: string;
    dryRun?: boolean;
    limitPerOrg?: number;
    /** Hoeveel video-pins deze run maximaal doet. Meer kost tijd die de run
     *  niet heeft; `?max_videos=` op de cron zet hem hoger voor een inhaalslag. */
    maxVideos?: number;
    budgetMs?: number;
  } = {}
): Promise<PublishRunReport> {
  const pool = organicPool();
  const startedAt = Date.now();
  const budgetMs = Math.max(10_000, Math.min(280_000, opts.budgetMs ?? RUN_BUDGET_MS));
  const elapsed = () => Date.now() - startedAt;
  const budgetLeft = () => budgetMs - elapsed();
  const maxVideos = Math.max(0, opts.maxVideos ?? MAX_VIDEOS_PER_RUN);
  let videosThisRun = 0;

  const due = await pool.query<DuePin>(
    `SELECT p.id::text          AS pin_id,
            w.org_id::text      AS org_id,
            p.sequence_number,
            p.image_path,
            p.video_path,
            b.pinterest_board_id,
            cs.title,
            cs.description,
            u.url,
            cs.tagline          AS alt_text,
            s.daily_pin_target
       FROM organic.pins p
       JOIN organic.waterfalls w ON w.id = p.waterfall_id
       JOIN organic.urls u       ON u.id = w.url_id
       JOIN organic.boards b     ON b.id = p.board_id
       JOIN organic.designs d    ON d.id = p.design_id
       JOIN organic.copy_sets cs ON cs.id = p.copy_set_id
       LEFT JOIN organic.client_settings s ON s.org_id = w.org_id
      WHERE p.status = 'SCHEDULED'::organic.pin_status
        AND p.scheduled_date <= CURRENT_DATE
        AND p.image_path IS NOT NULL
        AND b.pinterest_board_id IS NOT NULL
        AND cs.title IS NOT NULL
        -- Een pin van een video-design zonder mp4 wordt niet opgepakt: hij zou
        -- als image-pin van het posterframe uitgaan. loadPublishHealth telt
        -- hem onder stuck, met dezelfde voorwaarde, zodat die twee niet uit
        -- elkaar kunnen lopen.
        AND (d.media_type = 'IMAGE'::organic.media_kind OR p.video_path IS NOT NULL)
        -- Stilgezet door een mens: de store in zijn geheel, of deze ene cyclus.
        -- De pin blijft staan waar hij staat en gaat uit zodra de pauze eraf
        -- is — de cron neemt alles met scheduled_date <= vandaag, dus er raakt
        -- niets kwijt. Zie migratie 104.
        AND s.publishing_paused_at IS NULL
        AND w.paused_at IS NULL
        AND ($1::uuid IS NULL OR w.org_id = $1::uuid)
      ORDER BY p.scheduled_date, p.sequence_number`,
    [opts.orgId ?? null]
  );

  const report: PublishRunReport = {
    due: due.rowCount ?? 0,
    published: 0,
    videos_published: 0,
    failed: 0,
    deferred: 0,
    budget_exhausted: false,
    paused: [],
    orgs: [],
    reconnect_required: [],
  };
  // Wat er stilstaat, en hoeveel pins daardoor wachten. De due-query filtert
  // gepauzeerde stores en cycli eruit, dus zonder deze query zou een
  // stilgezette store als "niets te doen" uit de run komen — en dat is precies
  // het verschil dat iemand wil zien.
  const held = await pool.query<{
    org_id: string; org_name: string; scope: "store" | "cycle"; reason: string | null; pins: string;
  }>(
    `SELECT w.org_id::text AS org_id, o.name AS org_name,
            CASE WHEN s.publishing_paused_at IS NOT NULL THEN 'store' ELSE 'cycle' END AS scope,
            COALESCE(s.publishing_pause_reason, w.pause_reason) AS reason,
            COUNT(*)::text AS pins
       FROM organic.pins p
       JOIN organic.waterfalls w ON w.id = p.waterfall_id
       JOIN organizations o ON o.id = w.org_id
       LEFT JOIN organic.client_settings s ON s.org_id = w.org_id
      WHERE p.status = 'SCHEDULED'::organic.pin_status
        AND p.scheduled_date <= CURRENT_DATE
        AND (s.publishing_paused_at IS NOT NULL OR w.paused_at IS NOT NULL)
        AND ($1::uuid IS NULL OR w.org_id = $1::uuid)
      GROUP BY 1, 2, 3, 4
      ORDER BY 2`,
    [opts.orgId ?? null]
  );
  report.paused = held.rows.map((r) => ({
    org_id: r.org_id, org_name: r.org_name, scope: r.scope,
    reason: r.reason, pins: Number(r.pins),
  }));

  if (report.due === 0) return report;

  const byOrg = new Map<string, DuePin[]>();
  for (const p of due.rows) {
    const list = byOrg.get(p.org_id) ?? [];
    list.push(p);
    byOrg.set(p.org_id, list);
  }

  const { clients, failed: authFailed } = await pinterestClientsForOrgs([...byOrg.keys()]);
  for (const f of authFailed) {
    report.reconnect_required.push(f);
    const held = byOrg.get(f.org_id)?.length ?? 0;
    report.deferred += held;
    report.orgs.push({
      org_id: f.org_id,
      org_name: f.org_name,
      published: 0,
      failed: 0,
      deferred: held,
      note: `needs reconnect: ${f.reason}`,
    });
    byOrg.delete(f.org_id);
  }

  for (const [orgId, pins] of byOrg) {
    const entry = clients.get(orgId)!;
    const target = Math.min(pins[0].daily_pin_target ?? 5, HARD_DAILY_CAP);

    // How many already went out today, and when the last one did. Both come
    // from the same table the cron writes, so a re-run inside one day cannot
    // double-post past the cap.
    const today = await pool.query<{ n: string; last_at: string | null }>(
      `SELECT COUNT(*)::text AS n, MAX(published_at)::text AS last_at
         FROM organic.pins p
         JOIN organic.waterfalls w ON w.id = p.waterfall_id
        WHERE w.org_id = $1
          AND p.status = 'PUBLISHED'::organic.pin_status
          AND p.published_at >= date_trunc('day', now() AT TIME ZONE 'UTC')`,
      [orgId]
    );
    const postedToday = Number(today.rows[0].n);
    const lastAt = today.rows[0].last_at ? new Date(today.rows[0].last_at) : null;

    // Spread the day's allowance rather than dumping it. With a target of
    // four that is one pin every six hours, which is what "unpaid
    // advertising" should look like on a timeline.
    const minGapMs = Math.floor((24 * 60) / Math.max(1, target)) * 60_000;
    if (lastAt && Date.now() - lastAt.getTime() < minGapMs) {
      report.deferred += pins.length;
      report.orgs.push({
        org_id: orgId,
        org_name: entry.orgName,
        published: 0,
        failed: 0,
        deferred: pins.length,
        note: `waiting out the ${Math.round(minGapMs / 60_000)}-minute gap`,
      });
      continue;
    }

    let room = Math.max(0, target - postedToday);
    if (opts.limitPerOrg !== undefined) room = Math.min(room, opts.limitPerOrg);

    let published = 0;
    let failed = 0;
    let deferred = 0;

    let outOfTime = false;
    let videosHeld = 0;

    for (const pin of pins) {
      if (room <= 0) { deferred += 1; continue; }

      // Het budget wordt vóór het werk gevraagd, nooit halverwege. Een run die
      // in een upload wordt afgekapt laat een media_id bij Pinterest achter
      // waar niemand meer iets mee kan, en een pin die misschien wel en
      // misschien niet bestaat.
      if (budgetLeft() <= 0) { deferred += 1; outOfTime = true; continue; }

      const isVideo = !!pin.video_path;
      if (isVideo && !opts.dryRun) {
        if (videosThisRun >= maxVideos) { deferred += 1; videosHeld += 1; continue; }
        // "Past er nog een hele video in" is de vraag, niet "zijn we vroeg in
        // de run": met die tweede vraag werd in de betaalde route elke video
        // voor eeuwig uitgesteld.
        if (budgetLeft() < VIDEO_NEEDS_MS) { deferred += 1; videosHeld += 1; outOfTime = true; continue; }
      }

      if (opts.dryRun) { published += 1; room -= 1; continue; }

      try {
        // Geteld vóór de poging: de tijd is dan al uitgegeven, of hij lukt of niet.
        if (isVideo) videosThisRun += 1;
        const created = isVideo
          ? await publishVideoPin(entry.client, pin, budgetLeft)
          : await entry.client.createPin({
              board_id: pin.pinterest_board_id,
              title: pin.title.slice(0, 100),
              description: pin.description ?? undefined,
              link: pin.url,
              alt_text: pin.alt_text?.slice(0, 500) ?? undefined,
              media_source: { source_type: "image_url", url: pin.image_path },
            });
        await pool.query(
          `UPDATE organic.pins
              SET status = 'PUBLISHED'::organic.pin_status,
                  pinterest_pin_id = $2,
                  published_at = now(),
                  failure_reason = NULL
            WHERE id = $1`,
          [pin.pin_id, created?.id ?? null]
        );
        published += 1;
        if (isVideo) report.videos_published += 1;
        room -= 1;
      } catch (e) {
        const message = (e as Error).message;
        if (isTransient(message)) {
          // Left SCHEDULED on purpose: the next run picks it up. Recording
          // a rate limit as a failure would burn a pin the method has
          // already paid for in research and design.
          deferred += 1;
          await pool.query(
            `UPDATE organic.pins SET failure_reason = $2 WHERE id = $1`,
            [pin.pin_id, `Retrying: ${message.slice(0, 400)}`]
          );
          break; // stop this org for now — the whole account is throttled
        }
        await pool.query(
          `UPDATE organic.pins
              SET status = 'FAILED'::organic.pin_status,
                  failure_reason = $2
            WHERE id = $1`,
          [pin.pin_id, message.slice(0, 900)]
        );
        failed += 1;
      }
    }

    report.published += published;
    report.failed += failed;
    report.deferred += deferred;
    if (outOfTime) report.budget_exhausted = true;
    report.orgs.push({
      org_id: orgId,
      org_name: entry.orgName,
      published,
      failed,
      deferred,
      note:
        room <= 0 && deferred > 0 ? `daily cap ${target} reached`
        : videosHeld > 0 && outOfTime ? `${videosHeld} video pin(s) did not fit in this run`
        : videosHeld > 0 ? `${videosHeld} video pin(s) held back, ${maxVideos} per run`
        : outOfTime ? "the run ran out of time before this store was finished"
        : undefined,
    });
  }

  return report;
}

/**
 * Pick up the pins a newly created board just unblocked.
 *
 * `scheduleWaterfall` queues what it can and holds back every pin whose board
 * is not on Pinterest yet — which is right, and which left the rest of the
 * plan waiting on somebody pressing the button again after the nightly board
 * run. Nothing said when that moment had come. The Longevity store queued
 * nine of sixteen on 15-09-2026 and the other six sat there with their boards
 * due the following morning: the plan is approved, the artwork is cut, the
 * copy is written, and the only thing between them and Pinterest was a second
 * click nobody knew to make.
 *
 * **Only a RUNNING waterfall.** That status means a person has already
 * approved this plan; re-queueing what they approved as its boards appear is
 * finishing their instruction, not taking a decision. A PLANNING waterfall
 * has never been approved and is left exactly where it is — an automatic
 * queue there would publish a plan nobody agreed to.
 *
 * It publishes nothing: the pins go to SCHEDULED and the cron posts each on
 * its own date, caps and all.
 */
export async function queueApprovedPinsForOrg(orgId: string): Promise<{
  queued: number;
  waterfalls: Array<{ id: string; queued: number; still_blocked: number }>;
}> {
  const pool = organicPool();
  const ready = await pool.query<{ id: string }>(
    `SELECT DISTINCT w.id::text
       FROM organic.waterfalls w
       JOIN organic.pins p ON p.waterfall_id = w.id
      WHERE w.org_id = $1
        AND w.status = 'RUNNING'::organic.waterfall_status
        AND p.status = 'PLANNED'::organic.pin_status`,
    [orgId]
  );
  const out: Array<{ id: string; queued: number; still_blocked: number }> = [];
  let queued = 0;
  for (const w of ready.rows) {
    // One bad waterfall must not stop the others — this runs inside a cron
    // that walks every store.
    try {
      const r = await scheduleWaterfall(orgId, w.id);
      queued += r.scheduled;
      if (r.scheduled > 0 || r.blocked.length > 0) {
        out.push({ id: w.id.slice(0, 8), queued: r.scheduled, still_blocked: r.blocked.length });
      }
    } catch {
      /* reported by loadPublishHealth and the daily watchdog */
    }
  }
  return { queued, waterfalls: out };
}

/* ------------------------------------------------------------------ */
/* P4.4.2 — the readout                                                */
/* ------------------------------------------------------------------ */

export interface PublishHealth {
  counts: { planned: number; scheduled: number; published: number; failed: number; cancelled: number };
  /** Due today or earlier and still not out. */
  overdue: number;
  /**
   * Of those, the ones the cron will never pick up because something they
   * need is missing. Counted separately on purpose: the publish query
   * filters on image, board and title, so without this the panel says
   * "6 overdue" while the cron reports "0 due" and nothing reconciles the
   * two. A pin can sit here indefinitely and look merely late.
   */
  stuck: Array<{ sequence: number; scheduled_date: string; reason: string }>;
  next_scheduled: string | null;
  last_published: string | null;
  failures: Array<{
    sequence: number;
    board: string;
    scheduled_date: string;
    reason: string;
    retrying: boolean;
  }>;
  /** Present when the store cannot publish at all until somebody acts. */
  blocker: { kind: "token"; message: string } | null;
  /** Stilgezet door een mens. Geen blokkade en geen fout: een besluit, met de
   *  reden erbij, en het staat bovenaan zodat niemand een uur zoekt naar
   *  waarom er niets uitgaat. */
  paused: { scope: "store" | "cycle"; reason: string | null; since: string; cycles?: string[] } | null;
  /** What actually went out: which design, onto which board, on which day,
   *  with a link to the pin on Pinterest. Newest first. */
  published: PublishedPin[];
  /** Designs across this store's live cycles that carry byte-identical
   *  artwork. See identicalDesignGroups. */
  duplicate_designs: Array<{ designs: string[] }>;
}

export interface PublishedPin {
  sequence: number;
  /** "Bhs · D2 · B" — the creative's address in the waterfall. */
  cycle: string;
  design_number: number;
  intent: string;
  copy_variant: string;
  board: string;
  published_on: string;
  image_url: string | null;
  /** Dit was een videopin; image_url is dan het posterframe. */
  is_video: boolean;
  pin_url: string | null;
  title: string | null;
}

/**
 * Designs whose image is the same file, byte for byte.
 *
 * A design is renamed after its own URL's primary keyword on upload, so the
 * same picture uploaded into two cycles is stored twice under two names and
 * reads as two designs in every query we have. Fit Cherries ran exactly that
 * (14-09-2026): four pins live, four Pinterest ids, and **two** pictures —
 * so the report was "I can only find two of the four", and it was right.
 *
 * Compared on the Supabase Storage ETag, which is the object's md5. A HEAD
 * that fails contributes nothing rather than a guess: claiming two designs
 * are identical when the check could not run is worse than saying nothing,
 * and this is a claim somebody acts on by re-doing artwork.
 */
async function identicalDesignGroups(
  rows: Array<{ label: string; asset_path: string | null }>
): Promise<Array<{ designs: string[] }>> {
  const withImage = rows.filter((r) => r.asset_path);
  if (withImage.length < 2) return [];
  const tags = await Promise.all(withImage.map(async (r) => {
    try {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 4000);
      const res = await fetch(r.asset_path!, { method: "HEAD", signal: ac.signal });
      clearTimeout(t);
      const etag = res.headers.get("etag");
      return etag ? { label: r.label, etag: etag.replace(/"/g, "") } : null;
    } catch { return null; }
  }));
  const byTag = new Map<string, string[]>();
  for (const t of tags) {
    if (!t) continue;
    byTag.set(t.etag, [...(byTag.get(t.etag) ?? []), t.label]);
  }
  return [...byTag.values()].filter((g) => g.length > 1).map((designs) => ({ designs }));
}

/**
 * What P4.4.2 shows. Two kinds of problem, answered differently: a rate
 * limit queues itself and needs nobody, an expired token needs a person and
 * will otherwise sit there until the next cycle fails too.
 */
export async function loadPublishHealth(orgId: string): Promise<PublishHealth> {
  const pool = organicPool();

  const counts = await pool.query<{ status: string; n: string }>(
    `SELECT p.status::text AS status, COUNT(*)::text AS n
       FROM organic.pins p
       JOIN organic.waterfalls w ON w.id = p.waterfall_id
      WHERE w.org_id = $1
      GROUP BY 1`,
    [orgId]
  );
  const c = { planned: 0, scheduled: 0, published: 0, failed: 0, cancelled: 0 };
  for (const r of counts.rows) {
    const k = r.status.toLowerCase() as keyof typeof c;
    if (k in c) c[k] = Number(r.n);
  }

  const timing = await pool.query<{
    overdue: string; next_scheduled: string | null; last_published: string | null;
  }>(
    `SELECT COUNT(*) FILTER (
              WHERE p.status = 'SCHEDULED'::organic.pin_status
                AND p.scheduled_date <= CURRENT_DATE
            )::text AS overdue,
            MIN(p.scheduled_date) FILTER (
              WHERE p.status = 'SCHEDULED'::organic.pin_status
                AND p.scheduled_date > CURRENT_DATE
            )      AS next_scheduled,
            MAX(p.published_at)::text AS last_published
       FROM organic.pins p
       JOIN organic.waterfalls w ON w.id = p.waterfall_id
      WHERE w.org_id = $1`,
    [orgId]
  );

  // Scheduled, its date has passed, and it fails the publish query's own
  // conditions. Same three columns the cron filters on, so this cannot drift
  // apart from it silently.
  const stuck = await pool.query<{
    sequence_number: number; scheduled_date: string;
    has_image: boolean; has_board: boolean; has_title: boolean; has_video: boolean;
    board_name: string;
  }>(
    `SELECT p.sequence_number,
            p.scheduled_date,
            p.image_path IS NOT NULL          AS has_image,
            b.pinterest_board_id IS NOT NULL  AS has_board,
            cs.title IS NOT NULL              AS has_title,
            (d.media_type = 'IMAGE'::organic.media_kind
               OR p.video_path IS NOT NULL)   AS has_video,
            b.name                            AS board_name
       FROM organic.pins p
       JOIN organic.waterfalls w ON w.id = p.waterfall_id
       JOIN organic.boards b     ON b.id = p.board_id
       JOIN organic.designs d    ON d.id = p.design_id
       LEFT JOIN organic.copy_sets cs ON cs.id = p.copy_set_id
      WHERE w.org_id = $1
        AND p.status = 'SCHEDULED'::organic.pin_status
        AND p.scheduled_date <= CURRENT_DATE
        AND (p.image_path IS NULL OR b.pinterest_board_id IS NULL OR cs.title IS NULL
             OR (d.media_type = 'VIDEO'::organic.media_kind AND p.video_path IS NULL))
      ORDER BY p.scheduled_date
      LIMIT 20`,
    [orgId]
  );

  const fails = await pool.query<{
    sequence_number: number; board_name: string; scheduled_date: string;
    failure_reason: string; status: string;
  }>(
    `SELECT p.sequence_number, b.name AS board_name, p.scheduled_date,
            p.failure_reason, p.status::text AS status
       FROM organic.pins p
       JOIN organic.waterfalls w ON w.id = p.waterfall_id
       JOIN organic.boards b     ON b.id = p.board_id
      WHERE w.org_id = $1 AND p.failure_reason IS NOT NULL
      ORDER BY p.scheduled_date DESC
      LIMIT 20`,
    [orgId]
  );

  const pauseRes = await pool.query<{
    store_at: string | null; store_reason: string | null;
    cycle_names: string[] | null; cycle_at: string | null; cycle_reason: string | null;
  }>(
    `SELECT s.publishing_paused_at::text AS store_at,
            s.publishing_pause_reason     AS store_reason,
            (SELECT COALESCE(array_agg(u.name ORDER BY u.name), ARRAY[]::text[])
               FROM organic.waterfalls w2 JOIN organic.urls u ON u.id = w2.url_id
              WHERE w2.org_id = $1 AND w2.paused_at IS NOT NULL
                AND w2.status <> 'ABANDONED'::organic.waterfall_status) AS cycle_names,
            (SELECT MIN(w3.paused_at)::text FROM organic.waterfalls w3
              WHERE w3.org_id = $1 AND w3.paused_at IS NOT NULL) AS cycle_at,
            (SELECT w4.pause_reason FROM organic.waterfalls w4
              WHERE w4.org_id = $1 AND w4.paused_at IS NOT NULL
              ORDER BY w4.paused_at LIMIT 1) AS cycle_reason
       FROM organic.client_settings s WHERE s.org_id = $1`,
    [orgId]
  );
  const pr = pauseRes.rows[0];
  let paused: PublishHealth["paused"] = null;
  if (pr?.store_at) {
    paused = { scope: "store", reason: pr.store_reason, since: pr.store_at.slice(0, 10) };
  } else if ((pr?.cycle_names?.length ?? 0) > 0 && pr?.cycle_at) {
    paused = {
      scope: "cycle", reason: pr.cycle_reason, since: pr.cycle_at.slice(0, 10),
      cycles: pr.cycle_names ?? [],
    };
  }

  // The token is only reported as a blocker when there is something waiting
  // on it. A store between cycles with an expired token is not an incident.
  let blocker: PublishHealth["blocker"] = null;
  const waiting = c.scheduled > 0 || Number(timing.rows[0].overdue) > 0;
  if (waiting) {
    const { failed } = await pinterestClientsForOrgs([orgId]);
    if (failed.length > 0) {
      blocker = { kind: "token", message: failed[0].message };
    }
  }

  // What went live, with the creative's address in the waterfall. The panel
  // could only ever say "4 live", which is not enough to answer "which four,
  // and why do two of them look the same".
  const pub = await pool.query<{
    sequence_number: number; url_name: string; design_number: number; intent: string;
    copy_variant: string; board_name: string; published_at: string;
    image_path: string | null; video_path: string | null;
    pinterest_pin_id: string | null; title: string | null;
  }>(
    `SELECT p.sequence_number, u.name AS url_name, d.design_number,
            d.intent::text AS intent, p.copy_variant, b.name AS board_name,
            p.published_at::text AS published_at, p.image_path, p.video_path,
            p.pinterest_pin_id,
            cs.title
       FROM organic.pins p
       JOIN organic.waterfalls w ON w.id = p.waterfall_id
       JOIN organic.urls u       ON u.id = w.url_id
       JOIN organic.designs d    ON d.id = p.design_id
       JOIN organic.boards b     ON b.id = p.board_id
       LEFT JOIN organic.copy_sets cs ON cs.id = p.copy_set_id
      WHERE w.org_id = $1 AND p.status = 'PUBLISHED'::organic.pin_status
      ORDER BY p.published_at DESC
      LIMIT 40`,
    [orgId]
  );

  const designRows = await pool.query<{ label: string; asset_path: string | null }>(
    `SELECT u.name || ' · D' || d.design_number AS label, d.asset_path
       FROM organic.designs d
       JOIN organic.waterfalls w ON w.id = d.waterfall_id
       JOIN organic.urls u       ON u.id = w.url_id
      WHERE w.org_id = $1
        AND w.status <> 'ABANDONED'::organic.waterfall_status
      ORDER BY u.name, d.design_number`,
    [orgId]
  );

  return {
    counts: c,
    overdue: Number(timing.rows[0].overdue),
    published: pub.rows.map((r) => ({
      sequence: r.sequence_number,
      cycle: r.url_name,
      design_number: r.design_number,
      intent: r.intent,
      copy_variant: r.copy_variant,
      board: r.board_name,
      published_on: (r.published_at ?? "").slice(0, 10),
      image_url: r.image_path,
      is_video: !!r.video_path,
      pin_url: r.pinterest_pin_id ? `https://www.pinterest.com/pin/${r.pinterest_pin_id}/` : null,
      title: r.title,
    })),
    duplicate_designs: await identicalDesignGroups(designRows.rows),
    stuck: stuck.rows.map((s) => ({
      sequence: s.sequence_number,
      scheduled_date: s.scheduled_date,
      reason: [
        !s.has_image ? "no image (P4.2.4 / P4.2.5)" : null,
        !s.has_board ? `board "${s.board_name}" not on Pinterest yet` : null,
        !s.has_title ? "no copy (P4.2.8)" : null,
        !s.has_video ? "video pin with no mp4 on it (P4.2.5)" : null,
      ].filter(Boolean).join("; "),
    })),
    paused,
    next_scheduled: timing.rows[0].next_scheduled,
    last_published: timing.rows[0].last_published,
    failures: fails.rows.map((f) => ({
      sequence: f.sequence_number,
      board: f.board_name,
      scheduled_date: f.scheduled_date,
      reason: f.failure_reason,
      retrying: f.status === "SCHEDULED",
    })),
    blocker,
  };
}
