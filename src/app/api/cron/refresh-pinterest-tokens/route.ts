import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encrypt, decrypt } from "@/lib/encryption";

/**
 * Proactively refresh Pinterest access tokens so a connected store never needs
 * to reconnect (except on a genuine revocation — changed password / removed app
 * on Pinterest's side, where the refresh grant itself becomes invalid).
 *
 * Pinterest access tokens last ~30 days and refresh tokens ~1 year. This runs
 * daily and refreshes any token expiring within REFRESH_BUFFER, using each
 * org's OWN app credentials (per-org pinterest_app_id/secret, falling back to
 * the global env app). When Pinterest returns a rotated refresh_token we store
 * it too, which keeps the 1-year refresh-token clock rolling.
 */
export const maxDuration = 120;

const PROD = "https://api.pinterest.com/v5";
const SANDBOX = "https://api-sandbox.pinterest.com/v5";
const REFRESH_BUFFER_MS = 7 * 24 * 60 * 60 * 1000; // refresh when <7 days left

function verifyCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (request.headers.get("authorization") === `Bearer ${secret}`) return true;
  if (request.headers.get("x-cron-secret") === secret) return true;
  return false;
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
    .select(
      "id, name, settings, pinterest_token_expires_at, pinterest_refresh_token_encrypted, pinterest_app_id, pinterest_app_secret_encrypted"
    )
    .not("pinterest_refresh_token_encrypted", "is", null);

  // Allow forcing a refresh of every connected org via ?force=1 (or ?org=).
  const force = request.nextUrl.searchParams.get("force") === "1";
  const onlyOrg = request.nextUrl.searchParams.get("org");

  const now = Date.now();
  let refreshed = 0;
  let skipped = 0;
  const failures: { org: string; reason: string }[] = [];

  for (const org of orgs || []) {
    if (onlyOrg && org.id !== onlyOrg) continue;

    // Skip tokens that are still comfortably valid (unless forced).
    const expMs = org.pinterest_token_expires_at
      ? new Date(org.pinterest_token_expires_at).getTime()
      : 0;
    if (!force && expMs && expMs - now > REFRESH_BUFFER_MS) {
      skipped++;
      continue;
    }

    const appId = (org.pinterest_app_id as string) || process.env.PINTEREST_APP_ID;
    let appSecret: string | undefined = process.env.PINTEREST_APP_SECRET;
    if (org.pinterest_app_secret_encrypted) {
      try {
        appSecret = decrypt(org.pinterest_app_secret_encrypted as string);
      } catch {
        failures.push({ org: org.name as string, reason: "bad app secret" });
        continue;
      }
    }
    if (!appId || !appSecret) {
      failures.push({ org: org.name as string, reason: "no app credentials" });
      continue;
    }

    let refreshToken: string;
    try {
      refreshToken = decrypt(org.pinterest_refresh_token_encrypted as string);
    } catch {
      failures.push({ org: org.name as string, reason: "bad refresh token" });
      continue;
    }

    const base =
      ((org.settings as Record<string, unknown>)?.pinterest_access_tier as string) === "trial"
        ? SANDBOX
        : PROD;
    const cred = Buffer.from(`${appId}:${appSecret}`).toString("base64");

    try {
      const res = await fetch(`${base}/oauth/token`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${cred}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        // 401 / code 283 "authorization grant is invalid" = genuinely revoked.
        failures.push({
          org: org.name as string,
          reason: `${res.status}: ${body.slice(0, 120)}`,
        });
        continue;
      }

      const tok = (await res.json()) as {
        access_token: string;
        expires_in?: number;
        refresh_token?: string;
        scope?: string;
      };

      const update: Record<string, unknown> = {
        pinterest_access_token_encrypted: encrypt(tok.access_token),
        pinterest_token_expires_at: new Date(
          now + (tok.expires_in ? tok.expires_in * 1000 : 30 * 24 * 60 * 60 * 1000)
        ).toISOString(),
        updated_at: new Date().toISOString(),
      };
      // Store a rotated refresh token / updated scopes when Pinterest returns them.
      if (tok.refresh_token) update.pinterest_refresh_token_encrypted = encrypt(tok.refresh_token);
      if (tok.scope) update.pinterest_token_scopes = tok.scope;

      await admin.from("organizations").update(update).eq("id", org.id);
      refreshed++;
    } catch (e) {
      failures.push({
        org: org.name as string,
        reason: e instanceof Error ? e.message : "fetch error",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    refreshed,
    skipped,
    failed: failures.length,
    failures: failures.length ? failures : undefined,
  });
}
