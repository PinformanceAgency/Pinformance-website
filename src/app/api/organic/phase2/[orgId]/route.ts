/**
 * One POST endpoint for all phase-2 writes, dispatched by `action`.
 * Keeps 8 tiny handlers from spraying separate route files.
 */
import { NextResponse } from "next/server";
import {
  saveSeedKeywords, saveGridRecords, saveHexes,
  saveCompetitors, importCompetitorPinsCsv,
  saveTopPinDesigns, loadTopPinDesigns,
  saveAudienceAffinities, loadAudienceAffinities,
  type TopPinDesign, type AudienceAffinity,
  generateMarketAnalysis, markReviewComplete,
  saveTasteGraph, saveThreeAnglesWorldsMoments,
  saveVelocity, persistFrequency,
  type GridRecord, type HexRecord, type CompetitorInput,
  type TasteGraphPayload, type AnglesWorldsMoments,
  type VelocityPayload,
} from "@/lib/organic/phase2";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  const body = (await req.json()) as { action: string } & Record<string, unknown>;
  try {
    const r = await dispatch(orgId, body);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

async function dispatch(orgId: string, body: { action: string } & Record<string, unknown>) {
  switch (body.action) {
    case "top_pin_designs":
      return await saveTopPinDesigns(
        orgId, body.rows as TopPinDesign[], Number(body.time_spent_min));
    case "load_top_pin_designs":
      return { rows: await loadTopPinDesigns(orgId) };
    case "audience_affinities":
      return await saveAudienceAffinities(
        orgId, body.rows as AudienceAffinity[], Number(body.time_spent_min));
    case "load_audience_affinities":
      return { rows: await loadAudienceAffinities(orgId) };
    case "seed_keywords":
      return saveSeedKeywords(orgId, {
        keywords: (body.keywords as string[]) ?? [],
        time_spent_min: Number(body.time_spent_min),
      });
    case "grid_records":
      return saveGridRecords(orgId, body.records as GridRecord[], Number(body.time_spent_min));
    case "hexes":
      return saveHexes(orgId, body.records as HexRecord[], Number(body.time_spent_min));
    case "competitors":
      return saveCompetitors(orgId, body.list as CompetitorInput[], Number(body.time_spent_min));
    case "import_pins":
      return importCompetitorPinsCsv(
        orgId,
        String(body.profile_url),
        String(body.csv),
        Number(body.time_spent_min ?? 0),
        body.file_name ? String(body.file_name) : null
      );
    case "generate_analysis":
      return generateMarketAnalysis(orgId, Number(body.time_spent_min));
    case "review_complete":
      return markReviewComplete(orgId, Number(body.time_spent_min), body.notes as string | undefined);
    case "taste_graph":
      return saveTasteGraph(orgId, body as unknown as TasteGraphPayload);
    case "three_awm":
      return saveThreeAnglesWorldsMoments(orgId, body as unknown as AnglesWorldsMoments);
    case "velocity":
      return saveVelocity(orgId, body as unknown as VelocityPayload);
    case "frequency":
      return persistFrequency(orgId, Number(body.time_spent_min));
    default:
      throw new Error(`unknown action: ${body.action}`);
  }
}
