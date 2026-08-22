import { NextResponse } from "next/server";
import { saveIntake, type IntakePayload } from "@/lib/organic/intake";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  const body = (await req.json()) as IntakePayload;
  try {
    const r = await saveIntake(orgId, body);
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
