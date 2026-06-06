import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrgIdFromProfile } from "@/lib/auth/effective-org";
import { DEFAULT_BOARD_HEALTH } from "@/lib/constants";
import type {
  BoardHealthLabel,
  BoardHealthRow,
  BoardStatus,
  OrgSettings,
} from "@/lib/types";

/**
 * GET /api/boards/health
 *
 * Board-health overview (Task 1) + inactive-board detection (Task 2).
 * Aggregates per-board organic metrics from `pin_analytics` (joined to boards
 * via `pins.board_id` — `board_analytics` is not populated), derives a
 * pin-velocity from the most recent pin, and labels each board using
 * thresholds from `settings.board_health` (falling back to DEFAULT_BOARD_HEALTH).
 *
 * Auth-gated and org-scoped (RLS via the user's session).
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("users")
    .select("org_id, role, active_org_id")
    .eq("id", user.id)
    .single();
  const orgId = getOrgIdFromProfile(profile);
  if (!orgId) return NextResponse.json({ error: "No org" }, { status: 400 });

  // Resolve thresholds: org overrides merged over the defaults.
  const { data: orgRow } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", orgId)
    .single();
  const orgSettings = (orgRow?.settings as OrgSettings) || ({} as OrgSettings);
  const t = { ...DEFAULT_BOARD_HEALTH, ...(orgSettings.board_health || {}) };

  // All non-archived boards for the org.
  const { data: boardsData, error: boardsErr } = await supabase
    .from("boards")
    .select("id, name, category, status, pin_count")
    .eq("org_id", orgId)
    .neq("status", "archived")
    .order("sort_order", { ascending: true });
  if (boardsErr) {
    return NextResponse.json({ error: boardsErr.message }, { status: 500 });
  }
  const boards = boardsData || [];

  // All pins (id → board_id + recency) so we can count pins and find the most
  // recent pin per board. board_id can be null (unassigned) — skip those.
  const { data: pinsData } = await supabase
    .from("pins")
    .select("id, board_id, created_at, posted_at")
    .eq("org_id", orgId)
    .not("board_id", "is", null);
  const pins = pinsData || [];

  // Map each pin to its board, track per-board pin count + latest pin date.
  const pinToBoard = new Map<string, string>();
  const pinCountByBoard = new Map<string, number>();
  const lastPinByBoard = new Map<string, string>();
  for (const p of pins) {
    const boardId = p.board_id as string;
    pinToBoard.set(p.id as string, boardId);
    pinCountByBoard.set(boardId, (pinCountByBoard.get(boardId) || 0) + 1);
    // Use the latest of created_at / posted_at as "pin added" timestamp.
    const stamp =
      (p.posted_at as string) && (p.posted_at as string) > (p.created_at as string)
        ? (p.posted_at as string)
        : (p.created_at as string);
    const prev = lastPinByBoard.get(boardId);
    if (!prev || stamp > prev) lastPinByBoard.set(boardId, stamp);
  }

  // Aggregate analytics over the metric window, mapped to boards via pin_id.
  const windowStart = new Date(
    Date.now() - t.metric_window_days * 24 * 60 * 60 * 1000
  )
    .toISOString()
    .split("T")[0];
  const { data: analyticsData } = await supabase
    .from("pin_analytics")
    .select("pin_id, impressions, saves, pin_clicks, outbound_clicks, date")
    .eq("org_id", orgId)
    .gte("date", windowStart);

  const agg = new Map<
    string,
    { impressions: number; saves: number; clicks: number }
  >();
  for (const row of analyticsData || []) {
    const boardId = pinToBoard.get(row.pin_id as string);
    if (!boardId) continue;
    const cur = agg.get(boardId) || { impressions: 0, saves: 0, clicks: 0 };
    cur.impressions += (row.impressions as number) || 0;
    cur.saves += (row.saves as number) || 0;
    cur.clicks +=
      ((row.pin_clicks as number) || 0) + ((row.outbound_clicks as number) || 0);
    agg.set(boardId, cur);
  }

  const now = Date.now();
  const rows: BoardHealthRow[] = boards.map((b) => {
    const metrics = agg.get(b.id) || { impressions: 0, saves: 0, clicks: 0 };
    const lastPinAt = lastPinByBoard.get(b.id) || null;
    const daysSinceLastPin =
      lastPinAt !== null
        ? Math.floor((now - new Date(lastPinAt).getTime()) / (24 * 60 * 60 * 1000))
        : null;

    const engagementRate =
      metrics.impressions > 0
        ? ((metrics.saves + metrics.clicks) / metrics.impressions) * 100
        : 0;

    // Stale = no new pin within the inactive window (or never any pin).
    const stale =
      daysSinceLastPin === null || daysSinceLastPin > t.inactive_days;
    const performingWell =
      metrics.impressions >= t.top_min_impressions &&
      engagementRate >= t.top_min_engagement_rate;

    // Label decision tree → exactly one of the three spec states.
    let label: BoardHealthLabel;
    if (metrics.impressions === 0) {
      // No measurable performance yet → needs pins / velocity.
      label = "content_refresh";
    } else if (!performingWell) {
      label = "underperforming";
    } else if (stale) {
      label = "content_refresh";
    } else {
      label = "top_performing";
    }

    // Inactive alert (Task 2): only assert when we actually have a last-pin
    // date and it's older than the threshold (avoid false alarms on boards
    // whose pins were all created outside Pinformance).
    const isInactive = daysSinceLastPin !== null && daysSinceLastPin > t.inactive_days;

    // Prefer Pinterest-synced pin_count; fall back to our own pin rows.
    const pinCount =
      typeof b.pin_count === "number" && b.pin_count > 0
        ? (b.pin_count as number)
        : pinCountByBoard.get(b.id) || 0;

    return {
      id: b.id as string,
      name: b.name as string,
      category: (b.category as string) ?? null,
      status: b.status as BoardStatus,
      pin_count: pinCount,
      last_pin_at: lastPinAt,
      days_since_last_pin: daysSinceLastPin,
      impressions: metrics.impressions,
      saves: metrics.saves,
      clicks: metrics.clicks,
      engagement_rate: Math.round(engagementRate * 100) / 100,
      label,
      is_inactive: isInactive,
    };
  });

  return NextResponse.json({
    boards: rows,
    thresholds: t,
    window_start: windowStart,
  });
}
