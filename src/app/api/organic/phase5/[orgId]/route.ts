/**
 * Phase 5's write surface.
 *
 * Phase 5 had no route at all: everything it produced was read-only or
 * lived in a note field, which is why thirteen monthly tasks rendered as
 * paperwork. These are the two decisions phase 5 actually records — which
 * templates are proven, and the forward-looking paragraph — plus the reads
 * their controls need.
 */
import { NextResponse } from "next/server";
import {
  loadTemplateStandings, setTemplateProven, draftTrendForecast,
} from "@/lib/organic/phase5";

export const runtime = "nodejs";
// The forecast is a model call with a validator retry behind it.
export const maxDuration = 120;

export async function POST(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  try {
    const body = await req.json();
    switch (body?.action) {
      case "template_standings":
        return NextResponse.json({ ok: true, templates: await loadTemplateStandings(orgId) });
      case "set_template_proven":
        return NextResponse.json(
          await setTemplateProven(orgId, String(body.template_id), !!body.proven));
      case "draft_forecast":
        return NextResponse.json({ ok: true, ...(await draftTrendForecast(orgId)) } as const);
      // P5.2.2 — the attribution, with the patterns already stated. Defaults
      // to last calendar month, which is the reporting window.
      case "attribution": {
        const { loadAttribution } = await import("@/lib/organic/phase5");
        const now = new Date();
        const defFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
          .toISOString().slice(0, 10);
        const defTo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0))
          .toISOString().slice(0, 10);
        return NextResponse.json({
          ok: true,
          attribution: await loadAttribution(
            orgId,
            body.from ? String(body.from) : defFrom,
            body.to ? String(body.to) : defTo
          ),
        });
      }
      default:
        return NextResponse.json({ error: `unknown action: ${body?.action}` }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
