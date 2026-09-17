/**
 * The read-only Pinterest surface the agent may reach, one named resource at
 * a time.
 *
 * WHY A WHITELIST AND NOT A PASSTHROUGH
 * -------------------------------------
 * The obvious shape for this is "forward whatever path you are given to
 * api.pinterest.com with the store's token". That is also how a read-only
 * integration quietly becomes a write one: `POST /pins` and `PATCH /boards`
 * live on the same host as `GET /boards`, one `method` away, and the only
 * thing standing between them would be a string check somebody edits later.
 * Here each resource is a named function that calls one method on
 * `PinterestClient`, and the client methods that create, update or delete
 * are simply not referenced. There is no path to forge.
 *
 * WHY IT GOES THROUGH THE APP AT ALL
 * ----------------------------------
 * `pinterestClientForOrg()` does the decrypt → check expiry → refresh →
 * write-back dance. Every store connects through its OWN Pinterest app with
 * its own token, encrypted with a key the database does not hold, so there
 * is no version of this that an external reader can do for itself. It also
 * means a dead token is reported as what it is — a store that needs
 * reconnecting, which no retry ever fixes — instead of a bare 401 that reads
 * like an outage.
 */
import { organicPool } from "@/lib/organic/db";
import {
  pinterestClientForOrg,
  PinterestAuthError,
} from "@/lib/pinterest/for-org";
import type { PinterestClient } from "@/lib/pinterest/client";

export interface AgentOrg {
  org_id: string;
  store: string;
  ad_account_id: string | null;
  connected: boolean;
  last_error: string | null;
}

/**
 * Resolve a store by uuid, slug or exact name.
 *
 * A Slack agent is given a store name by a person, not a uuid, and looking
 * one up should not cost a round trip to another endpoint first.
 */
export async function resolveOrg(key: string): Promise<AgentOrg | null> {
  const { rows } = await organicPool().query<{
    org_id: string;
    store: string;
    ad_account_id: string | null;
    has_token: boolean;
    last_error: string | null;
  }>(
    `SELECT o.id::text AS org_id,
            o.name     AS store,
            -- Three sources, in order of how deliberate they are. The last
            -- is where it actually lives for most stores: store_settings
            -- caches it for 2 of 72 orgs and organizations.settings for 7.
            COALESCE(s.ad_account_id,
                     o.settings->>'pinterest_ad_account_id',
                     (SELECT m.ad_account_id
                        FROM public.pinterest_metrics_snapshots m
                       WHERE m.org_id = o.id
                         AND m.ad_account_id IS NOT NULL
                       ORDER BY m.snapshot_date DESC, m.id DESC
                       LIMIT 1)) AS ad_account_id,
            (o.pinterest_access_token_encrypted IS NOT NULL) AS has_token,
            o.pinterest_last_error AS last_error
       FROM public.organizations o
       LEFT JOIN public.store_settings s ON s.org_id = o.id
      -- The id is compared as TEXT, not cast to uuid: a name like
      -- "Fit Cherries" against o.id = $1::uuid fails at parse time with
      -- "invalid input syntax for type uuid", and the whole point of this
      -- lookup is that a person in Slack types a name.
      WHERE o.id::text = lower($1)
         OR o.slug = $1
         OR lower(o.name) = lower($1)
      LIMIT 1`,
    [key]
  );
  const r = rows[0];
  if (!r) return null;
  return {
    org_id: r.org_id,
    store: r.store,
    ad_account_id: r.ad_account_id,
    connected: r.has_token,
    last_error: r.last_error,
  };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * The date range for an analytics call.
 *
 * Ends YESTERDAY by default, deliberately. Pinterest's realtime numbers move
 * for about a day, and a figure an agent has already said out loud in Slack
 * cannot be taken back — the same reason the analytics pull ends its window
 * there.
 */
export function dateRange(
  params: URLSearchParams,
  defaultDays = 7
): { start: string; end: string } {
  const start = params.get("start_date") ?? daysAgo(defaultDays);
  const end = params.get("end_date") ?? daysAgo(1);
  if (!ISO_DATE.test(start) || !ISO_DATE.test(end)) {
    throw new Error("start_date and end_date must be YYYY-MM-DD");
  }
  if (start > end) throw new Error("start_date is after end_date");
  return { start, end };
}

function need(params: URLSearchParams, key: string): string {
  const v = params.get(key)?.trim();
  if (!v) throw new Error(`Missing required parameter \`${key}\``);
  return v;
}

function idList(params: URLSearchParams, key: string): string[] {
  return need(params, key)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 100); // every analytics endpoint caps at 100 ids
}

