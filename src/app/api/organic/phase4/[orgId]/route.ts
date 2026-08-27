import { NextResponse } from "next/server";
import * as P4 from "@/lib/organic/phase4";

export const runtime = "nodejs";
// Image generation runs through here. Krea is a queue: four designs are
// polled in parallel with a 180s ceiling each, so 60 would cut off a normal
// run halfway and leave two designs generated and two not.
export const maxDuration = 300;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  const body = (await req.json()) as { action: string } & Record<string, unknown>;
  try {
    const r = (await dispatch(orgId, body)) as Record<string, unknown>;
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

async function dispatch(orgId: string, body: { action: string } & Record<string, unknown>): Promise<unknown> {
  const t = () => Number(body.time_spent_min);
  switch (body.action) {
    case "start_cycle":
      return P4.startCycleForUrl(orgId, String(body.url_id));
    case "candidates":
      return { candidates: await P4.candidateUrls(orgId) };
    case "seasonal":
      return { candidates: await P4.seasonalCandidates(orgId) };
    case "upsert_url":
      return { url_id: await P4.upsertUrl(orgId, body as unknown as P4.UrlInput) };
    case "assign_boards":
      await P4.assignBoardsToUrl(String(body.url_id), body.board_ids as string[]);
      return { ok: true };
    case "assign_keywords":
      await P4.assignKeywordsToUrl(String(body.url_id), body.keyword_ids as string[], String(body.primary_id));
      return { ok: true };
    case "brief":
      return { brief: await P4.generateDesignBrief(orgId, String(body.url_id)) };
    case "advice":
      return { advice: await P4.loadCycleAdvice(orgId, String(body.url_id)) };
    case "deviations":
      return { deviations: await P4.loadCycleDeviations(orgId, String(body.url_id)) };
    // Both draft only. Nothing here publishes or approves — a human still
    // signs off, which is what AI_DRAFT means in the SOP.
    case "generate_copy":
      return await P4.generateCopyForDesign(orgId, String(body.design_id));
    case "generate_image_prompt":
      return await P4.generateImagePromptForDesign(orgId, String(body.design_id));
    // P4.2.4 / P4.2.5 — the images themselves. Long-running: Krea is a
    // queue and four generations are polled in parallel.
    case "generate_designs":
      return await P4.generateDesignImages(orgId, String(body.url_id));
    case "generate_crops":
      return await P4.generateMicroCrops(orgId, String(body.url_id));
    // P4.2.7 / P4.2.10 — QC. A rejection needs a reason; that is enforced
    // in the function, not here, so every caller gets the same rule.
    case "design_qc":
      return await P4.setDesignQc(orgId, String(body.design_id),
        body.status as "APPROVED" | "REJECTED", body.notes as string | null);
    case "copy_qc":
      return await P4.setCopyQc(orgId, String(body.copy_set_id),
        body.status as "APPROVED" | "REJECTED", body.reason as string | null);
    case "cycle_assets":
      return { assets: await P4.loadCycleAssets(orgId, String(body.url_id)) };
    case "validate_copy":
      return P4.validateCopy(body as unknown as P4.CopyDraft);
    case "waterfall":
      return await P4.generateWaterfall(orgId, String(body.url_id), String(body.start_date));
    case "schedule":
      return { rows: await P4.loadWaterfallSchedule(String(body.waterfall_id)) };
    // P4.4.1 — queues the waterfall. The cron posts each pin on its date;
    // see the note on pushWaterfallToPinterest for why this cannot publish.
    case "push":
      return P4.pushWaterfallToPinterest(orgId, {
        waterfallId: body.waterfall_id ? String(body.waterfall_id) : undefined,
        urlId: body.url_id ? String(body.url_id) : undefined,
      });
    // P4.4.2 — publication status, failures, and whether the token is the
    // thing standing in the way.
    case "publish_health": {
      const { loadPublishHealth } = await import("@/lib/organic/publish");
      return { health: await loadPublishHealth(orgId) };
    }
    case "complete_cycle_task": {
      await P4.completeCycleTask(orgId, String(body.cycle), String(body.task_id), t(), body.notes as string | undefined);
      return { ok: true };
    }
    default:
      throw new Error(`unknown action: ${body.action}`);
  }
}
