import { NextResponse } from "next/server";
import * as P5 from "@/lib/organic/phase5";
import * as M from "@/lib/organic/monthly";

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

/**
 * De schrijfkant van fase 5.
 *
 * `promote_pin` bestond al. Daar zijn de maandcijfers bijgekomen, want die
 * kunnen niet uit de API komen — Pinterest geeft voor organic geen omzet of
 * conversies, dus iemand typt ze of laadt een CSV.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  try {
    const body = (await req.json()) as Record<string, unknown>;
    switch (String(body.action)) {
      case "promote_pin":
        await P5.promoteToAds(String(body.pin_id), body.signal as string, body.funnel_use as string);
        return NextResponse.json({ ok: true });

      case "save_figures":
        return NextResponse.json(await M.saveMonthlyFigures(orgId, body.figures as M.MonthlyFigures));

      // Voorbeeld eerst, importeren daarna. Een CSV die direct wegschrijft is
      // een CSV waarvan niemand weet wat erin stond.
      case "preview_csv":
        return NextResponse.json({ ok: true, ...M.parseMonthlyCsv(String(body.csv ?? "")) });

      case "import_csv": {
        const parsed = M.parseMonthlyCsv(String(body.csv ?? ""));
        if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
        return NextResponse.json({ ok: true, ...(await M.importMonthlyCsv(orgId, parsed.rows)) });
      }

      case "mark_winner":
        return NextResponse.json(await M.markPinWinner(
          orgId, String(body.pin_id), body.is_winner === true,
          body.note == null ? null : String(body.note)
        ));

      case "save_trend":
        return NextResponse.json(await M.saveTrendInput(orgId, {
          month: String(body.month),
          term: String(body.term),
          direction: body.direction == null ? undefined : String(body.direction),
          note: body.note == null ? null : String(body.note),
        }));

      case "delete_trend":
        return NextResponse.json(await M.deleteTrendInput(orgId, String(body.id)));

      default:
        return NextResponse.json({ error: `unknown action "${String(body.action)}"` }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
