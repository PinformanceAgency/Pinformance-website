import { PinterestClient } from "./client";

export interface AdAccountChoice {
  id: string;
  name: string;
  currency?: string;
}

/**
 * Pick the right Pinterest ad account for a Pinformance org. Logic:
 * 1. If the org's settings has `pinterest_ad_account_id`, prefer that.
 * 2. Otherwise, look for an ad account whose name closely matches the org
 *    name (case-insensitive, ignoring punctuation/whitespace).
 * 3. Otherwise, fall back to the first ad account returned by Pinterest.
 *
 * Returns the chosen account plus the full list (so the caller can surface
 * "could not find a match, used X instead" UX if useful).
 */
export async function selectAdAccount(
  client: PinterestClient,
  orgName: string | null | undefined,
  preferredAdAccountId?: string | null
): Promise<{ chosen: AdAccountChoice | null; all: AdAccountChoice[] } > {
  const resp = await client.getAdAccounts();
  const accounts: AdAccountChoice[] = (resp.items || []).map((a) => ({
    id: a.id,
    name: a.name,
    currency: a.currency,
  }));
  if (accounts.length === 0) return { chosen: null, all: [] };

  if (preferredAdAccountId) {
    const exact = accounts.find((a) => a.id === preferredAdAccountId);
    if (exact) return { chosen: exact, all: accounts };
  }

  if (orgName) {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const target = norm(orgName);
    if (target) {
      // exact match first, then "starts with", then "contains".
      const exact = accounts.find((a) => norm(a.name) === target);
      if (exact) return { chosen: exact, all: accounts };
      const startsWith = accounts.find((a) => norm(a.name).startsWith(target));
      if (startsWith) return { chosen: startsWith, all: accounts };
      const contains = accounts.find(
        (a) => norm(a.name).includes(target) || target.includes(norm(a.name))
      );
      if (contains) return { chosen: contains, all: accounts };
    }
  }

  return { chosen: accounts[0], all: accounts };
}
