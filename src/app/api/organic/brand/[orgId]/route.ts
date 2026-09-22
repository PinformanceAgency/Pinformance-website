/**
 * D — het merk van een store: lezen, vastleggen en bestanden aanleveren.
 *
 * De bestanden gaan niet door deze route heen. Een merkboek-PDF is zo tien
 * megabyte en Vercel kapt een request body af op 4,5 MB, dus tekent `sign` een
 * plek in de bucket, zet de browser het bestand er rechtstreeks neer, en komt
 * alleen de registratie hier langs. Zelfde patroon als de video-upload.
 */
import { NextResponse } from "next/server";
import {
  loadBrandAssets, saveBrandAssets, signBrandAssetUpload, registerGuidelines,
  type BrandAssetKind, type BrandAssetsInput,
} from "@/lib/organic/brand";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  try {
    return NextResponse.json({ ok: true, brand: await loadBrandAssets(orgId) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  try {
    const body = (await req.json()) as Record<string, unknown>;
    switch (String(body.action)) {
      case "save":
        return NextResponse.json(
          await saveBrandAssets(orgId, body.brand as BrandAssetsInput)
        );

      case "sign":
        return NextResponse.json({
          ok: true,
          ...(await signBrandAssetUpload(orgId, String(body.kind) as BrandAssetKind, {
            name: String(body.name ?? ""),
            type: String(body.type ?? ""),
            size: Number(body.size ?? 0),
          })),
        });

      case "register_guidelines":
        return NextResponse.json(await registerGuidelines(orgId, String(body.path ?? "")));

      default:
        return NextResponse.json({ error: `unknown action "${String(body.action)}"` }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
