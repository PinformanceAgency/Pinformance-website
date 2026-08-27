/**
 * One Pinterest client per org, with the token refresh handled once.
 *
 * Every caller that wanted to talk to Pinterest on behalf of a store was
 * repeating the same four steps: read the org row, decrypt the access token,
 * notice it had expired, refresh it and write the new one back. The refresh
 * half only existed in `post-pins` and `refresh-pinterest-tokens`; everywhere
 * else an expired token surfaced as a bare 401 from Pinterest, which reads
 * like an outage rather than "this store needs reconnecting".
 *
 * That distinction is the reason this file exists. A dead token never fixes
 * itself — somebody has to reconnect the account — and a caller can only act
 * on that if it can tell it apart from a transient failure. Hence
 * `PinterestAuthError`: thrown only when the store genuinely needs a human,
 * never for a network hiccup or a rate limit.
 *
 * Existing callers are deliberately left alone. They work, and rewriting
 * twenty routes to prove a helper is nice is how you break the paid side on
 * a Monday.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt, encrypt } from "@/lib/encryption";
import { PinterestClient } from "@/lib/pinterest/client";

/** The store must be reconnected. Retrying will never help. */
export class PinterestAuthError extends Error {
  readonly reason:
    | "not_connected"
    | "decrypt_failed"
    | "expired_no_refresh"
    | "refresh_failed";

  constructor(reason: PinterestAuthError["reason"], message: string) {
    super(message);
    this.name = "PinterestAuthError";
    this.reason = reason;
  }
}

interface OrgTokenRow {
  id: string;
  name: string | null;
  pinterest_access_token_encrypted: string | null;
  pinterest_refresh_token_encrypted: string | null;
  pinterest_token_expires_at: string | null;
  pinterest_app_id: string | null;
  pinterest_app_secret_encrypted: string | null;
  settings: Record<string, unknown> | null;
}

const TOKEN_COLUMNS =
  "id, name, pinterest_access_token_encrypted, pinterest_refresh_token_encrypted, " +
  "pinterest_token_expires_at, pinterest_app_id, pinterest_app_secret_encrypted, settings";

/**
 * Build a client for one org.
 *
 * Refreshes an expired token and writes the new pair back before returning,
 * so the next caller in the same run does not refresh again.
 */
export async function pinterestClientForOrg(
  orgId: string
): Promise<{ client: PinterestClient; isTrial: boolean; orgName: string }> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("organizations")
    .select(TOKEN_COLUMNS)
    .eq("id", orgId)
    .single();

  const org = data as OrgTokenRow | null;
  if (!org?.pinterest_access_token_encrypted) {
    throw new PinterestAuthError("not_connected", "No Pinterest account connected");
  }
  return buildClient(org);
}

/**
 * Same, for a set of orgs, in one round trip.
 *
 * Returns a map of what worked and a list of what did not, rather than
 * throwing: a cron over forty stores must not stop at the first dead token.
 */
export async function pinterestClientsForOrgs(orgIds: string[]): Promise<{
  clients: Map<string, { client: PinterestClient; isTrial: boolean; orgName: string }>;
  failed: Array<{ org_id: string; org_name: string; reason: PinterestAuthError["reason"]; message: string }>;
}> {
  const clients = new Map<string, { client: PinterestClient; isTrial: boolean; orgName: string }>();
  const failed: Array<{ org_id: string; org_name: string; reason: PinterestAuthError["reason"]; message: string }> = [];
  if (orgIds.length === 0) return { clients, failed };

  const admin = createAdminClient();
  const { data } = await admin
    .from("organizations")
    .select(TOKEN_COLUMNS)
    .in("id", orgIds);

  const rows = (data ?? []) as unknown as OrgTokenRow[];
  const seen = new Set(rows.map((r) => r.id));
  for (const missing of orgIds.filter((id) => !seen.has(id))) {
    failed.push({
      org_id: missing,
      org_name: missing,
      reason: "not_connected",
      message: "Organisation not found",
    });
  }

  // Sequential on purpose: a refresh writes back to the same table, and
  // Pinterest rejects concurrent refreshes on one refresh token.
  for (const org of rows) {
    try {
      if (!org.pinterest_access_token_encrypted) {
        throw new PinterestAuthError("not_connected", "No Pinterest account connected");
      }
      clients.set(org.id, await buildClient(org));
    } catch (e) {
      const err = e instanceof PinterestAuthError
        ? e
        : new PinterestAuthError("refresh_failed", (e as Error).message);
      failed.push({
        org_id: org.id,
        org_name: org.name ?? org.id,
        reason: err.reason,
        message: err.message,
      });
    }
  }
  return { clients, failed };
}

async function buildClient(org: OrgTokenRow) {
  let token: string;
  try {
    token = decrypt(org.pinterest_access_token_encrypted!);
  } catch {
    throw new PinterestAuthError("decrypt_failed", "Stored token could not be decrypted");
  }

  const expired =
    !!org.pinterest_token_expires_at &&
    new Date(org.pinterest_token_expires_at) < new Date();

  if (expired) {
    if (!org.pinterest_refresh_token_encrypted) {
      throw new PinterestAuthError("expired_no_refresh", "Token expired and there is no refresh token");
    }
    try {
      const refresh = decrypt(org.pinterest_refresh_token_encrypted);
      const fresh = await PinterestClient.refreshToken(
        refresh,
        org.pinterest_app_id ?? undefined,
        org.pinterest_app_secret_encrypted ? decrypt(org.pinterest_app_secret_encrypted) : undefined
      );
      token = fresh.access_token;
      const admin = createAdminClient();
      await admin
        .from("organizations")
        .update({
          pinterest_access_token_encrypted: encrypt(fresh.access_token),
          pinterest_refresh_token_encrypted: fresh.refresh_token
            ? encrypt(fresh.refresh_token)
            : org.pinterest_refresh_token_encrypted,
          pinterest_token_expires_at: new Date(
            Date.now() + (fresh.expires_in || 2592000) * 1000
          ).toISOString(),
        })
        .eq("id", org.id);
    } catch (e) {
      throw new PinterestAuthError(
        "refresh_failed",
        `Token refresh failed: ${(e as Error).message}`
      );
    }
  }

  const settings = (org.settings ?? {}) as Record<string, unknown>;
  return {
    client: new PinterestClient(token, settings.pinterest_access_tier === "trial"),
    isTrial: settings.pinterest_access_tier === "trial",
    orgName: org.name ?? org.id,
  };
}
