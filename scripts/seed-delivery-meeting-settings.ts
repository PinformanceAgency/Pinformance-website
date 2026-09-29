/**
 * Seeds delivery_meeting_buyers and delivery_meeting_settings from the
 * delivery-meeting skill's config files (cfg_dropship.json, cfg_rens.json,
 * cfg_louiza.json).
 *
 * THE VALUES ARE NOT IN THE REPO, AND MUST NOT BE
 * -----------------------------------------------
 * The repo is public; the configs hold client figures (goals, multipliers,
 * which stores are blended). This script only knows how to read them. Point it
 * at the folder they live in:
 *
 *   SEED_DRY_RUN=1 DOTENV_CONFIG_PATH=.env.local npx tsx scripts/seed-delivery-meeting-settings.ts "<dir with cfg_*.json>"
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/seed-delivery-meeting-settings.ts "<dir>"
 *
 * Optional:
 *   ALIASES="Nature Roots=trynatureroots;Icon Amsterdam=ICON."  extra monday spellings
 *
 * WHAT IT DERIVES, AND HOW
 * ------------------------
 * - A config store is matched to an org on its `dashboard_names` (exact org
 *   name). A store with none (monday-only: Astrilon, Bright Residence) and the
 *   members of a blend are matched through the names of their Weekly Updates
 *   parent items. Nothing is matched on a guess: what does not match is
 *   printed and skipped.
 * - monday_store_name / monday_aliases come from how monday actually spells
 *   the store this week — the Weekly Store Log's Store column, the Clients
 *   subitem, the Weekly Updates item — because those names diverge from the
 *   org names systematically ("graceparkerjewelry", "by-willa", "ICON.").
 *
 * Invoice ROAS, BER, currency, invoicing model, department and buyer are NOT
 * written: they live in store_settings and stay there.
 *
 * Safe to re-run: every row is an upsert on its key.
 */
import "dotenv/config";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { createClient } from "@supabase/supabase-js";
import { nameKey, nameMatches } from "../src/lib/delivery-meeting/util";

const DRY = process.env.SEED_DRY_RUN === "1";
const dir = process.argv[2];
if (!dir || !existsSync(dir)) {
  console.error("Usage: seed-delivery-meeting-settings.ts <dir with cfg_dropship.json, cfg_rens.json, cfg_louiza.json>");
  process.exit(1);
}

interface CfgStore {
  name: string;
  monday_ids: string[];
  monday_only_ids?: string[];
  dashboard_names: string[];
  revenue_multiplier?: number;
  note?: string;
}
interface Cfg {
  stream: string;
  buyers: Record<string, { monthly_target_on_track: number; monday_name: string }>;
  weekly_goal_stores: string[] | null;
  stores: CfgStore[];
}

const pairs = (env: string | undefined) =>
  new Map(
    (env ?? "")
      .split(";")
      .map((p) => p.split("="))
      .filter((p) => p.length === 2)
      .map(([k, v]) => [k.trim().toLowerCase(), v.trim()]),
  );
const ALIASES = pairs(process.env.ALIASES);

