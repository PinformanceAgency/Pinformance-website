import { NextResponse } from "next/server";
import {
  computeUrlRequirement, proposeExpansion, saveProposals, loadProposals,
  markProposalStatus, markProposalBuiltWithNewUrl, assessViability,
} from "@/lib/organic/expansion";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  try {
    const [requirement, assessment, proposals] = await Promise.all([
      computeUrlRequirement(orgId),
      assessViability(orgId),
      loadProposals(orgId),
    ]);
    return NextResponse.json({ ok: true, requirement, assessment, proposals });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  const body = (await req.json()) as { action: string } & Record<string, unknown>;
  try {
    if (body.action === "generate_and_save") {
      const target = Number(body.target_count ?? 10);
      const proposals = await proposeExpansion(orgId, target);
      const ids = await saveProposals(orgId, proposals);
      return NextResponse.json({ ok: true, proposals, ids });
    }
    if (body.action === "mark_status") {
      await markProposalStatus(
        String(body.id),
        body.status as "PROPOSED"|"SENT_TO_CLIENT"|"BUILDING"|"BUILT"|"REJECTED",
        body.built_url as string | undefined,
        body.built_url_id as string | undefined,
      );
      return NextResponse.json({ ok: true });
    }
    if (body.action === "mark_built_with_url") {
      // Convenience: mark proposal BUILT + auto-create organic.urls row so
      // the new page joins the URL pool immediately.
      const urlId = await markProposalBuiltWithNewUrl(String(body.id), String(body.built_url));
      return NextResponse.json({ ok: true, url_id: urlId });
    }
    return NextResponse.json({ error: `unknown action: ${body.action}` }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
