/**
 * Which store is reading which ad account, and how sure are we?
 *
 * selectAdAccount prefers settings.pinterest_ad_account_id, then matches on
 * name, then falls back to the first account the token returns. That last
 * branch is silent, and if it fires the store is reporting somebody else's
 * numbers. Read-only.
 */
import "dotenv/config";
import { Client } from "pg";
import { decrypt } from "../src/lib/encryption";
import { PinterestClient } from "../src/lib/pinterest/client";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const orgs = await c.query<{ id: string; name: string; tok: string; settings: Record<string, unknown> | null }>(
    `SELECT o.id::text, o.name, o.pinterest_access_token_encrypted tok, o.settings
       FROM public.organizations o JOIN public.store_settings st ON st.org_id=o.id
      WHERE o.pinterest_access_token_encrypted IS NOT NULL AND st.is_active
      ORDER BY o.name`);

  const rows: Array<Record<string, string>> = [];
  for (const o of orgs.rows) {
    try {
      const pin = new PinterestClient(decrypt(o.tok));
      const all = ((await pin.getAdAccounts()).items || []).map((a) => ({ id: a.id, name: a.name }));
      const pref = (o.settings?.pinterest_ad_account_id as string | undefined) ?? null;
      const t = norm(o.name);
      let how = "FIRST (no match)", chosen = all[0]?.name ?? "—";
      if (pref && all.some((a) => a.id === pref)) { how = "settings id"; chosen = all.find((a) => a.id === pref)!.name; }
      else if (all.some((a) => norm(a.name) === t)) { how = "exact name"; chosen = all.find((a) => norm(a.name) === t)!.name; }
      else if (all.some((a) => norm(a.name).startsWith(t))) { how = "starts with"; chosen = all.find((a) => norm(a.name).startsWith(t))!.name; }
      else if (all.some((a) => norm(a.name).includes(t) || t.includes(norm(a.name)))) {
        how = "contains"; chosen = all.find((a) => norm(a.name).includes(t) || t.includes(norm(a.name)))!.name;
      }
      rows.push({ store: o.name.slice(0, 24), accounts: String(all.length), chosen: chosen.slice(0, 30), how });
    } catch (e) {
      rows.push({ store: o.name.slice(0, 24), accounts: "?", chosen: "—", how: (e as Error).message.slice(0, 30) });
    }
  }
  const risky = rows.filter((r) => r.how.startsWith("FIRST") || r.how === "contains");
  console.table(rows);
  console.log(`\nNeeds a look — matched loosely or not at all: ${risky.length}`);
  for (const r of risky) console.log(`  ${r.store.padEnd(26)} → ${r.chosen.padEnd(32)} [${r.how}, ${r.accounts} accounts visible]`);
  await c.end(); process.exit(0);
})();