interface Ctx {
  client: PinterestClient;
  params: URLSearchParams;
  /** The store's own ad account, or whatever `?ad_account_id=` overrode it with. */
  adAccountId: string | null;
}

function needAdAccount(ctx: Ctx): string {
  if (!ctx.adAccountId) {
    throw new Error(
      "This store has no ad account on file. Pass ?ad_account_id=… or use the `ad-accounts` resource to find one."
    );
  }
  return ctx.adAccountId;
}

type Granularity = "TOTAL" | "DAY" | "WEEK" | "MONTH";
function granularity(params: URLSearchParams): Granularity {
  const g = (params.get("granularity") ?? "TOTAL").toUpperCase();
  return (["TOTAL", "DAY", "WEEK", "MONTH"] as const).includes(g as Granularity)
    ? (g as Granularity)
    : "TOTAL";
}

export interface ResourceDef {
  what: string;
  params?: Record<string, string>;
  run: (ctx: Ctx) => Promise<unknown>;
}

export const PINTEREST_RESOURCES: Record<string, ResourceDef> = {
  account: {
    what: "The connected Pinterest account: username, follower counts, pin count.",
    run: ({ client }) => client.getUser(),
  },
  "ad-accounts": {
    what: "Every ad account this token can see, with its currency.",
    run: ({ client }) => client.getAdAccounts(),
  },
  boards: {
    what: "Every board on the account (all pages), with privacy and pin count.",
    run: ({ client }) => client.getBoards(),
  },
  "board-pins": {
    what: "Pins on one board, newest first.",
    params: { board_id: "required", page_size: "default 25", bookmark: "page cursor" },
    run: ({ client, params }) =>
      client.getBoardPins(
        need(params, "board_id"),
        Number(params.get("page_size") ?? 25),
        params.get("bookmark") ?? undefined
      ),
  },
  pins: {
    what: "The account's own pins, 250 per page.",
    params: { bookmark: "page cursor" },
    run: ({ client, params }) =>
      client.getAccountPins(params.get("bookmark") ?? undefined),
  },
  pin: {
    what: "One pin by id.",
    params: { pin_id: "required" },
    run: ({ client, params, adAccountId }) =>
      client.getPin(need(params, "pin_id"), adAccountId ?? undefined),
  },
  "top-pins": {
    what: "Best-performing pins over a date range.",
    params: {
      start_date: "default 7 days ago",
      end_date: "default yesterday",
      sort_by: "IMPRESSION (default), SAVE, PIN_CLICK, OUTBOUND_CLICK",
      content_type: "ORGANIC | PAID | ALL",
    },
    run: ({ client, params }) => {
      const { start, end } = dateRange(params, 30);
      return client.getTopPins(
        start,
        end,
        params.get("sort_by") ?? "IMPRESSION",
        undefined,
        params.get("content_type") ?? undefined
      );
    },
  },
  "pin-analytics": {
    what: "Daily metrics for one pin.",
    params: { pin_id: "required", start_date: "", end_date: "" },
    run: ({ client, params }) => {
      const { start, end } = dateRange(params, 30);
      return client.getPinAnalytics(need(params, "pin_id"), start, end);
    },
  },
  "user-analytics": {
    what: "Organic account analytics per day: impressions, saves, clicks, engagement.",
    params: { start_date: "", end_date: "" },
    run: ({ client, params }) => {
      const { start, end } = dateRange(params, 30);
      // Pinterest answers 400 code 1 beyond 90 days on this endpoint.
      return client.getUserAccountAnalytics(start, end);
    },
  },
  "ad-account-analytics": {
    what: "Paid top-line for the whole ad account — what Campaign Manager shows.",
    params: {
      start_date: "", end_date: "",
      granularity: "TOTAL (default) | DAY | WEEK | MONTH",
      ad_account_id: "defaults to the store's own",
    },
    run: (ctx) => {
      const { start, end } = dateRange(ctx.params, 7);
      return ctx.client.getAdAccountAnalytics(needAdAccount(ctx), start, end, {
        granularity: granularity(ctx.params),
      });
    },
  },
  campaigns: {
    what: "Campaigns in the ad account, with status and daily spend cap.",
    params: { entity_statuses: "e.g. ACTIVE,PAUSED", bookmark: "page cursor" },
    run: (ctx) =>
      ctx.client.getCampaigns(needAdAccount(ctx), {
        bookmark: ctx.params.get("bookmark") ?? undefined,
        entityStatuses:
          ctx.params.get("entity_statuses")?.split(",").map((s) => s.trim()) ??
          undefined,
      }),
  },
  "campaign-analytics": {
    what: "Paid metrics per campaign. Up to 100 ids.",
    params: { campaign_ids: "required, comma-separated", start_date: "", end_date: "" },
    run: (ctx) => {
      const { start, end } = dateRange(ctx.params, 7);
      return ctx.client.getCampaignAnalytics(
        needAdAccount(ctx),
        idList(ctx.params, "campaign_ids"),
        start,
        end,
        { granularity: granularity(ctx.params) }
      );
    },
  },
  "ad-groups": {
    what: "Ad groups in the ad account.",
    params: { entity_statuses: "", bookmark: "" },
    run: (ctx) =>
      ctx.client.getAdGroups(needAdAccount(ctx), {
        bookmark: ctx.params.get("bookmark") ?? undefined,
        entityStatuses:
          ctx.params.get("entity_statuses")?.split(",").map((s) => s.trim()) ??
          undefined,
      }),
  },
  "ad-group-analytics": {
    what: "Paid metrics per ad group. Up to 100 ids.",
    params: { ad_group_ids: "required, comma-separated", start_date: "", end_date: "" },
    run: (ctx) => {
      const { start, end } = dateRange(ctx.params, 7);
      return ctx.client.getAdGroupAnalytics(
        needAdAccount(ctx),
        idList(ctx.params, "ad_group_ids"),
        start,
        end,
        { granularity: granularity(ctx.params) }
      );
    },
  },
  ads: {
    what: "Ads in the ad account.",
    params: { entity_statuses: "", bookmark: "" },
    run: (ctx) =>
      ctx.client.getAds(needAdAccount(ctx), {
        bookmark: ctx.params.get("bookmark") ?? undefined,
        entityStatuses:
          ctx.params.get("entity_statuses")?.split(",").map((s) => s.trim()) ??
          undefined,
      }),
  },
  "ad-analytics": {
    what: "Paid metrics per ad. Up to 100 ids.",
    params: { ad_ids: "required, comma-separated", start_date: "", end_date: "" },
    run: (ctx) => {
      const { start, end } = dateRange(ctx.params, 7);
      return ctx.client.getAdAnalytics(
        needAdAccount(ctx),
        idList(ctx.params, "ad_ids"),
        start,
        end,
        { granularity: granularity(ctx.params) }
      );
    },
  },
};

