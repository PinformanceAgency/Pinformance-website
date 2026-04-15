import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/encryption";
import { PinterestClient } from "@/lib/pinterest/client";

export const maxDuration = 300;

function verifyCron(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${process.env.CRON_SECRET || process.env.CRON_SET}`) return true;
  const cronSecret = request.headers.get("x-cron-secret");
  if (cronSecret === (process.env.CRON_SECRET || process.env.CRON_SET)) return true;
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

  // Self-heal: reset pins stuck in "posting" for > 10 minutes back to scheduled
  const stuckCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  await admin
    .from("pins")
    .update({ status: "scheduled", scheduled_at: now })
    .eq("status", "posting")
    .lt("updated_at", stuckCutoff);

  const { data: orgs } = await admin
    .from("organizations")
    .select("id, name, pinterest_access_token_encrypted, pinterest_refresh_token_encrypted, pinterest_token_expires_at, pinterest_app_id, pinterest_app_secret_encrypted, settings")
    .not("pinterest_access_token_encrypted", "is", null);

  if (!orgs || orgs.length === 0) {
    return NextResponse.json({ message: "No orgs to process", posted: 0 });
  }

  let totalPosted = 0;
  const results: { org: string; posted: number; errors: string[] }[] = [];

  for (const org of orgs) {
    const orgErrors: string[] = [];
    let orgPosted = 0;

    try {
      // Check & refresh token if needed
      let token: string;
      try {
        token = decrypt(org.pinterest_access_token_encrypted);
      } catch {
        orgErrors.push("Token decrypt failed");
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
            orgErrors.push(`Token refresh failed: ${refreshErr instanceof Error ? refreshErr.message : "unknown"}`);
            continue;
          }
        } else {
          orgErrors.push("Token expired, no refresh token");
          continue;
        }
      }

      const orgSettings = (org.settings as Record<string, unknown>) || {};
      const isTrial = (orgSettings.pinterest_access_tier as string) === "trial";
      const pinterest = new PinterestClient(token, isTrial);

      // Rate limit: minimum 30 min between posts to avoid Pinterest spam detection
      const { data: lastPosted } = await admin
        .from("pins")
        .select("posted_at")
        .eq("org_id", org.id)
        .eq("status", "posted")
        .order("posted_at", { ascending: false })
        .limit(1);

      if (lastPosted?.[0]?.posted_at) {
        const timeSinceLastPost = Date.now() - new Date(lastPosted[0].posted_at).getTime();
        if (timeSinceLastPost < 30 * 60_000) continue; // Min 30 min between posts
      }

      // Get ALL overdue pins (scheduled_at <= now) — no daily limit for overdue pins
      // This ensures pins that should have been posted yesterday are still posted today
      const { data: duePins } = await admin
        .from("pins")
        .select("*, boards(pinterest_board_id, name)")
        .eq("org_id", org.id)
        .in("status", ["approved", "scheduled"])
        .lte("scheduled_at", now)
        .order("scheduled_at", { ascending: true })
        .limit(5); // Post up to 5 per cron run (every 15 min)

      if (!duePins || duePins.length === 0) continue;

      for (const pin of duePins) {
        const boardPinterestId = (pin.boards as { pinterest_board_id: string | null })?.pinterest_board_id;
        if (!boardPinterestId) {
          orgErrors.push(`Pin ${pin.id}: no Pinterest board ID`);
          continue;
        }

        const isVideo = pin.pin_type === "video" || !!pin.video_url;
        if (!isVideo && !pin.image_url) {
          orgErrors.push(`Pin ${pin.id}: no image or video`);
          continue;
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
              const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
              const videoContentType = videoRes.headers.get("content-type") || "video/mp4";

              await pinterest.uploadVideoToS3(media.upload_url, media.upload_parameters, videoBuffer, videoContentType);

              // Poll media status until registered/succeeded (max 60s)
              let mediaReady = false;
              for (let poll = 0; poll < 12; poll++) {
                await new Promise(r => setTimeout(r, 5000));
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
            if (attempt < 2) {
              await new Promise(r => setTimeout(r, 5000 * (attempt + 1))); // Backoff: 5s, 10s
            } else {
              orgErrors.push(`Pin ${pin.id}: ${postErr instanceof Error ? postErr.message : "unknown"} (3 retries failed)`);
            }
          }
        }

        // If all retries failed, reschedule for 15 minutes from now (next cron run)
        if (!posted) {
          await admin.from("pins").update({
            status: "scheduled",
            scheduled_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
          }).eq("id", pin.id);
        }

        // Respect rate limits between pins
        await new Promise(r => setTimeout(r, 3000));
      }
    } catch (orgErr) {
      orgErrors.push(orgErr instanceof Error ? orgErr.message : "Unknown org error");
    }

    results.push({ org: org.name || org.id, posted: orgPosted, errors: orgErrors });
    totalPosted += orgPosted;
  }

  return NextResponse.json({ posted: totalPosted, results });
}
