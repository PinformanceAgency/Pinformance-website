/**
 * One POST endpoint for all phase-3 writes, dispatched by `action`.
 */
import { NextResponse } from "next/server";
import {
  saveSearchBarSuggestions, saveBubbles, saveInterestPicks,
  harvestCompetitorAnnotations, markCloaked,
  runDedupeAndComplete, generateWorkList, submitPinClicksResults,
  setParentInterests, setGenericKeywords, formTopicClusters,
  classifySeasonal, computePublishingWindows, markClientAlignment,
  saveDisplayName, saveBio,
  finaliseBoardList, checkCoverage, saveBoardDescriptions,
  generateCreationSchedule, createBoardsToday,
  proposeSeedPins, reviewSeedPlan, loadSeedingState, flipBoardsPublicAtTen,
  searchInterests, loadBoardListContext,
  draftDisplayName, draftBio, draftBoardDescription,
  approveAndSaveDisplayName, approveAndSaveBio, approveAndSaveBoardDescription,
  type BoardInput, type SeasonalClassification, type DescriptionRow,
} from "@/lib/organic/phase3";
import { completeTaskByDefinition, recomputeAfter } from "@/lib/organic/complete";

export const runtime = "nodejs";
// 300, not 60: P3.3.6 reads the whole account and has a model judge every pin
// against every new board, which on a store with twenty boards is a couple of
// minutes. Every other action here finishes in seconds either way.
export const maxDuration = 300;

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
  const t = () => Number(body.time_spent_min);
  switch (body.action) {
    case "search_bar":
      return saveSearchBarSuggestions(orgId, String(body.seed), body.suggestions as string[], t());
    case "bubbles":
      return saveBubbles(orgId, body.terms as string[], t());
    case "interest_search":
      return { results: await searchInterests(String(body.query), 30) };
    case "interest_picks":
      return saveInterestPicks(orgId, body.terms as string[], t());
    case "competitor_annotations":
      return harvestCompetitorAnnotations(orgId, t());
    case "cloaked":
      return markCloaked(orgId, !!body.cloaked, String(body.notes ?? ""), t());
    case "dedupe":
      return runDedupeAndComplete(orgId, t());
    case "work_list":
      return generateWorkList(orgId, t());
    case "pinclicks_submit":
      return submitPinClicksResults(orgId,
        body.results as { term: string; volume?: number | null; taxonomy_path?: string | null; not_found?: boolean }[],
        (body.extra_finds as string[]) ?? [], t());
    case "parent_interests":
      return setParentInterests(orgId, body.terms as string[], t());
    case "generic_test":
      return setGenericKeywords(orgId, body.decisions as { term: string; applies_to_all: boolean }[], t());
    case "clusters":
      return formTopicClusters(orgId, body.clusters as Parameters<typeof formTopicClusters>[1], t());
    case "seasonal":
      return classifySeasonal(orgId, body.list as SeasonalClassification[], t());
    case "windows":
      return computePublishingWindows(orgId, t());
    case "alignment":
      return markClientAlignment(orgId, (body.forbidden_terms as string[]) ?? [], t(), body.notes as string | undefined);
    case "display_name":
      return saveDisplayName(orgId, String(body.display_name), t());
    case "bio":
      return saveBio(orgId, String(body.bio), t());
    case "profile_media_done": {
      await completeTaskByDefinition({ orgId, taskId: "P3.2.3", timeSpentMin: t(),
        notes: String(body.notes ?? "Profile photo and cover checked on desktop + mobile.") });
      return { recomputed: await recomputeAfter(orgId) };
    }
    case "board_list_context":
      // P2.3.3 angles/worlds/moments + Steal List + Board Gap + clusters,
      // all on screen so P3.3.1 needs no manual lookup.
      return { context: await loadBoardListContext(orgId) };
    case "board_list":
      return finaliseBoardList(orgId, body.boards as BoardInput[], t());
    case "coverage":
      return checkCoverage(orgId, t());
    case "descriptions":
      return saveBoardDescriptions(orgId, body.rows as DescriptionRow[], t());
    case "schedule":
      return generateCreationSchedule(orgId, t());
    case "create_boards":
      return createBoardsToday(orgId, t(), { dryRun: !!body.dry_run });
    case "select_seeds":
      return proposeSeedPins(orgId, t());
    // P3.3.6 — the person's half of the proposal.
    case "approve_seeds":
      return reviewSeedPlan(orgId, { kind: "approve", boardId: (body.board_id as string | null) ?? null });
    case "remove_seed":
      return reviewSeedPlan(orgId, { kind: "remove", planId: String(body.plan_id) });
    // P3.3.6 / P3.3.7 panels. Saving happens in /api/cron/organic-seed-boards
    // at SEEDS_PER_DAY a day; there is deliberately no "seed now" button,
    // because a button is how ten a day becomes forty in one afternoon.
    case "seed_state":
      return loadSeedingState(orgId);
    case "draft_display_name":
      return draftDisplayName(orgId, String(body.brand_name));
    case "approve_display_name":
      return approveAndSaveDisplayName(orgId, String(body.draft_id), String(body.approved_text), t());
    case "draft_bio":
      return draftBio(orgId, String(body.brand_name));
    case "approve_bio":
      return approveAndSaveBio(orgId, String(body.draft_id), String(body.approved_text), t());
    case "draft_board_description":
      return draftBoardDescription(orgId, String(body.board_id));
    case "approve_board_description":
      await approveAndSaveBoardDescription(orgId, String(body.draft_id), String(body.board_name), String(body.approved_text));
      return { ok: true };
    case "flip_public":
      return flipBoardsPublicAtTen(orgId, t());
    default:
      throw new Error(`unknown action: ${body.action}`);
  }
}
