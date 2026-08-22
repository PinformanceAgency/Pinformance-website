import { NextResponse } from "next/server";
import { reviewMarketItem } from "@/lib/organic/phase2";

export const runtime = "nodejs";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const { itemId } = await params;
  const body = (await req.json()) as { status: "APPROVED" | "REJECTED"; reject_reason?: string };
  try {
    const r = await reviewMarketItem(itemId, body.status, body.reject_reason);
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
