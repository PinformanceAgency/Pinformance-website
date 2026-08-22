import { NextResponse } from "next/server";
import { countSitemapUrls } from "@/lib/organic/viability";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  const body = (await req.json()) as { domain?: string; time_spent_min?: number };
  if (!body.domain?.trim()) {
    return NextResponse.json({ error: "domain is required" }, { status: 400 });
  }
  try {
    const r = await countSitemapUrls(orgId, body.domain, body.time_spent_min || 1);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
