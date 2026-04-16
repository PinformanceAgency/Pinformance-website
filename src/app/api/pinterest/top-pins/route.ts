import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/encryption";
import { PinterestClient } from "@/lib/pinterest/client";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Get user's org
  const { data: profile } = await supabase
    .from("users")
    .select("org_id")
    .eq("id", user.id)
    .single();
  if (!profile?.org_id) return NextResponse.json({ error: "No org" }, { status: 400 });

  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organizations")
    .select("pinterest_access_token_encrypted, pinterest_token_expires_at, settings")
    .eq("id", profile.org_id)
    .single();
  if (!org?.pinterest_access_token_encrypted) {
    return NextResponse.json({ pins: [] });
  }

  try {
    const token = decrypt(org.pinterest_access_token_encrypted);
    const isTrial = ((org.settings as Record<string, unknown>)?.pinterest_access_tier as string) === "trial";
    const client = new PinterestClient(token, isTrial);

    const days = parseInt(request.nextUrl.searchParams.get("days") || "30");
    const end = new Date().toISOString().split("T")[0];
    const start = new Date(Date.now() - Math.min(days, 89) * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    const result = await client.getTopPins(start, end, "IMPRESSION", undefined, "ORGANIC");

    // Enrich with pin details (title, image) from Pinterest
    const enrichedPins = await Promise.all(
      (result.pins || []).slice(0, 5).map(async (p) => {
        let title = "";
        let imageUrl = "";
        try {
          const pinDetail = await client.getPin(p.pin_id);
          title = pinDetail.title || "";
          imageUrl = pinDetail.media?.images?.["600x"]?.url || "";
        } catch {
          // Pin detail fetch failed, use ID as fallback
          title = `Pin ${p.pin_id.slice(-6)}`;
        }
        return {
          pin_id: p.pin_id,
          title,
          image_url: imageUrl,
          impressions: p.metrics?.IMPRESSION || 0,
          saves: p.metrics?.SAVE || 0,
          clicks: p.metrics?.PIN_CLICK || 0,
          outbound_clicks: p.metrics?.OUTBOUND_CLICK || 0,
        };
      })
    );

    return NextResponse.json({ pins: enrichedPins });
  } catch (err) {
    return NextResponse.json({ pins: [], error: err instanceof Error ? err.message : "Unknown" });
  }
}
