/**
 * Offboard in the dashboard what the monday Clients board already has on
 * Inactive: `store_settings.is_active = false`, with a note, the same soft
 * offboard as in CLAUDE.md (reversible, no data touched).
 *
 *   SYNC_DRY_RUN=1 DOTENV_CONFIG_PATH=.env.local npx tsx scripts/sync-inactive-from-clients.ts
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/sync-inactive-from-clients.ts
 *
 * A store counts as inactive exactly as the delivery meeting decides it
 * (collect.ts): every Clients subitem matching it is Inactive or sits under a
 * client in an inactive group. One live subitem is enough to keep it live
 * ("May Cosmetics NL" Active next to an Inactive "May Cosmetics DE / WW").
 * Matching goes through the org name, display name, monday name and
 * `monday_aliases`, never a fuzzier matcher.
 *
 * Only ever switches OFF. Stores not on Clients at all are listed, not
 * touched — absent is not the same as Inactive. Stores live on Clients but
 * off in the dashboard are listed too, for a person to decide.
 */
import "dotenv/config";
import { adminClient, loadMeetingSettings } from "../src/lib/delivery-meeting/db";
import { loadClientStores, type ClientStore } from "../src/lib/delivery-meeting/monday";
import { nameKey, nameMatches } from "../src/lib/delivery-meeting/util";

const DRY = process.env.SYNC_DRY_RUN === "1";

(async () => {
  const supabase = adminClient();
  const [clients, meeting, settingsRes, orgsRes] = await Promise.all([
    loadClientStores(),
    loadMeetingSettings(),
    supabase.from("store_settings").select("org_id, is_active, notes, department, media_buyer"),
    supabase.from("organizations").select("id, name"),
  ]);
  if (settingsRes.error) throw new Error(settingsRes.error.message);
  if (orgsRes.error) throw new Error(orgsRes.error.message);
  const orgName = new Map((orgsRes.data ?? []).map((o) => [o.id as string, (o.name as string) ?? ""]));

  const keysFor = (org: string) => {
    const m = meeting.get(org);
    return [orgName.get(org), m?.display_name, m?.monday_store_name, ...(m?.monday_aliases ?? [])]
      .map(nameKey)
      .filter(Boolean);
  };
  const live = (c: ClientStore) => c.status !== "Inactive" && !/inactive/i.test(c.parent_group ?? "");

  const toOff: { org_id: string; name: string; hits: string[]; notes: string | null }[] = [];
  const absent: string[] = [];
  const liveButOff: string[] = [];
  for (const s of settingsRes.data ?? []) {
    const name = orgName.get(s.org_id) ?? s.org_id;
    const hits = clients.filter((c) => nameMatches(c.name, keysFor(s.org_id)));
    if (!hits.length) {
      if (s.is_active !== false) absent.push(name);
      continue;
    }
    if (hits.some(live)) {
      if (s.is_active === false) liveButOff.push(`${name} (${hits.filter(live).map((c) => `${c.name}: ${c.status || "no status"}`).join(", ")})`);
      continue;
    }
    if (s.is_active !== false) {
      toOff.push({ org_id: s.org_id, name, hits: hits.map((c) => `${c.name} [${c.status || "—"} · ${c.parent_group ?? "?"}]`), notes: s.notes });
    }
  }

  console.log(`\nInactive op Clients, nog actief in het dashboard → ${DRY ? "zou" : "wordt"} op inactive gezet (${toOff.length}):`);
  for (const t of toOff) console.log(`  - ${t.name}   ← ${t.hits.join("; ")}`);
  console.log(`\nNiet op Clients gevonden, blijft actief (${absent.length}):`);
  for (const n of absent) console.log(`  - ${n}`);
  console.log(`\nLive op Clients maar inactief in het dashboard, niet aangeraakt (${liveButOff.length}):`);
  for (const n of liveButOff) console.log(`  - ${n}`);

  if (DRY || !toOff.length) {
    console.log(DRY ? "\nDry run: niets geschreven." : "\nNiets te doen.");
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  for (const t of toOff) {
    const note = `Offboarded ${today} (Inactive op het Clients-bord)`;
    const { error } = await supabase
      .from("store_settings")
      .update({
        is_active: false,
        notes: t.notes && t.notes.trim() ? `${t.notes}\n${note}` : note,
        updated_at: new Date().toISOString(),
      })
      .eq("org_id", t.org_id)
      // not .neq(false): that skips rows where is_active is NULL
      .or("is_active.is.null,is_active.eq.true");
    if (error) throw new Error(`${t.name}: ${error.message}`);
  }
  console.log(`\n${toOff.length} store(s) op inactive gezet.`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
