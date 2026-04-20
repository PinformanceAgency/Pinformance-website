import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrgIdFromProfile } from "@/lib/auth/effective-org";

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
    .select("org_id, role, active_org_id")
    .eq("id", user.id)
    .single();
  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("start");
  const endDate = searchParams.get("end");

  if (!startDate || !endDate) {
    return NextResponse.json(
      { error: "start and end date params are required" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("calendar_entries")
    .select("*, pin:pins(*)")
    .eq("org_id", getOrgIdFromProfile(profile))
    .gte("scheduled_date", startDate)
    .lte("scheduled_date", endDate)
    .order("scheduled_date", { ascending: true })
    .order("scheduled_time", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ entries: data });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("users")
    .select("org_id, role, active_org_id")
    .eq("id", user.id)
    .single();
  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const body = await request.json();
  const { entry_id, scheduled_date, scheduled_time, slot_index } = body;

  if (!entry_id) {
    return NextResponse.json({ error: "entry_id is required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (scheduled_date !== undefined) updates.scheduled_date = scheduled_date;
  if (scheduled_time !== undefined) updates.scheduled_time = scheduled_time;
  if (slot_index !== undefined) updates.slot_index = slot_index;

  const { data, error } = await supabase
    .from("calendar_entries")
    .update(updates)
    .eq("id", entry_id)
    .eq("org_id", getOrgIdFromProfile(profile))
    .select("*, pin:pins(*)")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }

  // Also update the pin's scheduled_at if date changed
  if (scheduled_date || scheduled_time) {
    const newDate = scheduled_date || data.scheduled_date;
    const newTime = scheduled_time || data.scheduled_time;

    // Fetch org timezone for correct scheduling
    const { data: orgData } = await supabase
      .from("organizations")
      .select("settings")
      .eq("id", getOrgIdFromProfile(profile))
      .single();
    const tz = orgData?.settings?.timezone || "UTC";

    // Convert local time to UTC using org timezone
    const { fromZonedTime } = await import("date-fns-tz");
    const scheduledAt = fromZonedTime(`${newDate}T${newTime}:00`, tz).toISOString();

    const { error: pinError } = await supabase
      .from("pins")
      .update({
        scheduled_at: scheduledAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.pin_id);

    if (pinError) {
      console.error("Failed to update pin scheduled_at:", pinError.message);
    }
  }

  return NextResponse.json({ entry: data });
}
