import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/encryption";

// Computing per-board ORGANIC metrics means one Pinterest per-pin analytics
// call per pin, and that endpoint is hard-limited to ~60 calls/minute. So this
// runs as a paced background job (not in the user-facing boards sync). It works
// BOARD-FIRST across every connected brand: each run processes the stalest
// boards (never-synced first), so a newly onboarded brand's boards — which have
// no metrics_synced_at yet — are picked up on the very next run, and all brands
// rotate fairly over time. Self-throttles on the rate-limit headers.
export const maxDuration = 300;

const PROD = "https://api.pinterest.com/v5";
const SANDBOX = "https://api-sandbox.pinterest.com/v5";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function verifyCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET || process.env.CRON_SET;
  if (request.headers.get("authorization") === `Bearer ${secret}`) return true;
  if (request.headers.get("x-cron-secret") === secret) return true;
  return false;
}

async function fetchPinSummary(
  base: string,
  headers: Record<string, string>,
  pinId: string,
  start: string,
  end: string
): Promise<Record<string, number> | null> {
  const url = `${base}/pins/${pinId}/analytics?start_date=${start}&end_date=${end}&metric_types=IMPRESSION,SAVE,PIN_CLICK,OUTBOUND_CLICK`;
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { headers });
    } catch {
      return null;
    }
    if (res.status === 200) {
      const a = (await res.json().catch(() => null)) as {
        all?: { summary_metrics?: Record<string, number> };
      } | null;
      const remaining = parseInt(res.headers.get("x-ratelimit-remaining") || "99", 10);
      const reset = parseInt(res.headers.get("x-ratelimit-reset") || "0", 10);
      if (remaining <= 2 && reset > 0) await sleep((Math.min(reset, 60) + 1) * 1000);
      return a?.all?.summary_metrics || {};
    }
    if (res.status === 429) {
      const reset = parseInt(res.headers.get("x-ratelimit-reset") || "30", 10);
      await sleep((Math.min(reset, 60) + 1) * 1000);
      continue; // retry once after the window resets
    }
    return null;
  }
  return null;
}

export async function GET(request: NextRequest) {
  return run(request);
}
export async function POST(request: NextRequest) {
  return run(request);
}

async function run(request: NextRequest) {
  if (!verifyCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // 1) Connected brands → token + API base, keyed by org id.
  const { data: orgs } = await admin
    .from("organizations")
    .select("id, settings, pinterest_access_token_encrypted, pinterest_token_expires_at")
    .not("pinterest_access_token_encrypted", "is", null);

  const orgMap = new Map<string, { headers: Record<string, string>; base: string }>();
  for (const o of orgs || []) {
    if (
      o.pinterest_token_expires_at &&
      new Date(o.pinterest_token_expires_at) < new Date()
    )
      continue;
    try {
      const token = decrypt(o.pinterest_access_token_encrypted as string);
      const base =
        ((o.settings as Record<string, unknown>)?.pinterest_access_tier as string) === "trial"
          ? SANDBOX
          : PROD;
      orgMap.set(o.id as string, { headers: { Authorization: `Bearer ${token}` }, base });
    } catch {
      // skip undecryptable token
    }
  }
  if (orgMap.size === 0) return NextResponse.json({ message: "No connected orgs" });

  const onlyOrg = request.nextUrl.searchParams.get("org");

  // 2) Stalest boards first across ALL connected brands (never-synced first),
  // so new brands are prioritised and every brand rotates over runs.
  let boardsQuery = admin
    .from("boards")
    .select("id, org_id, pinterest_board_id")
    .not("pinterest_board_id", "is", null)
    .order("metrics_synced_at", { ascending: true, nullsFirst: true })
    .limit(onlyOrg ? 500 : 150);
  if (onlyOrg) boardsQuery = boardsQuery.eq("org_id", onlyOrg);
  const { data: boardRows } = await boardsQuery;
  const boards = (boardRows || []).filter((b) => orgMap.has(b.org_id as string));

  const endDate = new Date().toISOString().split("T")[0];
  const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  let globalBudget = 250; // per-pin analytics calls per run
  const PER_BOARD_CAP = 80;
  let processed = 0;
  const orgsTouched = new Set<string>();

  for (const b of boards) {
    if (globalBudget <= 0) break;
    const conn = orgMap.get(b.org_id as string)!;
    try {
      const listRes = await fetch(
        `${conn.base}/boards/${b.pinterest_board_id}/pins?page_size=100`,
        { headers: conn.headers }
      );
      if (!listRes.ok) continue;
      const list = (await listRes.json()) as {
        items?: Array<{ id: string; created_at?: string }>;
      };
      const pinIds: string[] = [];
      let latest: string | null = null;
      for (const it of list.items || []) {
        if (it.created_at && (!latest || it.created_at > latest)) latest = it.created_at;
        if (pinIds.length < PER_BOARD_CAP) pinIds.push(it.id);
      }

      let impr = 0,
        saves = 0,
        pinClicks = 0,
        outClicks = 0,
        ok = 0;
      for (const id of pinIds) {
        if (globalBudget <= 0) break;
        globalBudget--;
        const sm = await fetchPinSummary(conn.base, conn.headers, id, startDate, endDate);
        if (sm) {
          ok++;
          impr += sm.IMPRESSION || 0;
          saves += sm.SAVE || 0;
          pinClicks += sm.PIN_CLICK || 0;
          outClicks += sm.OUTBOUND_CLICK || 0;
        }
      }

      const upd: Record<string, unknown> = { metrics_synced_at: new Date().toISOString() };
      if (latest) upd.last_pin_added_at = latest;
      if (ok > 0) {
        upd.metrics_impressions = impr;
        upd.metrics_saves = saves;
        upd.metrics_pin_clicks = pinClicks;
        upd.metrics_outbound_clicks = outClicks;
      }
      await admin.from("boards").update(upd).eq("id", b.id);
      processed++;
      orgsTouched.add(b.org_id as string);
    } catch {
      // skip board
    }
  }

  return NextResponse.json({
    ok: true,
    boards_processed: processed,
    brands_touched: orgsTouched.size,
    remaining_budget: globalBudget,
  });
}
