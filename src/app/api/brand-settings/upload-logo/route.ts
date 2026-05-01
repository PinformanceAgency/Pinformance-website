import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrgIdFromProfile } from "@/lib/auth/effective-org";

/**
 * POST /api/brand-settings/upload-logo — Upload a logo image for the active org
 * Multipart form with field "file". Returns { url } on success.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("users")
    .select("org_id, role, active_org_id")
    .eq("id", user.id)
    .single();
  const orgId = getOrgIdFromProfile(profile);
  if (!orgId) return NextResponse.json({ error: "No org" }, { status: 400 });

  const form = await request.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "file required" }, { status: 400 });
  if (file.size > 5_000_000) return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 });

  const allowed = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];
  if (!allowed.includes(file.type)) {
    return NextResponse.json({ error: `Unsupported type: ${file.type}` }, { status: 400 });
  }

  const ext = file.type === "image/png" ? "png" : file.type === "image/svg+xml" ? "svg" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${orgId}/logos/logo-${Date.now()}.${ext}`;

  const admin = createAdminClient();
  const buf = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await admin.storage
    .from("pin-images")
    .upload(path, buf, { contentType: file.type, upsert: true });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data: publicData } = admin.storage.from("pin-images").getPublicUrl(path);
  const url = publicData.publicUrl;

  return NextResponse.json({ url, path });
}
