/**
 * Bulk operations on pins for the current org.
 *
 * Body shape: { action, pin_ids?, schedule_opts? }
 *
 * Actions:
 *   - approve              → mark all in pin_ids as status='approved'
 *   - reject               → mark all in pin_ids as status='rejected'
 *   - delete               → hard delete all in pin_ids
 *   - delete_all_rejected  → hard delete every rejected pin for the org
 *   - post_now             → mark approved + scheduled_at = now so the cron picks them up
 *   - schedule             → spread pin_ids over N days with X per day using
 *                            org settings.posting_hours; sets status='scheduled'
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrgIdFromProfile } from "@/lib/auth/effective-org";

type Action =
  | "approve"
  | "reject"
  | "delete"
  | "delete_all_rejected"
  | "post_now"
  | "schedule";

interface RequestBody {
  action: Action;
  pin_ids?: string[];
  schedule_opts?: {
    pins_per_day?: number;
    start_date?: string; // YYYY-MM-DD; defaults to tomorrow
  };
}

const DEFAULT_HOURS = [8, 12, 17, 20];

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

  const body = (await request.json()) as RequestBody;
  const admin = createAdminClient();

  switch (body.action) {
    case "approve": {
      if (!body.pin_ids?.length) {
        return NextResponse.json({ error: "pin_ids required" }, { status: 400 });
      }
      const { error, count } = await admin
        .from("pins")
        .update({ status: "approved", updated_at: new Date().toISOString() }, { count: "exact" })
        .eq("org_id", orgId)
        .in("id", body.pin_ids)
        .in("status", ["generated", "rejected"]);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, affected: count ?? 0 });
    }

    case "reject": {
      if (!body.pin_ids?.length) {
        return NextResponse.json({ error: "pin_ids required" }, { status: 400 });
      }
      const { error, count } = await admin
        .from("pins")
        .update({ status: "rejected", updated_at: new Date().toISOString() }, { count: "exact" })
        .eq("org_id", orgId)
        .in("id", body.pin_ids);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, affected: count ?? 0 });
    }

    case "delete": {
      if (!body.pin_ids?.length) {
        return NextResponse.json({ error: "pin_ids required" }, { status: 400 });
      }
      const { error, count } = await admin
        .from("pins")
        .delete({ count: "exact" })
        .eq("org_id", orgId)
        .in("id", body.pin_ids);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, affected: count ?? 0 });
    }

    case "delete_all_rejected": {
      const { error, count } = await admin
        .from("pins")
        .delete({ count: "exact" })
        .eq("org_id", orgId)
        .eq("status", "rejected");
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, affected: count ?? 0 });
    }

    case "post_now": {
      if (!body.pin_ids?.length) {
        return NextResponse.json({ error: "pin_ids required" }, { status: 400 });
      }
      const now = new Date().toISOString();
      // Mark as approved + due now so the post-pins cron picks them up on its
      // next run (every 15 min). Only touches non-terminal statuses.
      const { error, count } = await admin
        .from("pins")
        .update(
          { status: "approved", scheduled_at: now, updated_at: now },
          { count: "exact" }
        )
        .eq("org_id", orgId)
        .in("id", body.pin_ids)
        .in("status", ["generated", "approved", "scheduled", "rejected"]);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({
        ok: true,
        affected: count ?? 0,
        note: "Pins queued for immediate posting on the next cron run (≤15 min).",
      });
    }

    case "schedule": {
      if (!body.pin_ids?.length) {
        return NextResponse.json({ error: "pin_ids required" }, { status: 400 });
      }
      const perDay = Math.max(1, Math.min(50, body.schedule_opts?.pins_per_day ?? 5));

      // Pull posting_hours from org settings.
      const { data: org } = await admin
        .from("organizations")
        .select("settings")
        .eq("id", orgId)
        .single();
      const settings = (org?.settings as Record<string, unknown>) || {};
      const hoursRaw = settings.posting_hours;
      const hours: number[] = Array.isArray(hoursRaw)
        ? hoursRaw.filter((n) => typeof n === "number" && n >= 0 && n < 24)
        : DEFAULT_HOURS;
      const sortedHours = [...hours].sort((a, b) => a - b);

      // Start tomorrow at the first posting hour (today is likely partial).
      const start = body.schedule_opts?.start_date
        ? new Date(body.schedule_opts.start_date + "T00:00:00Z")
        : (() => {
            const t = new Date();
            t.setUTCDate(t.getUTCDate() + 1);
            t.setUTCHours(0, 0, 0, 0);
            return t;
          })();

      const updates: { id: string; scheduled_at: string }[] = [];
      for (let i = 0; i < body.pin_ids.length; i++) {
        const dayOffset = Math.floor(i / perDay);
        const slot = i % perDay;
        const hour = sortedHours[slot % sortedHours.length];
        const when = new Date(start);
        when.setUTCDate(when.getUTCDate() + dayOffset);
        when.setUTCHours(hour, 0, 0, 0);
        updates.push({ id: body.pin_ids[i], scheduled_at: when.toISOString() });
      }

      // Update each pin individually (Supabase doesn't have a clean bulk
      // "different value per row" update — but the list is small).
      let affected = 0;
      const failures: string[] = [];
      for (const u of updates) {
        const { error } = await admin
          .from("pins")
          .update({
            status: "scheduled",
            scheduled_at: u.scheduled_at,
            updated_at: new Date().toISOString(),
          })
          .eq("org_id", orgId)
          .eq("id", u.id)
          .in("status", ["generated", "approved", "rejected", "scheduled"]);
        if (error) failures.push(u.id);
        else affected++;
      }

      return NextResponse.json({
        ok: true,
        affected,
        failures,
        first_at: updates[0]?.scheduled_at,
        last_at: updates[updates.length - 1]?.scheduled_at,
      });
    }
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
