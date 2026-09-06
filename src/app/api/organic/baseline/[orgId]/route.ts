/**
 * P1.2.13 — fetch what Pinterest can answer for the three-month baseline.
 *
 * Read-only: it proposes numbers into a form somebody still has to accept
 * and save. Nothing here writes to baseline_kpis; that path runs through the
 * task's own completion, unchanged.
 */
import { NextResponse } from "next/server";
import { pullBaselineSuggestion } from "@/lib/organic/baseline-pull";
import { PinterestAuthError } from "@/lib/pinterest/for-org";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  try {
    return NextResponse.json({ ok: true, ...(await pullBaselineSuggestion(orgId)) });
  } catch (e) {
    if (e instanceof PinterestAuthError) {
      // A dead token needs a person and never fixes itself — say that
      // rather than reporting it as a failed lookup.
      return NextResponse.json(
        { error: `Pinterest is not connected for this store (${e.reason}). Reconnect it, then try again.` },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
