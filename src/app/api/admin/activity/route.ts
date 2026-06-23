/**
 * Admin → Activity feed for a single connected store's Pinterest ad account.
 *
 * Pinterest's API does NOT expose a per-field change log. Each campaign /
 * ad group / ad does carry `created_time` and `updated_time` though, so we
 * pull all entities and surface the ones touched in the requested window.
 * This shows WHAT was touched and WHEN — not the before/after diff. Real
 * diffs require snapshotting state ourselves (phase 2).
 *
 * Caller must be agency_admin. The target org is supplied explicitly via
 * `org_id` — this route ignores the caller's `active_org_id` so the admin
 * overview can show activity for any store in one place.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/encryption";
import { PinterestClient, MAX_PINTEREST_FETCH } from "@/lib/pinterest/client";
import { selectAdAccount } from "@/lib/pinterest/select-ad-account";

type EntityType = "campaign" | "ad_group" | "ad";

interface ActivityItem {
  id: string;
  type: EntityType;
  name: string;
  status: string | null;
  created_time: number | null;
  updated_time: number | null;
  /** "created" if created_time falls in window, otherwise "updated". */
  action: "created" | "updated";
  /** Unix seconds — used by the UI for grouping/sorting. */
  action_time: number;
  /** Type-specific extras shown in the row. */
  extra?: Record<string, unknown>;
  parent?: { campaign_id?: string; ad_group_id?: string };
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

  // Convert window to unix seconds. End date is inclusive (end of day UTC).
  const startSec = Math.floor(new Date(`${body.start_date}T00:00:00Z`).getTime() / 1000);
  const endSec = Math.floor(new Date(`${body.end_date}T23:59:59Z`).getTime() / 1000);

  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organizations")
    .select("id, name, pinterest_access_token_encrypted, settings")
    .eq("id", body.org_id)
    .single();
  if (!org?.pinterest_access_token_encrypted) {
    return NextResponse.json({ error: "Pinterest not connected for this org" }, { status: 400 });
  }

  try {
    const token = decrypt(org.pinterest_access_token_encrypted);
    const isTrial =
      ((org.settings as Record<string, unknown>)?.pinterest_access_tier as string) === "trial";
    const client = new PinterestClient(token, isTrial);

    const settings = (org.settings as Record<string, unknown>) || {};
    const preferredAdAccountId =
      typeof settings.pinterest_ad_account_id === "string"
        ? settings.pinterest_ad_account_id
        : null;
    const { chosen: adAccount } = await selectAdAccount(
      client,
      org.name as string | null,
      preferredAdAccountId
    );
    if (!adAccount) {
      return NextResponse.json({ error: "No ad account" }, { status: 400 });
    }

    // Paginate each entity type. We pull everything and filter in-memory —
    // Pinterest's list endpoints don't support server-side updated_time filters.
    async function pullAll<T>(
      fetcher: (bookmark?: string) => Promise<{ items: T[]; bookmark?: string }>
    ): Promise<T[]> {
      const out: T[] = [];
      let bookmark: string | undefined;
      do {
        const page = await fetcher(bookmark);
        out.push(...(page.items || []));
        bookmark = page.bookmark;
        if (out.length >= MAX_PINTEREST_FETCH) break;
      } while (bookmark);
      return out;
    }

    const [campaigns, adGroups, ads] = await Promise.all([
      pullAll((bookmark) => client.getCampaigns(adAccount.id, { bookmark, pageSize: 250 })),
      pullAll((bookmark) => client.getAdGroups(adAccount.id, { bookmark, pageSize: 250 })),
      pullAll((bookmark) => client.getAds(adAccount.id, { bookmark, pageSize: 250 })),
    ]);

    const items: ActivityItem[] = [];

    function consider(
      type: EntityType,
      e: {
        id: string;
        name?: string;
        status?: string;
        created_time?: number;
        updated_time?: number;
      },
      extra?: Record<string, unknown>,
      parent?: { campaign_id?: string; ad_group_id?: string }
    ) {
      const created = typeof e.created_time === "number" ? e.created_time : null;
      const updated = typeof e.updated_time === "number" ? e.updated_time : null;
      const createdInWindow = created != null && created >= startSec && created <= endSec;
      const updatedInWindow = updated != null && updated >= startSec && updated <= endSec;

      // Prefer the most recent event in window. If only created falls in
      // window we call it "created"; otherwise "updated".
      if (!createdInWindow && !updatedInWindow) return;
      const action: "created" | "updated" = createdInWindow && (!updatedInWindow || updated === created)
        ? "created"
        : "updated";
      const action_time = action === "created" ? created! : updated!;

      items.push({
        id: e.id,
        type,
        name: e.name || "(unnamed)",
        status: e.status ?? null,
        created_time: created,
        updated_time: updated,
        action,
        action_time,
        extra,
        parent,
      });
    }

    for (const c of campaigns) {
      consider("campaign", c, {
        daily_spend_cap: c.daily_spend_cap ?? null,
        lifetime_spend_cap: c.lifetime_spend_cap ?? null,
        objective_type: c.objective_type ?? null,
      });
    }
    for (const g of adGroups) {
      consider(
        "ad_group",
        g,
        {
          budget_in_micro_currency: g.budget_in_micro_currency ?? null,
          bid_in_micro_currency: g.bid_in_micro_currency ?? null,
        },
        { campaign_id: g.campaign_id }
      );
    }
    for (const a of ads) {
      consider(
        "ad",
        a,
        { creative_type: a.creative_type ?? null, pin_id: a.pin_id ?? null },
        { campaign_id: a.campaign_id, ad_group_id: a.ad_group_id }
      );
    }

    items.sort((a, b) => b.action_time - a.action_time);

    // Totals for the header.
    const totals = {
      created: items.filter((i) => i.action === "created").length,
      updated: items.filter((i) => i.action === "updated").length,
      by_type: {
        campaign: items.filter((i) => i.type === "campaign").length,
        ad_group: items.filter((i) => i.type === "ad_group").length,
        ad: items.filter((i) => i.type === "ad").length,
      },
      total: items.length,
    };

    return NextResponse.json({
      ok: true,
      ad_account_id: adAccount.id,
      ad_account_name: adAccount.name,
      currency: adAccount.currency || "USD",
      start_date: body.start_date,
      end_date: body.end_date,
      totals,
      items,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
