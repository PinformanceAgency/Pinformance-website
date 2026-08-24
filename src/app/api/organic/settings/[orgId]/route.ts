import { NextResponse } from "next/server";
import { loadStoreSettings, updateStoreSettings } from "@/lib/organic/workspace";

export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  try {
    const settings = await loadStoreSettings(orgId);
    if (!settings) return NextResponse.json({ error: "Store not activated" }, { status: 404 });
    return NextResponse.json({ ok: true, settings });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  try {
    const body = await req.json();
    const settings = await updateStoreSettings(orgId, body ?? {});
    if (!settings) return NextResponse.json({ error: "Store not activated" }, { status: 404 });
    return NextResponse.json({ ok: true, settings });
  } catch (e) {
    // CHECK constraints and enum casts surface here — the message is the
    // useful part, so it goes to the client rather than a generic 500.
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
