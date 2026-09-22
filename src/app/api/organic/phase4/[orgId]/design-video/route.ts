/**
 * POST /api/organic/phase4/<orgId>/design-video
 *
 * De mp4 voor de CLICK-pin, in twee stappen — en de twee stappen zijn de hele
 * reden dat deze route bestaat naast `design-image`.
 *
 * Een videobestand is 5 tot 120 MB en Vercel kapt de body van een serverless
 * function af op 4,5 MB. Een mp4 kán dus niet door een API-route heen; dat is
 * geen instelling maar het platform. Dus:
 *
 *   step "sign"      → de server tekent twee plekken in de pin-images bucket
 *                      (de video en het posterframe) en geeft er signed upload
 *                      URLs voor terug. Hij ziet het bestand niet.
 *   de browser       → zet beide bestanden rechtstreeks in de bucket, en haalt
 *                      het posterframe zelf uit de video met een canvas.
 *   step "register"  → één kleine JSON-call die het design bijwerkt. De maat
 *                      en het bestaan worden dan uit de bucket gelezen, niet
 *                      uit wat de browser beweert.
 *
 * Waarom een signed URL en niet gewoon de anon-key in de browser: de
 * organic-app staat achter geen login (zie middleware.ts). Schrijfrecht voor
 * anon op de bucket zou betekenen dat iedereen die de hostname kent erin kan
 * schrijven. Een signed upload URL is één pad, twee uur, en verder niets.
 */
import { NextResponse } from "next/server";
import { saveDesignVideo, signDesignVideoUpload } from "@/lib/organic/phase4";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const designId = String(body.design_id ?? "");
    if (!designId) return NextResponse.json({ error: "design_id is required" }, { status: 400 });

    if (body.step === "sign") {
      const r = await signDesignVideoUpload(orgId, designId, {
        name: String(body.name ?? ""),
        type: String(body.type ?? ""),
        size: Number(body.size ?? 0),
        duration: body.duration == null ? null : Number(body.duration),
        width: body.width == null ? null : Number(body.width),
        height: body.height == null ? null : Number(body.height),
      });
      return NextResponse.json({ ok: true, ...r });
    }

    if (body.step === "register") {
      const r = await saveDesignVideo(orgId, designId, {
        video_path: String(body.video_path ?? ""),
        poster_path: String(body.poster_path ?? ""),
        duration_s: body.duration == null ? null : Number(body.duration),
        width: body.width == null ? null : Number(body.width),
        height: body.height == null ? null : Number(body.height),
      });
      return NextResponse.json(r);
    }

    return NextResponse.json({ error: `Unknown step "${String(body.step)}"` }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 400 }
    );
  }
}
