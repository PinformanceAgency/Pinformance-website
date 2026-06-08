import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrgIdFromProfile } from "@/lib/auth/effective-org";
import { DEFAULT_BOARD_HEALTH, BOARD_RULES } from "@/lib/constants";
import type {
  BoardHealthLabel,
  BoardHealthRow,
  BoardStatus,
  OrgSettings,
} from "@/lib/types";

/**
 * GET /api/boards/health
 *
 * Board-health overview (Task 1) + inactive-board detection (Task 2) +
 * composite health score.
 *
 * Aggregates per-board organic metrics from `pin_analytics` (joined to boards
 * via `pins.board_id` — `board_analytics` is not populated), reads the latest
 * pin date (`boards.last_pin_added_at`, refreshed from Pinterest during sync,
 * falling back to Pinformance-created pins), and combines every available
 * signal — pin velocity, pin volume, impressions, and saves/engagement — into
 * a 0–100 score. Components with no data are dropped and the remaining weights
 * renormalised, so the score always reflects "all the data we have".
 *
 * Thresholds come from `settings.board_health` (fallback DEFAULT_BOARD_HEALTH).
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

  // All non-archived boards. Prefer the Pinterest-sourced last_pin_added_at;
  // fall back gracefully if migration 019 hasn't been applied yet.
  type BoardRow = {
    id: string;
    name: string;
    category: string | null;
    status: string;
    pin_count: number | null;
    last_pin_added_at?: string | null;
  };
  const baseCols = "id, name, category, status, pin_count";
  let boards: BoardRow[] = [];
  {
    const res = await supabase
      .from("boards")
      .select(`${baseCols}, last_pin_added_at`)
      .eq("org_id", orgId)
      .neq("status", "archived")
      .order("sort_order", { ascending: true });
    if (res.error) {
      const fallback = await supabase
        .from("boards")
        .select(baseCols)
        .eq("org_id", orgId)
        .neq("status", "archived")
        .order("sort_order", { ascending: true });
      if (fallback.error) {
        return NextResponse.json({ error: fallback.error.message }, { status: 500 });
      }
      boards = (fallback.data as unknown as BoardRow[]) || [];
    } else {
      boards = (res.data as unknown as BoardRow[]) || [];
    }
  }

  // All pins (id → board_id + recency) so we can count pins and find the most
  // recent Pinformance pin per board (fallback for last_pin_added_at).
  const { data: pinsData } = await supabase
    .from("pins")
    .select("id, board_id, created_at, posted_at")
    .eq("org_id", orgId)
    .not("board_id", "is", null);
  const pins = pinsData || [];

  const pinToBoard = new Map<string, string>();
  const pinCountByBoard = new Map<string, number>();
  const lastPinByBoard = new Map<string, string>();
  for (const p of pins) {
    const boardId = p.board_id as string;
    pinToBoard.set(p.id as string, boardId);
    pinCountByBoard.set(boardId, (pinCountByBoard.get(boardId) || 0) + 1);
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
    { impressions: number; saves: number; clicks: number; pinClicks: number }
  >();
  for (const row of analyticsData || []) {
    const boardId = pinToBoard.get(row.pin_id as string);
    if (!boardId) continue;
    const cur = agg.get(boardId) || { impressions: 0, saves: 0, clicks: 0, pinClicks: 0 };
    cur.impressions += (row.impressions as number) || 0;
    cur.saves += (row.saves as number) || 0;
    cur.pinClicks += (row.pin_clicks as number) || 0;
    cur.clicks +=
      ((row.pin_clicks as number) || 0) + ((row.outbound_clicks as number) || 0);
    agg.set(boardId, cur);
  }

  const clamp = (n: number) => Math.max(0, Math.min(100, n));
  // Sub-score weights (renormalised over whichever components have data).
  const WEIGHTS = { velocity: 0.4, volume: 0.2, performance: 0.25, engagement: 0.15 };
  const pinTarget = BOARD_RULES.TARGET_PINS_PER_BOARD || 40;

  const now = Date.now();
  const rows: BoardHealthRow[] = boards.map((b) => {
    const metrics = agg.get(b.id) || { impressions: 0, saves: 0, clicks: 0, pinClicks: 0 };
    // Latest pin: Pinterest-sourced date wins, else our most recent pin.
    const lastPinAt = b.last_pin_added_at || lastPinByBoard.get(b.id) || null;
    const daysSinceLastPin =
      lastPinAt !== null
        ? Math.floor((now - new Date(lastPinAt).getTime()) / (24 * 60 * 60 * 1000))
        : null;

    const engagementRate =
      metrics.impressions > 0
        ? ((metrics.saves + metrics.clicks) / metrics.impressions) * 100
        : 0;

    const pinCount =
      typeof b.pin_count === "number" && b.pin_count > 0
        ? (b.pin_count as number)
        : pinCountByBoard.get(b.id) || 0;

    const hasKpi = metrics.impressions > 0;

    // ── Sub-scores (0–100), null = no data for that signal ──
    // Velocity: 100 at 0 days, 50 at inactive_days, 0 at 2× inactive_days.
    const velocity =
      daysSinceLastPin === null
        ? null
        : clamp(100 * (1 - daysSinceLastPin / (t.inactive_days * 2)));
    // Volume: pins toward the per-board target.
    const volume = pinCount > 0 ? clamp((100 * pinCount) / pinTarget) : null;
    // Performance: impressions toward the "top performing" threshold.
    const performance = hasKpi
      ? clamp((100 * metrics.impressions) / Math.max(1, t.top_min_impressions))
      : null;
    // Engagement: engagement-rate toward the "top performing" threshold.
    const engagement = hasKpi
      ? clamp((100 * engagementRate) / Math.max(0.01, t.top_min_engagement_rate))
      : null;

    const parts = { velocity, volume, performance, engagement };

    // Weighted average over present components (renormalised).
    let weighted = 0;
    let weightSum = 0;
    (Object.keys(WEIGHTS) as Array<keyof typeof WEIGHTS>).forEach((k) => {
      const v = parts[k];
      if (v !== null) {
        weighted += v * WEIGHTS[k];
        weightSum += WEIGHTS[k];
      }
    });
    const healthScore = weightSum > 0 ? Math.round(weighted / weightSum) : 0;

    const isInactive =
      daysSinceLastPin !== null && daysSinceLastPin > t.inactive_days;
    // Don't crown a board "top performing" without a freshness or KPI signal.
    const hasSignal = daysSinceLastPin !== null || hasKpi;

    let label: BoardHealthLabel;
    if (healthScore >= 70 && !isInactive && hasSignal) {
      label = "top_performing";
    } else if (healthScore >= 40) {
      label = "content_refresh";
    } else {
      label = "underperforming";
    }

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
      pin_clicks: metrics.pinClicks,
      engagement_rate: Math.round(engagementRate * 100) / 100,
      health_score: healthScore,
      score_parts: parts,
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