export interface ProxyResult {
  status: number;
  body: Record<string, unknown>;
}

/**
 * Run one whitelisted resource for one store.
 *
 * A dead token comes back as 409 with the reason, never as a 500: it is not
 * a failure of this API and no retry will fix it — somebody has to reconnect
 * the account in the dashboard.
 */
export async function runPinterestResource(
  orgKey: string,
  resource: string,
  params: URLSearchParams
): Promise<ProxyResult> {
  const def = PINTEREST_RESOURCES[resource];
  if (!def) {
    return {
      status: 404,
      body: {
        ok: false,
        error: `Unknown resource \`${resource}\`.`,
        available: Object.keys(PINTEREST_RESOURCES),
      },
    };
  }

  const org = await resolveOrg(orgKey);
  if (!org) {
    return { status: 404, body: { ok: false, error: `No store matching \`${orgKey}\`` } };
  }

  try {
    const { client } = await pinterestClientForOrg(org.org_id);
    const data = await def.run({
      client,
      params,
      adAccountId: params.get("ad_account_id")?.trim() || org.ad_account_id,
    });
    return {
      status: 200,
      body: {
        ok: true,
        generated_at: new Date().toISOString(),
        org_id: org.org_id,
        store: org.store,
        resource,
        data,
      },
    };
  } catch (err) {
    if (err instanceof PinterestAuthError) {
      return {
        status: 409,
        body: {
          ok: false,
          store: org.store,
          error: `${org.store} needs reconnecting in the dashboard (${err.reason}). Retrying will not help.`,
          reason: err.reason,
          last_error: org.last_error,
        },
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    // A missing or malformed parameter is the caller's, not ours.
    const isInput =
      message.startsWith("Missing required parameter") ||
      message.includes("must be YYYY-MM-DD") ||
      message.includes("is after end_date") ||
      message.includes("has no ad account on file");
    return {
      status: isInput ? 400 : 502,
      body: { ok: false, store: org.store, resource, error: message },
    };
  }
}
