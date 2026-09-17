/**
 * Auth and response helpers for the read-only agent API (`/api/agent/*`).
 *
 * WHY THIS EXISTS AT ALL
 * ----------------------
 * Viktor is the agency's Slack agent and needs to read the dashboard. He
 * offered two ways in himself — a read-only Supabase key, or a dashboard
 * login he drives through a browser — and neither of them works here:
 *
 *  - A database key cannot reach Pinterest. Every store's access token sits
 *    in `organizations.pinterest_access_token_encrypted` as AES-256-GCM
 *    ciphertext, and only `ENCRYPTION_KEY` — which lives in the app, not in
 *    Postgres — turns it back into a token. It usually has to be refreshed
 *    before it works at all (`pinterestClientForOrg`). A SQL reader gets
 *    unreadable text.
 *  - A database key also cannot reach the ZONES. Red/orange/green, the FX
 *    conversion of the euro thresholds, the pro-rata of the running month —
 *    all of that is TypeScript in `src/lib/media-buying/`, not SQL. An agent
 *    reading the tables would have to reimplement it and would then quote
 *    numbers that differ from the screen everybody else is looking at.
 *  - A dashboard login cannot be read-only. The `user_role` enum has no
 *    agency-wide viewer: `client_viewer` is pinned to a single org and
 *    `agency_admin` may write everything, invitations included.
 *
 * So the agent gets its own key over its own routes. **Read-only is then a
 * property of what exists, not a promise**: every route under `/api/agent`
 * exports `GET` and nothing else, so there is no write path behind this key
 * that somebody has to remember to protect. Keep it that way — the moment a
 * POST appears here, the guarantee this whole surface is built on is gone.
 *
 * IT FAILS CLOSED
 * ---------------
 * `basicAuthChallenge()` in middleware.ts is deliberately fail-OPEN: an
 * unset password there leaves a marketing page readable, which is what it
 * was going to be anyway. This is the opposite case. An unset
 * `AGENT_API_KEY` rejects every request with a 503, because an API that
 * hands out the whole book must never be reachable by accident — not in a
 * preview deploy, not in the seconds between a deploy and somebody setting
 * the variable.
 */
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

/** Compare without leaking length or position through timing. */
function sameKey(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  // timingSafeEqual throws outright on a length mismatch, so that case is
  // answered here. It leaks the key's length and nothing else, which is not
  // worth hashing around: the key is a random secret, not a password.
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export type AgentAuth =
  | { ok: true }
  | { ok: false; response: NextResponse };

/**
 * Accepts either header, because connectors differ in what they let you set:
 *
 *   Authorization: Bearer <key>
 *   x-agent-key: <key>
 */
export function requireAgentKey(request: NextRequest): AgentAuth {
  const configured = process.env.AGENT_API_KEY?.trim();
  if (!configured) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          error:
            "AGENT_API_KEY is not configured on this deployment, so the agent API is closed.",
        },
        { status: 503 }
      ),
    };
  }

  const header = request.headers.get("authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : "";
  const direct = request.headers.get("x-agent-key")?.trim() ?? "";
  const presented = bearer || direct;

  if (presented && sameKey(presented, configured)) return { ok: true };

  return {
    ok: false,
    response: NextResponse.json(
      {
        ok: false,
        error:
          "Unauthorized. Send the agent key as `Authorization: Bearer <key>` or `x-agent-key: <key>`.",
      },
      { status: 401 }
    ),
  };
}

/**
 * Every successful answer carries `generated_at` and is marked no-store.
 *
 * The timestamp is not decoration: an agent quoting a figure in Slack has to
 * be able to say when it was true, and several of these endpoints read a
 * cache or a snapshot that is hours old by design. `no-store` keeps a CDN or
 * a connector from serving yesterday's book as today's.
 */
export function agentJson(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(
    { ok: true, generated_at: new Date().toISOString(), ...payload },
    { status, headers: { "cache-control": "no-store" } }
  );
}

export function agentError(message: string, status = 400) {
  return NextResponse.json(
    { ok: false, error: message },
    { status, headers: { "cache-control": "no-store" } }
  );
}

/** node-pg hands NUMERIC back as a string. Nothing downstream wants that. */
export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
