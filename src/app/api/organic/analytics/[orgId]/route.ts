import { NextResponse } from "next/server";
import * as P5 from "@/lib/organic/phase5";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  const url = new URL(req.url);
  const to = url.searchParams.get("to") ?? new Date().toISOString().slice(0, 10);
  const from = url.searchParams.get("from") ?? new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  try {
    const [pinterest, baseline, reason, keyword, breadth, ads, setup] = await Promise.all([
      P5.fetchOrganicAnalytics(orgId, from, to),
      P5.loadBaseline(orgId),
      P5.byReason(orgId, from, to),
      P5.byKeyword(orgId, from, to),
      P5.byBoardBreadth(orgId, from, to),
      P5.surfaceAdsCandidates(orgId, from, to, 5),
      P5.loadSetupState(orgId, from, to),
    ]);
    return NextResponse.json({
      ok: true,
      from, to,
      pinterest,
      baseline,
      setup,
      deltas: P5.computeDeltas(baseline, pinterest.totals, setup),
      feedback: { by_reason: reason, by_keyword: keyword, by_board_breadth: breadth },
      ads_candidates: ads,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  const body = (await req.json()) as { action: "promote_pin"; pin_id: string; signal?: string; funnel_use?: string };
  if (body.action !== "promote_pin") return NextResponse.json({ error: "unknown action" }, { status: 400 });
  await P5.promoteToAds(body.pin_id, body.signal, body.funnel_use);
  return NextResponse.json({ ok: true });
}
