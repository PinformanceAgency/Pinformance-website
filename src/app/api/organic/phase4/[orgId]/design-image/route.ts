/**
 * POST /api/organic/phase4/<orgId>/design-image
 *
 * One design image, uploaded by the person who made it. Multipart rather than
 * JSON, which is why it is a route of its own: the phase-4 endpoint takes a
 * JSON action and a file does not fit in one without base64, and a 4 MB
 * design becomes 5.3 MB of string on the way in.
 *
 * See saveDesignImage() for why this exists at all — until 10-09-2026 the
 * only way an image could reach a design was Krea generation, which made the
 * whole method conditional on a funded balance and on the AI route being the
 * right one for that account.
 */
import { NextRequest, NextResponse } from "next/server";
import { saveDesignImage } from "@/lib/organic/phase4";

export const maxDuration = 60;

/** Pinterest's own limit for an image is 20 MB; anything past that would be
 *  rejected at publish time, so it is refused at the door where the message
 *  can still say why. */
const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  try {
    const form = await req.formData();
    const designId = String(form.get("design_id") ?? "");
    const file = form.get("file");
    if (!designId) return NextResponse.json({ error: "design_id is required" }, { status: 400 });
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file received" }, { status: 400 });
    }
    if (!ALLOWED.has(file.type)) {
      return NextResponse.json(
        { error: `${file.type || "that file"} is not an image Pinterest accepts — use JPEG, PNG or WebP` },
        { status: 400 }
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `${(file.size / 1024 / 1024).toFixed(1)} MB is over the 20 MB Pinterest allows` },
        { status: 400 }
      );
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const r = await saveDesignImage(orgId, designId, { bytes, contentType: file.type });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 400 }
    );
  }
}
