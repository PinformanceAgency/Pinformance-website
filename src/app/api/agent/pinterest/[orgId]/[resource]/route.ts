/**
 * GET /api/agent/pinterest/{orgId}/{resource}
 *
 * One whitelisted Pinterest read, on behalf of one store, through the
 * dashboard's own token handling. See src/lib/agent/pinterest-proxy.ts for
 * why this is a named whitelist rather than a path passthrough.
 *
 * `{orgId}` accepts a uuid, a slug or the store's exact name — a person in
 * Slack says "Fit Cherries", not a uuid.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAgentKey } from "@/lib/agent/auth";
import { runPinterestResource } from "@/lib/agent/pinterest-proxy";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string; resource: string }> }
) {
  const auth = requireAgentKey(request);
  if (!auth.ok) return auth.response;

  const { orgId, resource } = await params;
  const search = new URL(request.url).searchParams;

  try {
    const { status, body } = await runPinterestResource(orgId, resource, search);
    return NextResponse.json(body, {
      status,
      headers: { "cache-control": "no-store" },
    });
  } catch (err) {
    console.error("[agent/pinterest]", err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Pinterest read failed",
      },
      { status: 500, headers: { "cache-control": "no-store" } }
    );
  }
}
