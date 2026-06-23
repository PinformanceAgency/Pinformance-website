/**
 * Detect real media-buyer changes by diffing consecutive daily snapshots
 * from pinterest_entity_snapshots. Each (entity_id) is compared day-to-day
 * over the requested window; we emit one event per detected change:
 *
 *  - created   — entity present today, absent yesterday (the cron's view
 *                of "new"; matches Pinterest's created_time within a day)
 *  - status    — ACTIVE/PAUSED/ARCHIVED flip
 *  - budget    — ad-group budget_in_micro_currency changed
 *  - bid       — ad-group bid_in_micro_currency changed
 *  - cap       — campaign daily / lifetime spend cap changed
 *  - renamed   — name changed
 *  - removed   — entity present yesterday, absent today (deleted/hidden)
 *
 * Returns only events with snapshot_date INSIDE [start_date, end_date].
 * The first snapshot ever for an entity is treated as `created` (it has
 * no "yesterday" row).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type EntityType = "campaign" | "ad_group" | "ad";
type ChangeKind =
  | "created"
  | "removed"
  | "status"
  | "budget"
  | "bid"
  | "cap"
  | "renamed";

interface ChangeEvent {
  entity_id: string;
  entity_type: EntityType;
  name: string;
  kind: ChangeKind;
  date: string; // YYYY-MM-DD
  from?: string | number | null;
  to?: string | number | null;
  /** Human-readable summary for the UI row. */
  detail: string;
  status_now: string | null;
}

interface SnapRow {
  entity_id: string;
  entity_type: EntityType;
  snapshot_date: string;
  name: string | null;
  status: string | null;
  daily_spend_cap_dollars: number | null;
  lifetime_spend_cap_dollars: number | null;
  budget_in_micro_currency: number | null;
  bid_in_micro_currency: number | null;
}

