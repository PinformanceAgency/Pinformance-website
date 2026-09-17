/**
 * GET /api/agent/pinterest/{orgId} — which Pinterest reads are available for
 * this store, and which ad account they default to.
 *
 * Discovery, so a model does not have to guess a resource name and read an
 * error to find out what exists.
 */
import { NextRequest } from "next/server";
import { requireAgentKey, agentJson, agentError } from "@/lib/agent/auth";
import { PINTEREST_RESOURCES, resolveOrg } from "@/lib/agent/pinterest-proxy";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const auth = requireAgentKey(request);
  if (!auth.ok) return auth.response;
  const { orgId } = await params;

  try {
    const org = await resolveOrg(orgId);
    if (!org) return agentError(`No store with id ${orgId}`, 404);
    return agentJson({
      org_id: org.org_id,
      store: org.store,
      default_ad_account_id: org.ad_account_id,
      connected: org.connected,
      last_error: org.last_error,
      resources: Object.entries(PINTEREST_RESOURCES).map(([name, def]) => ({
        name,
        what: def.what,
        params: def.params ?? {},
        path: `/api/agent/pinterest/${org.org_id}/${name}`,
      })),
      note:
        "Dates are YYYY-MM-DD. Paid resources default to the store's own ad account; pass ad_account_id to override. " +
        "`connected: false` or a `last_error` means this store needs reconnecting in the dashboard — retrying will not help.",
    });
  } catch (err) {
    console.error("[agent/pinterest/index]", err);
    return agentError(
      err instanceof Error ? err.message : "Could not read the store",
      500
    );
  }
}
