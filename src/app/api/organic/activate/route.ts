import { NextResponse } from "next/server";
import { activateClient } from "@/lib/organic/activate";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { orgId } = (await req.json()) as { orgId?: string };
  if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

  try {
    const result = await activateClient(orgId);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