async function monday(query: string, variables: Record<string, unknown> = {}) {
  const r = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: {
      Authorization: process.env.MONDAY_API_TOKEN!,
      "API-Version": "2024-10",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = await r.json();
  if (body.errors) throw new Error(JSON.stringify(body.errors));
  return body.data;
}

async function allNames(board: number, extra = ""): Promise<{ id: string; name: string; extra: any }[]> {
  const out: { id: string; name: string; extra: any }[] = [];
  let data = await monday(`query { boards(ids:[${board}]) { items_page(limit:500) { cursor items { id name ${extra} } } } }`);
  let page = data.boards[0].items_page;
  for (;;) {
    for (const i of page.items) out.push({ id: String(i.id), name: String(i.name), extra: i });
    if (!page.cursor) break;
    data = await monday(`query($c:String!) { next_items_page(limit:500, cursor:$c) { cursor items { id name ${extra} } } }`, {
      c: page.cursor,
    });
    page = data.next_items_page;
  }
  return out;
}

(async () => {
  const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const cfgs: { stream: "dropship" | "branded"; cfg: Cfg }[] = [];
  for (const f of ["cfg_dropship.json", "cfg_rens.json", "cfg_louiza.json"]) {
    const p = join(dir, f);
    if (!existsSync(p)) {
      console.warn(`skip: ${f} not found`);
      continue;
    }
    const cfg = JSON.parse(readFileSync(p, "utf8")) as Cfg;
    cfgs.push({ stream: /dropship/i.test(cfg.stream) ? "dropship" : "branded", cfg });
  }

  const { data: orgs, error } = await supa.from("organizations").select("id, name");
  if (error) throw error;
  const orgByName = new Map((orgs ?? []).map((o) => [String(o.name).toLowerCase(), o]));

  // monday: users, Weekly Updates parents, Clients subitems, recent log stores
  const users: { id: string; name: string }[] = (await monday(`query { users(limit: 200) { id name } }`)).users;
  const wu = await allNames(5091362359);
  const wuName = new Map(wu.map((w) => [w.id, w.name]));
  const clients = await allNames(5088411076);
  const logs = await allNames(5101714191, `column_values(ids:["text_mm1csd9j"]) { text }`);
  const logStores = [...new Set(logs.map((l) => String(l.extra.column_values?.[0]?.text ?? "").trim()).filter(Boolean))];

  const buyers: Record<string, unknown>[] = [];
  const settings = new Map<string, Record<string, unknown>>();
  const unmatched: string[] = [];

  for (const { stream, cfg } of cfgs) {
    for (const [label, b] of Object.entries(cfg.buyers)) {
      const u = users.find((x) => x.name.trim().toLowerCase() === b.monday_name.trim().toLowerCase());
      if (!u) console.warn(`buyer ${label}: no monday user named "${b.monday_name}"`);
      buyers.push({
        buyer: label.toLowerCase(),
        stream,
        monthly_target_on_track: b.monthly_target_on_track,
        monday_user_id: u ? Number(u.id) : null,
        slack_label: label,
        updated_at: new Date().toISOString(),
      });
    }

    for (const s of cfg.stores) {
      const members = new Map<string, { id: string; name: string }>();
      for (const dn of s.dashboard_names) {
        const o = orgByName.get(dn.toLowerCase());
        if (o) members.set(o.id, o);
        else unmatched.push(`${s.name}: dashboard name "${dn}" is no org`);
      }
      // Weekly Updates ids → org, through the item's own name
      const idsByOrg = new Map<string, string[]>();
      for (const mid of s.monday_ids) {
        const itemName = wuName.get(mid);
        let org =
          (orgs ?? []).find((o) => itemName && nameMatches(itemName, [nameKey(o.name)])) ??
          (s.monday_ids.length === 1 && members.size === 1 ? [...members.values()][0] : undefined) ??
          (s.monday_ids.length === 1 ? (orgs ?? []).find((o) => nameMatches(s.name, [nameKey(o.name)])) : undefined);
        if (!org) {
          unmatched.push(`${s.name}: Weekly Updates item ${mid} (${itemName ?? "?"}) matches no org`);
          continue;
        }
        members.set(org.id, org);
        idsByOrg.set(org.id, [...(idsByOrg.get(org.id) ?? []), mid]);
      }
      if (members.size === 0) {
        unmatched.push(`${s.name}: no org at all — skipped`);
        continue;
      }
      const blend = members.size > 1 ? s.name : null;

      for (const o of members.values()) {
        const keys = [s.name, o.name, ...(idsByOrg.get(o.id) ?? []).map((m) => wuName.get(m) ?? "")]
          .map(nameKey)
          .filter(Boolean);
        const seen = new Set<string>();
        // A composite name ("May Cosmetics DE / WW", "astrilon.com / RileyRiver /
        // terrahouseco.com") is another store or several: never an alias.
        const add = (n: string) => n && !n.includes(" / ") && !seen.has(n) && seen.add(n);
        [...logStores, ...clients.map((c) => c.name)].filter((n) => nameMatches(n, keys)).forEach(add);
        (idsByOrg.get(o.id) ?? []).forEach((m) => add(wuName.get(m) ?? ""));
        add(s.name);
        const extra = ALIASES.get(s.name.toLowerCase()) ?? ALIASES.get(String(o.name).toLowerCase());
        if (extra) extra.split(",").forEach((x) => add(x.trim()));
        const logName = logStores.find((n) => nameMatches(n, keys)) ?? null;
        settings.set(o.id, {
          org_id: o.id,
          display_name: blend ? o.name : s.name,
          weekly_goal: !!cfg.weekly_goal_stores?.includes(s.name),
          revenue_multiplier: s.revenue_multiplier ?? 1,
          blend_group: blend,
          monday_weekly_update_ids: idsByOrg.get(o.id) ?? [],
          monday_store_name: logName,
          monday_aliases: [...seen],
          updated_at: new Date().toISOString(),
        });
      }
    }
  }

  // ALIASES for stores that are not in any config (new since the configs)
  for (const [name, extra] of ALIASES) {
    const o = orgByName.get(name);
    if (!o || settings.has(o.id)) continue;
    settings.set(o.id, {
      org_id: o.id,
      display_name: null,
      weekly_goal: false,
      revenue_multiplier: 1,
      blend_group: null,
      monday_weekly_update_ids: [],
      monday_store_name: null,
      monday_aliases: extra.split(",").map((x) => x.trim()),
      updated_at: new Date().toISOString(),
    });
  }

  console.log(`buyers: ${buyers.length}`);
  for (const b of buyers) console.log("  ", JSON.stringify(b));
  console.log(`store settings: ${settings.size}`);
  for (const s of settings.values()) {
    const o = (orgs ?? []).find((x) => x.id === s.org_id);
    console.log(
      `   ${String(o?.name).padEnd(24)} ${String(s.display_name ?? "").padEnd(22)} goal=${s.weekly_goal ? "Y" : "-"} ` +
        `×${s.revenue_multiplier ?? 1} blend=${s.blend_group ?? "-"} wu=${JSON.stringify(s.monday_weekly_update_ids ?? [])} ` +
        `log="${s.monday_store_name ?? ""}" aliases=${JSON.stringify(s.monday_aliases)}`,
    );
  }
  if (unmatched.length) console.log("\nNOT MATCHED (fix the config or pass ALIASES):\n  " + unmatched.join("\n  "));
  if (DRY) {
    console.log("\nSEED_DRY_RUN=1 — nothing written.");
    return;
  }
  const b = await supa.from("delivery_meeting_buyers").upsert(buyers, { onConflict: "buyer" });
  if (b.error) throw b.error;
  const s = await supa.from("delivery_meeting_settings").upsert([...settings.values()], { onConflict: "org_id" });
  if (s.error) throw s.error;
  console.log("\nwritten.");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