function fmtMicros(v: number | null): string {
  if (v == null) return "—";
  return (v / 1_000_000).toFixed(2);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "agency_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    org_id?: string;
    start_date?: string;
    end_date?: string;
  };
  if (!body.org_id) {
    return NextResponse.json({ error: "org_id required" }, { status: 400 });
  }
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!body.start_date || !body.end_date || !dateRe.test(body.start_date) || !dateRe.test(body.end_date)) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }

  const admin = createAdminClient();

  // We need one extra day BEFORE start_date so the first day inside the
  // window has a "yesterday" to diff against.
  const before = new Date(`${body.start_date}T00:00:00Z`);
  before.setUTCDate(before.getUTCDate() - 1);
  const queryStart = before.toISOString().slice(0, 10);

  const { data: snaps, error } = await admin
    .from("pinterest_entity_snapshots")
    .select(
      "entity_id, entity_type, snapshot_date, name, status, daily_spend_cap_dollars, lifetime_spend_cap_dollars, budget_in_micro_currency, bid_in_micro_currency"
    )
    .eq("org_id", body.org_id)
    .gte("snapshot_date", queryStart)
    .lte("snapshot_date", body.end_date)
    .order("entity_id", { ascending: true })
    .order("snapshot_date", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (snaps || []) as SnapRow[];

  // Group rows by entity_id while preserving date order (the query already
  // sorts by entity_id then snapshot_date).
  const byEntity = new Map<string, SnapRow[]>();
  for (const r of rows) {
    const arr = byEntity.get(r.entity_id);
    if (arr) arr.push(r);
    else byEntity.set(r.entity_id, [r]);
  }

  const events: ChangeEvent[] = [];

  for (const [entityId, hist] of byEntity) {
    // 1) Build a day-set so we can detect removals (present yesterday,
    //    absent today). hist already has one row per snapshot day; if a
    //    day is missing in the middle the entity was deleted (or the cron
    //    didn't run — we treat both the same way for the UI).
    const byDate = new Map<string, SnapRow>();
    for (const r of hist) byDate.set(r.snapshot_date, r);

    // Walk every day in [queryStart, end_date], looking at (prev, today).
    const allDates: string[] = [];
    {
      const start = new Date(queryStart + "T00:00:00Z");
      const end = new Date(body.end_date + "T00:00:00Z");
      for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
        allDates.push(d.toISOString().slice(0, 10));
      }
    }

    let prev: SnapRow | null = null;
    let firstSeen = false;
    for (const date of allDates) {
      const today = byDate.get(date) || null;
      const inWindow = date >= body.start_date! && date <= body.end_date!;

      if (today && !prev) {
        // First appearance of this entity. Treat as `created`, but only
        // emit if it's INSIDE the requested window.
        if (firstSeen) {
          // Re-appearance after a gap — flag as created too (entity came
          // back; rare but possible if a cron run missed a day).
          if (inWindow) {
            events.push({
              entity_id: entityId,
              entity_type: today.entity_type,
              name: today.name || "(unnamed)",
              kind: "created",
              date,
              detail: "Re-appeared",
              status_now: today.status,
            });
          }
        } else if (inWindow) {
          events.push({
            entity_id: entityId,
            entity_type: today.entity_type,
            name: today.name || "(unnamed)",
            kind: "created",
            date,
            detail: "Newly created",
            status_now: today.status,
          });
        }
        firstSeen = true;
      } else if (today && prev) {
        // Compare prev → today.
        if (inWindow) {
          if (prev.status !== today.status) {
            events.push({
              entity_id: entityId,
              entity_type: today.entity_type,
              name: today.name || prev.name || "(unnamed)",
              kind: "status",
              date,
              from: prev.status,
              to: today.status,
              detail: `${prev.status ?? "?"} → ${today.status ?? "?"}`,
              status_now: today.status,
            });
          }
          if (today.entity_type === "ad_group") {
            if (prev.budget_in_micro_currency !== today.budget_in_micro_currency) {
              events.push({
                entity_id: entityId,
                entity_type: "ad_group",
                name: today.name || prev.name || "(unnamed)",
                kind: "budget",
                date,
                from: prev.budget_in_micro_currency,
                to: today.budget_in_micro_currency,
                detail: `Budget ${fmtMicros(prev.budget_in_micro_currency)} → ${fmtMicros(today.budget_in_micro_currency)}`,
                status_now: today.status,
              });
            }
            if (prev.bid_in_micro_currency !== today.bid_in_micro_currency) {
              events.push({
                entity_id: entityId,
                entity_type: "ad_group",
                name: today.name || prev.name || "(unnamed)",
                kind: "bid",
                date,
                from: prev.bid_in_micro_currency,
                to: today.bid_in_micro_currency,
                detail: `Bid ${fmtMicros(prev.bid_in_micro_currency)} → ${fmtMicros(today.bid_in_micro_currency)}`,
                status_now: today.status,
              });
            }
          }
          if (today.entity_type === "campaign") {
            if (prev.daily_spend_cap_dollars !== today.daily_spend_cap_dollars) {
              events.push({
                entity_id: entityId,
                entity_type: "campaign",
                name: today.name || prev.name || "(unnamed)",
                kind: "cap",
                date,
                from: prev.daily_spend_cap_dollars,
                to: today.daily_spend_cap_dollars,
                detail: `Daily cap ${prev.daily_spend_cap_dollars ?? "—"} → ${today.daily_spend_cap_dollars ?? "—"}`,
                status_now: today.status,
              });
            }
            if (prev.lifetime_spend_cap_dollars !== today.lifetime_spend_cap_dollars) {
              events.push({
                entity_id: entityId,
                entity_type: "campaign",
                name: today.name || prev.name || "(unnamed)",
                kind: "cap",
                date,
                from: prev.lifetime_spend_cap_dollars,
                to: today.lifetime_spend_cap_dollars,
                detail: `Lifetime cap ${prev.lifetime_spend_cap_dollars ?? "—"} → ${today.lifetime_spend_cap_dollars ?? "—"}`,
                status_now: today.status,
              });
            }
          }
          if ((prev.name || "") !== (today.name || "")) {
            events.push({
              entity_id: entityId,
              entity_type: today.entity_type,
              name: today.name || "(unnamed)",
              kind: "renamed",
              date,
              from: prev.name,
              to: today.name,
              detail: `"${prev.name ?? ""}" → "${today.name ?? ""}"`,
              status_now: today.status,
            });
          }
        }
      } else if (!today && prev && firstSeen) {
        if (inWindow) {
          events.push({
            entity_id: entityId,
            entity_type: prev.entity_type,
            name: prev.name || "(unnamed)",
            kind: "removed",
            date,
            detail: "Removed from ad account",
            status_now: null,
          });
        }
        // After a removal we stop tracking until/unless the entity reappears,
        // which the early branch handles.
      }

      if (today) prev = today;
    }
  }

  // Sort newest first; tiebreak by entity_id for stable rendering.
  events.sort((a, b) => (a.date === b.date ? a.entity_id.localeCompare(b.entity_id) : a.date < b.date ? 1 : -1));

  const totals = {
    total: events.length,
    by_kind: {
      created: events.filter((e) => e.kind === "created").length,
      removed: events.filter((e) => e.kind === "removed").length,
      status: events.filter((e) => e.kind === "status").length,
      budget: events.filter((e) => e.kind === "budget").length,
      bid: events.filter((e) => e.kind === "bid").length,
      cap: events.filter((e) => e.kind === "cap").length,
      renamed: events.filter((e) => e.kind === "renamed").length,
    },
    by_type: {
      campaign: events.filter((e) => e.entity_type === "campaign").length,
      ad_group: events.filter((e) => e.entity_type === "ad_group").length,
      ad: events.filter((e) => e.entity_type === "ad").length,
    },
    // For the "Killed creatives" stat the UI wants — ads that flipped to a
    // non-active status in the window.
    ads_killed: events.filter(
      (e) =>
        e.entity_type === "ad" &&
        e.kind === "status" &&
        (e.to === "PAUSED" || e.to === "ARCHIVED")
    ).length,
    // Campaigns paused/archived in the window.
    campaigns_off: events.filter(
      (e) =>
        e.entity_type === "campaign" &&
        e.kind === "status" &&
        (e.to === "PAUSED" || e.to === "ARCHIVED")
    ).length,
  };

  // Detect whether snapshots even exist for this window — if not we tell the
  // UI to render an empty-state explaining that snapshotting starts now.
  const earliest = rows[0]?.snapshot_date ?? null;

  return NextResponse.json({
    ok: true,
    start_date: body.start_date,
    end_date: body.end_date,
    earliest_snapshot: earliest,
    totals,
    events,
  });
}
