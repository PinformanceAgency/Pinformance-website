import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("users")
    .select("org_id")
    .eq("id", user.id)
    .single();
  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("start");
  const endDate = searchParams.get("end");

  let query = supabase
    .from("pin_analytics")
    .select("*")
    .eq("org_id", profile.org_id)
    .order("date", { ascending: true });

  if (startDate) query = query.gte("date", startDate);
  if (endDate) query = query.lte("date", endDate);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Aggregate totals
  const totals = (data || []).reduce(
    (acc, row) => ({
      impressions: acc.impressions + (row.impressions || 0),
      saves: acc.saves + (row.saves || 0),
      pin_clicks: acc.pin_clicks + (row.pin_clicks || 0),
      outbound_clicks: acc.outbound_clicks + (row.outbound_clicks || 0),
      video_views: acc.video_views + (row.video_views || 0),
    }),
    { impressions: 0, saves: 0, pin_clicks: 0, outbound_clicks: 0, video_views: 0 }
  );

  // Group by date for charts
  const byDate: Record<string, typeof totals> = {};
  for (const row of data || []) {
    if (!byDate[row.date]) {
      byDate[row.date] = { impressions: 0, saves: 0, pin_clicks: 0, outbound_clicks: 0, video_views: 0 };
    }
    byDate[row.date].impressions += row.impressions || 0;
    byDate[row.date].saves += row.saves || 0;
    byDate[row.date].pin_clicks += row.pin_clicks || 0;
    byDate[row.date].outbound_clicks += row.outbound_clicks || 0;
    byDate[row.date].video_views += row.video_views || 0;
  }

  const daily = Object.entries(byDate).map(([date, metrics]) => ({
    date,
    ...metrics,
  }));

  return NextResponse.json({ totals, daily, raw_count: data?.length || 0 });
}
