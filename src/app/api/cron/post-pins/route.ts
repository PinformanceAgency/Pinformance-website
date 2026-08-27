import { NextRequest, NextResponse, after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/encryption";
import { PinterestClient } from "@/lib/pinterest/client";
import { alertCronFailure } from "@/lib/alerts";

export const maxDuration = 300;

/**
 * How long a run may take before it stops starting new work.
 *
 * `maxDuration = 300` is what we ask for; it is not what we get. This route
 * was killed twice on 27-08-2026 with "instance was killed because it ran out
 * of available memory", and a replay of the loop that day needed ~600s to
 * walk thirteen stores. A run that dies mid-flight is worse than a short one:
 * it leaves pins in `posting` (the self-heal at the top only picks those up
 * ten minutes later) and it always dies at the same place, so the stores at
 * the back of the list never get served at all.
 *
 * So the run budgets itself and stops cleanly. Every store still gets served,
 * because the cron fires every 15 minutes and the order is least-recently-
 * posted first — a store skipped now is at the front next time. With 96 runs
 * a day the binding limit is the per-org daily cap, not this.
 */
const RUN_BUDGET_MS = Number(process.env.POST_PINS_BUDGET_MS) || 50_000;

/**
 * A store is never skipped — it is continued.
 *
 * The budget above means a run can end with stores it did not reach. The
 * least-recently-posted ordering already guarantees those go first next time,
 * but "next time" is up to fifteen minutes away and an emergent guarantee is
 * not the same as a promise. So a run that leaves anyone behind hands them to
 * a follow-up run immediately, with `?only=` naming exactly who is left.
 *
 * `?pass=` bounds the chain. Four passes at ~50s each covers far more stores
 * than exist, and the cap is there so a store that somehow always ends up in
 * `not_reached` cannot spin up runs forever.
 */
const MAX_PASSES = 4;

/**
 * Videos are register → upload → poll, and the poll alone runs to 60s while
 * the file sits in memory as one Buffer. Two of those in a run is the memory
 * kill, so: one per run.
 *
 * A video does not fit in RUN_BUDGET_MS and never will — the first version of
 * this guard asked for 90s of a 50s budget, which is a condition that cannot
 * be true, so every video pin was deferred on every run forever. So a video
 * is only started in the first VIDEO_START_BEFORE_MS of a run, and once one is
 * in flight the run is allowed to grow to VIDEO_RUN_BUDGET_MS to finish it.
 * Starting late is the thing that kills a run; running long on purpose, with
 * exactly one file in memory, is not.
 */
const MAX_VIDEOS_PER_RUN = 1;
const VIDEO_START_BEFORE_MS = 15_000;
const VIDEO_RUN_BUDGET_MS = 110_000;

/** Refuse to pull an unreasonably large file into memory. Our pins are a few
 *  MB; anything near this is a mistake upstream and taking the run down with
 *  it helps nobody. */
const MAX_VIDEO_BYTES = 120 * 1024 * 1024;

/**
 * Is this failure worth trying again in five seconds?
 *
 * Almost none of them are. The loop used to retry everything three times with
 * 5s and 10s backoff, which is right for a 429 or a dropped connection and
 * wrong for everything else. petcura's every create came back
 *
 *   403 {"code":29,"message":"Apps with Trial access may not create Pins in
 *        production ... use API Sandbox ... instead."}
 *
 * — an app-level restriction that will still be true in five seconds, in five
 * days, and after five hundred retries. Three stores' worth of that ate a
 * whole run's budget while the stores behind them got nothing.
 *
 * Retry the transient (429, 5xx, network); fail fast on anything that is a
 * statement about permissions or about the request itself.
 */
function isRetryable(message: string): boolean {
  const m = message.toLowerCase();
  if (m.includes("error 429") || m.includes("rate limit")) return true;
  if (/error 5\d\d/.test(m)) return true;
  // 401 has its own refresh-and-retry path below; everything else in the 4xx
  // range is the API telling us the request cannot succeed as posed.
  if (/error 4\d\d/.test(m)) return false;
  // No status in the message: a fetch/DNS/timeout failure. Worth one more go.
  return true;
}

/**
 * Failures that are about the store, not about this one pin.
 *
 * Trial access and a dead token block every pin that store has. Finding that
 * out once and moving on is the difference between serving the other twelve
 * stores and serving none of them.
 */
/**
 * Failures that will still be true next time, for this pin specifically.
 *
 * A 303MB video (Mylifetrove, found 27-08-2026 — and the reason this route
 * kept running out of memory) does not get smaller on the next run, and a
 * request Pinterest rejects as malformed does not become well-formed. Retrying
 * these is how a pin sits at the head of the queue for two months. They go to
 * `failed` with the reason, where somebody can see it and re-cut the video.
 *
 * Checked after isStoreLevel, so a trial-access 403 is treated as the store
 * problem it is rather than retiring the store's pins one by one.
 */
function isPermanentPinFailure(message: string): boolean {
  const m = message.toLowerCase();
  if (m.includes("over the") && m.includes("limit")) return true;
  if (m.includes("video processing failed")) return true;
  // Pinterest saying 4xx about the request itself — not 429, which is timing.
  if (/error 4\d\d/.test(m) && !m.includes("error 429")) return true;
  return false;
}

function isStoreLevel(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("trial access")
    || m.includes("error 401")
    || m.includes("authentication failed");
}

function verifyCron(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${process.env.CRON_SECRET}`) return true;
  const cronSecret = request.headers.get("x-cron-secret");
  if (cronSecret === (process.env.CRON_SECRET)) return true;
  return false;
}

export async function GET(request: NextRequest) { return handlePostPins(request); }
export async function POST(request: NextRequest) { return handlePostPins(request); }

async function handlePostPins(request: NextRequest) {
  if (!verifyCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();
  // `?force_org=<uuid>` (comma-separated for multiple) makes the cron ignore
  // the daily cap + min-post-interval for that specific org. Set by the
  // "Post Now" bulk action so a manual click actually means "now" instead
  // of waiting for the next 15-min cron window + the org's rate limit.
  const forceOrgParam = request.nextUrl.searchParams.get("force_org");
  const forcedOrgIds = new Set(
    (forceOrgParam ? forceOrgParam.split(",") : []).map((s) => s.trim()).filter(Boolean)
  );
  // Set by a previous pass that ran out of budget: do only these stores.
  const onlyParam = request.nextUrl.searchParams.get("only");
  const onlyOrgIds = new Set(
    (onlyParam ? onlyParam.split(",") : []).map((s) => s.trim()).filter(Boolean)
  );
  const pass = Math.max(1, Number(request.nextUrl.searchParams.get("pass")) || 1);

  // Self-heal: reset pins stuck in "posting" for > 10 minutes back to scheduled
  const stuckCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  await admin
    .from("pins")
    .update({ status: "scheduled", scheduled_at: now })
    .eq("status", "posting")
    .lt("updated_at", stuckCutoff);

  // Who is owed a post, and how long each has been waiting. One round-trip —
  // see migration 086 for why this is an RPC and not a select: the old
  // prefilter pulled every due pin row to collect distinct org ids, which
  // PostgREST caps at 1000, and it produced no basis for ordering.
  const { data: dueOrgs, error: dueErr } = await admin.rpc("pins_due_orgs");
  if (dueErr) {
    return NextResponse.json({ error: `pins_due_orgs: ${dueErr.message}` }, { status: 500 });
  }
  const due = (dueOrgs ?? []) as Array<{
    org_id: string; due_count: number; oldest_due: string; last_posted: string | null;
  }>;
  if (due.length === 0) {
    return NextResponse.json({ message: "No due pins", posted: 0, pass });
  }

  const dueForThisPass = onlyOrgIds.size > 0
    ? due.filter((d) => onlyOrgIds.has(d.org_id))
    : due;
  if (dueForThisPass.length === 0) {
    return NextResponse.json({ message: "Nothing left for this pass", posted: 0, pass });
  }

  // Least-recently-posted first, a store that has never posted before all of
  // them. The old loop ran the orgs in whatever order the database handed
  // back, which was stable — so the same stores were served every run and the
  // ones behind them were served never. petcura had 40 due pins, a valid
  // token and a valid board, and had posted nothing, ever.
  dueForThisPass.sort((a, b) => {
    if (a.last_posted === b.last_posted) return a.oldest_due < b.oldest_due ? -1 : 1;
    if (a.last_posted === null) return -1;
    if (b.last_posted === null) return 1;
    return a.last_posted < b.last_posted ? -1 : 1;
  });

  const { data: orgRows } = await admin
    .from("organizations")
    .select("id, name, pinterest_access_token_encrypted, pinterest_refresh_token_encrypted, pinterest_token_expires_at, pinterest_app_id, pinterest_app_secret_encrypted, settings, pinterest_last_error")
    .not("pinterest_access_token_encrypted", "is", null)
    .in("id", dueForThisPass.map((d) => d.org_id));

  if (!orgRows || orgRows.length === 0) {
    return NextResponse.json({ message: "No orgs to process", posted: 0 });
  }

  // The `.in()` above loses the ordering, so put it back.
  const byId = new Map(orgRows.map((o) => [o.id as string, o]));
  const orgs = dueForThisPass.map((d) => byId.get(d.org_id)).filter(Boolean) as typeof orgRows;
  const lastPostedByOrg = new Map(dueForThisPass.map((d) => [d.org_id, d.last_posted]));

  const startedAt = Date.now();
  const elapsed = () => Date.now() - startedAt;
  // Raised to VIDEO_RUN_BUDGET_MS for the rest of the run once a video starts.
  let budgetMs = RUN_BUDGET_MS;
  const budgetLeft = () => budgetMs - elapsed();
  let videosThisRun = 0;
  const notReached: Array<{ id: string; name: string }> = [];
  const newlyBlocked: Array<{ org: string; reason: string }> = [];
  const recovered: string[] = [];

  /**
   * Persist why a store is not publishing — or clear it once one does.
   *
   * Migration 087. Never throws: a bookkeeping write must not be able to take
   * down a run that was otherwise posting fine.
   */
  const recordOrgOutcome = async (orgId: string, reason: string | null) => {
    try {
      const before = (byId.get(orgId)?.pinterest_last_error as string | null) ?? null;
      const now = reason ? reason.slice(0, 500) : null;
      // Only shout when something changed. A store blocked on trial access is
      // blocked on every one of the 96 runs a day, and a channel that says the
      // same thing 96 times is a channel nobody reads.
      if (now && now !== before) {
        newlyBlocked.push({ org: (byId.get(orgId)?.name as string) || orgId, reason: now });
      }
      // And the other direction. A store that was blocked and is publishing
      // again is the message somebody is actually waiting for — petcura sat
      // on Trial access for weeks, and the day that is granted the only
      // signal would otherwise be somebody thinking to go and look.
      if (!now && before) {
        recovered.push((byId.get(orgId)?.name as string) || orgId);
      }
      if (now === before) return;
      await admin.from("organizations").update({
        pinterest_last_error: now,
        pinterest_last_error_at: now ? new Date().toISOString() : null,
      }).eq("id", orgId);
    } catch {
      /* bookkeeping only */
    }
  };

  let totalPosted = 0;
  const results: {
    org: string;
    org_id?: string;
    posted: number;
    errors: string[];
    skip?: string;
    forced?: boolean;
    blocked?: string;
  }[] = [];

  for (const org of orgs) {
    const orgErrors: string[] = [];
    let orgPosted = 0;
    let skipReason: string | undefined;
    // Set when a failure turns out to be about the store rather than the pin
    // — trial access, a dead token. Every remaining pin would fail the same
    // way, so the pin loop stops and the reason is stored on the org.
    let storeBlocked: string | null = null;

    // Out of time. Stop cleanly and say who did not get a turn, rather than
    // being killed halfway through a store. They are at the front of the
    // next run by construction — the order is least-recently-posted first.
    if (budgetLeft() <= 0) {
      notReached.push({ id: org.id as string, name: (org.name as string) || (org.id as string) });
      continue;
    }

    try {
      // Check & refresh token if needed
      let token: string;
      try {
        token = decrypt(org.pinterest_access_token_encrypted);
      } catch {
        orgErrors.push("Token decrypt failed");
        skipReason = "decrypt_failed";
        await recordOrgOutcome(org.id as string, "Pinterest token could not be decrypted — reconnect the account");
        results.push({ org: org.name || org.id, posted: 0, errors: orgErrors, skip: skipReason });
        continue;
      }

      if (org.pinterest_token_expires_at && new Date(org.pinterest_token_expires_at) < new Date()) {
        // Try refresh
        if (org.pinterest_refresh_token_encrypted) {
          try {
            const refreshToken = decrypt(org.pinterest_refresh_token_encrypted);
            let appId, appSecret;
            if (org.pinterest_app_id) appId = org.pinterest_app_id;
            if (org.pinterest_app_secret_encrypted) appSecret = decrypt(org.pinterest_app_secret_encrypted);
            const newTokens = await PinterestClient.refreshToken(refreshToken, appId, appSecret);
            token = newTokens.access_token;
            // Save new tokens
            const { encrypt } = await import("@/lib/encryption");
            await admin.from("organizations").update({
              pinterest_access_token_encrypted: encrypt(newTokens.access_token),
              pinterest_refresh_token_encrypted: newTokens.refresh_token ? encrypt(newTokens.refresh_token) : org.pinterest_refresh_token_encrypted,
              pinterest_token_expires_at: new Date(Date.now() + (newTokens.expires_in || 2592000) * 1000).toISOString(),
            }).eq("id", org.id);
          } catch (refreshErr) {
            const rmsg = refreshErr instanceof Error ? refreshErr.message : "unknown";
            orgErrors.push(`Token refresh failed: ${rmsg}`);
            skipReason = "refresh_failed";
            await recordOrgOutcome(org.id as string, `Pinterest token refresh failed — reconnect the account (${rmsg})`);
            results.push({ org: org.name || org.id, posted: 0, errors: orgErrors, skip: skipReason });
            continue;
          }
        } else {
          orgErrors.push("Token expired, no refresh token");
          skipReason = "no_refresh_token";
        await recordOrgOutcome(org.id as string, "Pinterest token expired and there is no refresh token — reconnect the account");
          results.push({ org: org.name || org.id, posted: 0, errors: orgErrors, skip: skipReason });
          continue;
        }
      }

      const orgSettings = (org.settings as Record<string, unknown>) || {};
      const isTrial = (orgSettings.pinterest_access_tier as string) === "trial";
      const pinterest = new PinterestClient(token, isTrial);

      // CATEGORY-AWARE CAP: swimwear still hard-capped at 2/day because
      // Pinterest actively throttles bikini/swim posting; every other niche
      // respects the org's `settings.max_pins_per_day` (default 5) so stores
      // like Valerie Mason (jewelry, 22 pins in queue) aren't blocked at 2.
      const SWIMWEAR_CAP = 2;
      const orgMaxPerDay = Number(orgSettings.max_pins_per_day);
      const OTHER_CAP = isFinite(orgMaxPerDay) && orgMaxPerDay > 0 ? orgMaxPerDay : 5;
      const isSwimBoardName = (name: string | null | undefined) => {
        const n = (name || "").toLowerCase();
        return n.includes("bikini") || n.includes("swimwear");
      };
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);
      const { data: postedToday } = await admin
        .from("pins")
        .select("id, boards(name)")
        .eq("org_id", org.id)
        .eq("status", "posted")
        .gte("posted_at", todayStart.toISOString());
      const postedList = (postedToday || []) as unknown as Array<{ id: string; boards: { name: string | null } | null }>;
      const swimwearPostedToday = postedList.filter(p => isSwimBoardName(p.boards?.name)).length;
      const otherPostedToday = postedList.length - swimwearPostedToday;
      const forced = forcedOrgIds.has(org.id as string);
      if (
        !forced &&
        swimwearPostedToday >= SWIMWEAR_CAP &&
        otherPostedToday >= OTHER_CAP
      ) {
        skipReason = `daily_cap_reached_sw${swimwearPostedToday}/${SWIMWEAR_CAP}_other${otherPostedToday}/${OTHER_CAP}`;
        results.push({ org: org.name || org.id, posted: 0, errors: orgErrors, skip: skipReason });
        continue;
      }

      // Rate limit: respect the org's `settings.min_post_interval_minutes`
      // (default 30). Some brands ship 3-hour intervals so they never look
      // spammy to Pinterest; the previous hardcoded 30-min ignored that.
      const orgMinInterval = Number(orgSettings.min_post_interval_minutes);
      const MIN_INTERVAL_MIN = isFinite(orgMinInterval) && orgMinInterval > 0 ? orgMinInterval : 30;
      // Already known from pins_due_orgs() — no second round-trip for it.
      const lastPostedAt = lastPostedByOrg.get(org.id as string) ?? null;

      if (!forced && lastPostedAt) {
        const timeSinceLastPost = Date.now() - new Date(lastPostedAt).getTime();
        if (timeSinceLastPost < MIN_INTERVAL_MIN * 60_000) {
          skipReason = `rate_limit_${Math.round(timeSinceLastPost/60000)}min_of_${MIN_INTERVAL_MIN}min`;
          results.push({
            org: org.name || org.id,
            org_id: org.id,
            posted: 0,
            errors: orgErrors,
            skip: skipReason,
            forced,
          });
          continue;
        }
      }

      // Get overdue pins, then filter by per-category remaining capacity
      const { data: allDuePins } = await admin
        .from("pins")
        .select("*, boards(pinterest_board_id, name)")
        .eq("org_id", org.id)
        .in("status", ["approved", "scheduled"])
        .lte("scheduled_at", now)
        .order("scheduled_at", { ascending: true })
        .limit(10);

      let remainingSwim = forced ? Infinity : SWIMWEAR_CAP - swimwearPostedToday;
      let remainingOther = forced ? Infinity : OTHER_CAP - otherPostedToday;
      // Forced "Post Now" batches skip the daily caps but still cap at 10 per
      // invocation so we don't blow the Vercel 300s function budget.
      const perRunCap = forced ? 10 : SWIMWEAR_CAP + OTHER_CAP;
      const duePins: typeof allDuePins = [];
      for (const pin of allDuePins || []) {
        const bn = (pin.boards as { name: string | null } | null)?.name;
        if (isSwimBoardName(bn)) {
          if (remainingSwim > 0) { duePins.push(pin); remainingSwim--; }
        } else {
          if (remainingOther > 0) { duePins.push(pin); remainingOther--; }
        }
        if (duePins.length >= perRunCap) break;
      }

      if (!duePins || duePins.length === 0) {
        skipReason = "no_due_pins";
        results.push({ org: org.name || org.id, posted: 0, errors: orgErrors, skip: skipReason });
        continue;
      }

      for (const pin of duePins) {
        if (budgetLeft() <= 0 || storeBlocked) break;

        /**
         * A pin that can never be posted is retired, not retried.
         *
         * These two checks used to `continue`, which changed nothing about
         * the pin: it stayed `scheduled` with its old `scheduled_at`, so it
         * came back as one of the ten oldest on the next run, and the run
         * after that, forever. Fit Cherries' ten oldest pins were all
         * unpostable — nine with no image, one with no board — so the 131
         * pins queued behind them had not moved since 2 July.
         *
         * `failed` + a reason takes them out of the queue and leaves them
         * findable, so the images can be regenerated and the boards assigned.
         * Nothing is deleted.
         */
        const retire = async (reason: string) => {
          await admin.from("pins")
            .update({ status: "failed", rejected_reason: reason })
            .eq("id", pin.id);
          orgErrors.push(`Pin ${pin.id}: ${reason} → failed`);
        };

        const boardPinterestId = (pin.boards as { pinterest_board_id: string | null })?.pinterest_board_id;
        if (!boardPinterestId) {
          await retire("board has no Pinterest board ID");
          continue;
        }

        const isVideo = pin.pin_type === "video" || !!pin.video_url;
        if (!isVideo && !pin.image_url) {
          await retire("no image or video on the pin");
          continue;
        }

        // Videos are the expensive path — see MAX_VIDEOS_PER_RUN. Leaving one
        // for the next run costs 15 minutes; starting one with 20 seconds of
        // budget left costs the whole run and the store behind it.
        if (isVideo) {
          if (videosThisRun >= MAX_VIDEOS_PER_RUN) {
            orgErrors.push(`Pin ${pin.id}: video deferred, one per run`);
            continue;
          }
          if (elapsed() > VIDEO_START_BEFORE_MS) {
            orgErrors.push(`Pin ${pin.id}: video deferred, too late in the run to start one`);
            continue;
          }
          videosThisRun++;
          budgetMs = VIDEO_RUN_BUDGET_MS;
        }

        // Mark as posting
        await admin.from("pins").update({ status: "posting" }).eq("id", pin.id);

        // Build link URL
        let linkUrl = pin.link_url || undefined;
        if (!linkUrl) {
          const { data: bp } = await admin.from("brand_profiles").select("raw_data").eq("org_id", org.id).single();
          linkUrl = (bp?.raw_data as Record<string, unknown>)?.default_link_url as string || undefined;
        }

        // Try posting with retry
        let posted = false;
        // Set when the pin was taken out of the queue for good, so the
        // reschedule below does not put it straight back in.
        let retired = false;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            if (isVideo && pin.video_url) {
              // VIDEO: register → upload → create
              const media = await pinterest.registerMediaUpload();

              let videoUrl = pin.video_url;
              const vPath = videoUrl.split("/object/public/pin-images/")[1];
              if (vPath) {
                const { data: vSigned } = await admin.storage.from("pin-images").createSignedUrl(vPath, 300);
                if (vSigned?.signedUrl) videoUrl = vSigned.signedUrl;
              }

              const videoRes = await fetch(videoUrl);
              if (!videoRes.ok) throw new Error(`Video download: ${videoRes.status}`);
              const declared = Number(videoRes.headers.get("content-length") || 0);
              if (declared > MAX_VIDEO_BYTES) {
                throw new Error(`Video is ${Math.round(declared / 1048576)}MB, over the ${MAX_VIDEO_BYTES / 1048576}MB limit`);
              }
              const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
              const videoContentType = videoRes.headers.get("content-type") || "video/mp4";

              await pinterest.uploadVideoToS3(media.upload_url, media.upload_parameters, videoBuffer, videoContentType);

              // Poll media status until registered/succeeded. Pinterest is
              // usually ready inside a few seconds, so the first look is
              // quick and the wait grows from there — the old fixed 5s slept
              // through the common case twelve times over. Still bounded by
              // the run budget: an upload that is not ready in time is picked
              // up as a fresh attempt on the next run.
              let mediaReady = false;
              for (let poll = 0; poll < 12; poll++) {
                await new Promise(r => setTimeout(r, poll === 0 ? 1500 : 5000));
                if (budgetLeft() <= 0) break;
                try {
                  const mediaStatus = await pinterest.getMediaStatus(media.media_id);
                  if (mediaStatus.status === "succeeded" || mediaStatus.status === "registered") {
                    mediaReady = true;
                    break;
                  }
                  if (mediaStatus.status === "failed") {
                    throw new Error(`Video processing failed for media ${media.media_id}`);
                  }
                } catch (statusErr) {
                  if (statusErr instanceof Error && statusErr.message.includes("failed")) throw statusErr;
                  // Status check failed, continue polling
                }
              }
              if (!mediaReady) {
                throw new Error(`Video processing timeout for media ${media.media_id}`);
              }

              const pPin = await pinterest.createVideoPin({
                board_id: boardPinterestId,
                title: pin.title,
                description: pin.description || undefined,
                link: linkUrl,
                alt_text: pin.alt_text || undefined,
                media_id: media.media_id,
                cover_image_key_frame_time: 1000, // Use frame at 1s as cover
              });

              await admin.from("pins").update({
                status: "posted",
                pinterest_pin_id: pPin.id,
                posted_at: new Date().toISOString(),
              }).eq("id", pin.id);

              posted = true;
              orgPosted++;
              break;
            } else {
              // IMAGE: direct post with signed URL
              let imageUrl = pin.image_url || "";
              const iPath = imageUrl.split("/object/public/pin-images/")[1];
              if (iPath) {
                const { data: iSigned } = await admin.storage.from("pin-images").createSignedUrl(iPath, 300);
                if (iSigned?.signedUrl) imageUrl = iSigned.signedUrl;
              }

              const pPin = await pinterest.createPin({
                board_id: boardPinterestId,
                title: pin.title,
                description: pin.description || undefined,
                link: linkUrl,
                alt_text: pin.alt_text || undefined,
                media_source: {
                  source_type: "image_url",
                  url: imageUrl,
                },
              });

              await admin.from("pins").update({
                status: "posted",
                pinterest_pin_id: pPin.id,
                posted_at: new Date().toISOString(),
              }).eq("id", pin.id);

              posted = true;
              orgPosted++;
              break;
            }
          } catch (postErr) {
            const errMsg = postErr instanceof Error ? postErr.message : "unknown";

            // On 401, force token refresh immediately and retry
            if (errMsg.includes("401") && attempt === 0 && org.pinterest_refresh_token_encrypted) {
              try {
                // ALWAYS re-fetch latest refresh token from DB to avoid stale token from closure
                const { data: freshOrg } = await admin.from("organizations")
                  .select("pinterest_refresh_token_encrypted, pinterest_app_id, pinterest_app_secret_encrypted")
                  .eq("id", org.id).single();
                if (!freshOrg?.pinterest_refresh_token_encrypted) throw new Error("No fresh refresh token in DB");
                const rt = decrypt(freshOrg.pinterest_refresh_token_encrypted);
                const aid = freshOrg.pinterest_app_id || undefined;
                const asec = freshOrg.pinterest_app_secret_encrypted ? decrypt(freshOrg.pinterest_app_secret_encrypted) : undefined;
                const newT = await PinterestClient.refreshToken(rt, aid, asec);
                const { encrypt } = await import("@/lib/encryption");
                await admin.from("organizations").update({
                  pinterest_access_token_encrypted: encrypt(newT.access_token),
                  pinterest_refresh_token_encrypted: newT.refresh_token ? encrypt(newT.refresh_token) : freshOrg.pinterest_refresh_token_encrypted,
                  pinterest_token_expires_at: new Date(Date.now() + (newT.expires_in || 2592000) * 1000).toISOString(),
                }).eq("id", org.id);
                // Rebuild pinterest client with new token
                Object.assign(pinterest, new PinterestClient(newT.access_token, isTrial));
                orgErrors.push(`Pin ${pin.id}: 401 → token refreshed, retrying`);
                continue; // retry immediately with new token
              } catch (refreshErr) {
                const rMsg = refreshErr instanceof Error ? refreshErr.message : "unknown";
                orgErrors.push(`Pin ${pin.id}: 401 refresh FAILED: ${rMsg}`);
              }
            }

            // A failure that is about the store blocks every pin it has.
            // Record it, stop this pin, and let the org loop below skip the
            // rest — the alternative is discovering the same thing six more
            // times and spending the run's budget doing it.
            if (isStoreLevel(errMsg)) {
              orgErrors.push(`Pin ${pin.id}: ${errMsg}`);
              storeBlocked = errMsg;
              break;
            }

            if (isPermanentPinFailure(errMsg)) {
              await retire(errMsg);
              retired = true;
              break;
            }

            if (!isRetryable(errMsg)) {
              orgErrors.push(`Pin ${pin.id}: ${errMsg} (not retryable)`);
              break;
            }

            if (attempt < 2 && budgetLeft() > 12_000) {
              await new Promise(r => setTimeout(r, 5000 * (attempt + 1))); // Backoff: 5s, 10s
            } else {
              orgErrors.push(`Pin ${pin.id}: ${errMsg} (${attempt + 1} attempt(s))`);
              break;
            }
          }
        }

        // If all retries failed, reschedule for now so next cron run (15 min)
        // picks it up again — unless the pin was retired, in which case
        // rescheduling would undo that and hand it back to the queue.
        if (!posted && !retired) {
          await admin.from("pins").update({
            status: "scheduled",
            scheduled_at: new Date().toISOString(),
          }).eq("id", pin.id);
        }

        // A breath between pins so a burst does not read as spam. It used to
        // be 3s, which with seven pins is 21 seconds of a run spent asleep —
        // and Pinterest's create-pin limit is nowhere near one per three
        // seconds. Skipped entirely when the budget is gone, since the next
        // thing that happens is the loop breaking anyway.
        if (budgetLeft() > 1000) await new Promise(r => setTimeout(r, 800));
      }

      // What is wrong with this store, on the store — see migration 087. A
      // reason that only exists in a cron's response body is a reason nobody
      // will ever read, which is how petcura stayed at zero posts from
      // onboarding onwards with every screen showing it as "scheduled".
      await recordOrgOutcome(org.id as string, orgPosted > 0 ? null : storeBlocked);
    } catch (orgErr) {
      orgErrors.push(orgErr instanceof Error ? orgErr.message : "Unknown org error");
    }

    results.push({
      org: org.name || org.id,
      posted: orgPosted,
      errors: orgErrors,
      ...(storeBlocked ? { blocked: storeBlocked } : {}),
    });
    totalPosted += orgPosted;
  }

  // A store that has stopped publishing is worth a message the first time it
  // happens, and never again until something changes. Without this the reason
  // sits in a database column that nobody has a reason to look at — which is
  // how petcura went from onboarding to zero posts unnoticed.
  if (newlyBlocked.length > 0) {
    await alertCronFailure({
      cron: "post-pins",
      level: "attention",
      message:
        `${newlyBlocked.length} store(s) publiceren niet meer. Pins blijven op scheduled staan ` +
        `tot dit opgelost is.`,
      error: newlyBlocked.map((b) => `${b.org}: ${b.reason}`).join("\n"),
    });
  }

  if (recovered.length > 0) {
    await alertCronFailure({
      cron: "post-pins",
      level: "attention",
      message:
        `${recovered.join(", ")} publiceert weer. De achterstand loopt vanaf nu terug op ` +
        `de dagcap van de store.`,
    });
  }

  // Hand the leftovers to a follow-up run, right now, rather than letting the
  // fifteen-minute schedule decide when they get their turn. after() runs the
  // work once the response has gone out, so the chain does not count against
  // this run's own budget.
  if (notReached.length > 0 && pass < MAX_PASSES) {
    const base = process.env.NEXT_PUBLIC_APP_URL || `https://${request.nextUrl.host}`;
    const url = `${base}/api/cron/post-pins?pass=${pass + 1}`
      + `&only=${notReached.map((n) => n.id).join(",")}`
      + (forcedOrgIds.size > 0 ? `&force_org=${Array.from(forcedOrgIds).join(",")}` : "");
    after(async () => {
      try {
        await fetch(url, { headers: { "x-cron-secret": process.env.CRON_SECRET ?? "" } });
      } catch (e) {
        // The next scheduled run picks them up anyway — they are at the front
        // of the order by construction. Losing the continuation costs minutes,
        // never the work itself.
        console.error("[post-pins] continuation failed:", e instanceof Error ? e.message : e);
      }
    });
  }

  // The run says what it did AND what it did not get to. A cron that reports
  // only its successes cannot tell "nothing was due" apart from "I died before
  // I got there", which is exactly the confusion that let petcura sit at zero
  // posts for weeks.
  return NextResponse.json({
    posted: totalPosted,
    elapsed_ms: Date.now() - startedAt,
    pass,
    orgs_considered: orgs.length,
    not_reached: notReached.map((n) => n.name),
    continuing: notReached.length > 0 && pass < MAX_PASSES,
    videos_attempted: videosThisRun,
    results,
    forced_org_ids: Array.from(forcedOrgIds),
  });
}
