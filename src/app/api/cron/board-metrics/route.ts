import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/encryption";

// Computing per-board ORGANIC metrics means one Pinterest per-pin analytics
// call per pin, and that endpoint is hard-limited to ~60 calls/minute. So this
// runs as a paced background job (not in the user-facing boards sync). Each run
// processes the stalest boards within a bounded call budget, self-throttling on
// the rate-limit headers; repeated runs converge and keep the numbers fresh.
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

/**
 * Fetch one pin's ORGANIC summary metrics, respecting the analytics rate limit:
 * proactively sleep when the remaining quota is near zero, and on a 429 wait for
 * the reset window then retry once. Returns null on hard failure (don't count).
 */
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
    return null; // 4xx/5xx other than rate limit — skip this pin
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
  const { data: orgs } = await admin
    .from("organizations")
    .select("id, settings, pinterest_access_token_encrypted, pinterest_token_expires_at")
    .not("pinterest_access_token_encrypted", "is", null);

  if (!orgs || orgs.length === 0) {
    return NextResponse.json({ message: "No orgs", processed: 0 });
  }

  const endDate = new Date().toISOString().split("T")[0];
  const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  // Optional ?org=<id> to refresh a single org (used for on-demand population).
  const onlyOrg = request.nextUrl.searchParams.get("org");
  const targetOrgs = onlyOrg ? orgs.filter((o) => o.id === onlyOrg) : orgs;

  let globalBudget = 200; // total per-pin analytics calls this run
  const PER_BOARD_CAP = 80;
  const summary: Array<{ org_id: string; boards: number; calls: number }> = [];

  for (const org of targetOrgs) {
    if (globalBudget <= 0) break;
    if (
      org.pinterest_token_expires_at &&
      new Date(org.pinterest_token_expires_at) < new Date()
    )
      continue;

    let token: string;
    try {
      token = decrypt(org.pinterest_access_token_encrypted as string);
    } catch {
      continue;
    }
    const base =
      ((org.settings as Record<string, unknown>)?.pinterest_access_tier as string) === "trial"
        ? SANDBOX
        : PROD;
    const headers = { Authorization: `Bearer ${token}` };

    // Fair share of the budget so one org can't starve the rest in a run.
    const orgBudget = onlyOrg
      ? globalBudget
      : Math.min(globalBudget, Math.max(40, Math.floor(200 / targetOrgs.length)));

    const { data: boards } = await admin
      .from("boards")
      .select("id, pinterest_board_id")
      .eq("org_id", org.id)
      .not("pinterest_board_id", "is", null)
      .order("metrics_synced_at", { ascending: true, nullsFirst: true });

    let orgSpent = 0;
    let boardsDone = 0;
    for (const b of boards || []) {
      if (orgSpent >= orgBudget || globalBudget <= 0) break;
      try {
        const listRes = await fetch(
          `${base}/boards/${b.pinterest_board_id}/pins?page_size=100`,
          { headers }
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
          if (orgSpent >= orgBudget || globalBudget <= 0) break;
          orgSpent++;
          globalBudget--;
          const sm = await fetchPinSummary(base, headers, id, startDate, endDate);
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
        // Only overwrite metrics when at least one pin succeeded — never wipe a
        // board to a misleading 0 on transient failure.
        if (ok > 0) {
          upd.metrics_impressions = impr;
          upd.metrics_saves = saves;
          upd.metrics_pin_clicks = pinClicks;
          upd.metrics_outbound_clicks = outClicks;
        }
        await admin.from("boards").update(upd).eq("id", b.id);
        boardsDone++;
      } catch {
        // skip board
      }
    }
    summary.push({ org_id: org.id, boards: boardsDone, calls: orgSpent });
  }

  return NextResponse.json({ ok: true, remaining_budget: globalBudget, summary });
}
