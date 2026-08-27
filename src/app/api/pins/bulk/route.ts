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
 *                            org settings.posting_hours; sets status='scheduled'.
 *                            Refuses X above what the store can actually
 *                            publish per day (max_pins_per_day, and the
 *                            min_post_interval_minutes that often binds
 *                            first) — see the check in that case.
 */
import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrgIdFromProfile } from "@/lib/auth/effective-org";

// The handler itself only does DB updates now — the post_now branch fires
// the cron in the background via `after()`, so 60s is plenty.
export const maxDuration = 60;

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
  try {
    return await handle(request);
  } catch (e) {
    // Any thrown error would otherwise bubble to Next.js and produce an HTML
    // error page — which the client can't parse as JSON. Force a JSON body.
    const msg = e instanceof Error ? e.message : "Internal error";
    console.error("[pins/bulk] unhandled error:", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function handle(request: NextRequest) {
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
      // Mark as approved + due now so the post-pins cron picks them up.
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

      // Kick the post-pins cron in the BACKGROUND via `after()` so we don't
      // block the response. The cron runs as its own Vercel invocation with
      // its own timeout budget; any leftover pins stay in status='approved'
      // with scheduled_at=now so the 15-min cron sweeps them up.
      const cronSecret = process.env.CRON_SECRET;
      let triggerNote: string;
      if (cronSecret) {
        const origin = request.nextUrl.origin;
        after(async () => {
          try {
            await fetch(
              `${origin}/api/cron/post-pins?force_org=${encodeURIComponent(orgId)}`,
              {
                method: "POST",
                headers: { "x-cron-secret": cronSecret },
                signal: AbortSignal.timeout(280_000),
              }
            );
          } catch (e) {
            console.error("[pins/bulk] background cron trigger failed:", e);
          }
        });
        triggerNote = `Posting ${count ?? 0} pin${(count ?? 0) === 1 ? "" : "s"} to Pinterest in the background — refresh in ~30s to see them go live.`;
      } else {
        triggerNote = `Queued ${count ?? 0} pin${(count ?? 0) === 1 ? "" : "s"} for the next cron run (≤15 min).`;
      }

      return NextResponse.json({
        ok: true,
        affected: count ?? 0,
        note: triggerNote,
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

      /**
       * Refuse to plan more per day than the store is allowed to post.
       *
       * This used to accept anything up to 50 and never look at the cap the
       * posting cron enforces. Measured 27-08-2026: three stores were planned
       * at 15 a day against a cap of 5, so each of them grew ten pins of
       * backlog every single day. The pins existed, the dates looked right,
       * and two thirds of them were never going to be posted — which on the
       * pins page is indistinguishable from a broken scheduler.
       *
       * A refusal rather than a silent clamp: quietly planning 5 when 15 was
       * asked for moves the surprise to a fortnight later, when somebody
       * wonders why a third of the month went out.
       *
       * The interval is checked too, and it is the half people forget: 15 a
       * day with 180 minutes between pins still only delivers 8, because the
       * interval binds before the cap does.
       */
      const capRaw = Number(settings.max_pins_per_day);
      const cap = Number.isFinite(capRaw) && capRaw > 0 ? capRaw : 5;
      const intervalRaw = Number(settings.min_post_interval_minutes);
      const intervalMin = Number.isFinite(intervalRaw) && intervalRaw > 0 ? intervalRaw : 30;
      const perDayAllowedByInterval = Math.floor(1440 / intervalMin);
      const deliverable = Math.min(cap, perDayAllowedByInterval);

      if (perDay > deliverable) {
        const reason = cap <= perDayAllowedByInterval
          ? `the daily cap is ${cap}`
          : `the minimum interval of ${intervalMin} minutes only allows ${perDayAllowedByInterval} a day`;
        return NextResponse.json(
          {
            error:
              `This store can publish ${deliverable} pins a day — ${reason}. ` +
              `Scheduling ${perDay} a day would queue ${perDay - deliverable} pins a day that never get posted. ` +
              `Raise the limit in the store's settings, or schedule ${deliverable} a day.`,
            requested_per_day: perDay,
            deliverable_per_day: deliverable,
            max_pins_per_day: cap,
            min_post_interval_minutes: intervalMin,
          },
          { status: 400 }
        );
      }

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
