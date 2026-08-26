/**
 * Give a store enough real rows to walk phase 4 end to end.
 *
 * Phase 4 is cycle-scoped: without a live cycle every one of its screens is
 * empty, which makes it the one phase that cannot be reviewed on a store
 * that has not started one. That is also the state every store is in before
 * its first cycle, so "empty" is not an edge case — it is the beginning.
 *
 * This seeds the minimum a cycle needs and then starts one: a topic with
 * five boards, five URLs with reasons, keywords with volume, and one URL
 * fully assigned so all twenty-two tasks are live and clickable through
 * steps 4.1 to 4.4.
 *
 * The URLs are fictitious and the org is named in the log before anything
 * is written. It refuses to touch a store that already has cycles running,
 * because overwriting real production work to make a demo is not a trade
 * worth making.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/seed-phase4-walkthrough.ts <orgId>
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/seed-phase4-walkthrough.ts <orgId> --remove
 */
import "dotenv/config";
import { Client } from "pg";

const orgId = process.argv[2];
const REMOVE = process.argv.includes("--remove");
if (!orgId) {
  console.error("usage: seed-phase4-walkthrough.ts <orgId> [--remove]");
  process.exit(1);
}

const TOPIC = "Everyday essentials";
const BOARDS = [
  "Everyday Essentials Edit",
  "Everyday Essentials Inspiration",
  "Everyday Essentials Ideas",
  "Everyday Essentials Styling",
  "Everyday Essentials Guide",
];
const URLS: Array<[string, string, string, string]> = [
  // name, path, reason, funnel stage
  ["Everyday Edit",        "/collections/everyday-edit",   "BEST_PERFORMER", "TOP"],
  ["Weekend Layers",       "/collections/weekend-layers",  "NEW",            "MIDDLE"],
  ["Starter Set",          "/collections/starter-set",     "STOCK_PUSH",     "BOTTOM"],
  ["How To Layer",         "/blogs/how-to-layer",          "CLIENT_REQUEST", "TOP"],
  ["Gift Edit Under 50",   "/collections/gift-under-50",   "SEASONAL",       "MIDDLE"],
];
const KEYWORDS: Array<[string, number]> = [
  ["everyday jewellery", 33000],
  ["layered necklace set", 12400],
  ["minimal gold hoops", 9800],
  ["starter jewellery set", 4100],
  ["how to layer necklaces", 6600],
];

/**
 * Board descriptions carry keywords for Pinterest search, so the table
 * enforces 400 to 500 characters. A one-line placeholder is rejected, and
 * padding to length with filler would seed exactly the kind of description
 * the SOP exists to prevent — so these read like the real thing.
 */
function boardDescription(board: string): string {
  const text =
    `${board} for everyday gold jewellery that is made to be worn daily rather than saved for occasions. ` +
    `Layered necklace sets, minimal gold hoops, signet rings and stacking bands photographed on skin in ` +
    `daylight, so you can see how a piece actually sits before you buy it. Ideas for building a starter ` +
    `set, styling three ways, mixing metals without it looking accidental, and keeping solid gold looking ` +
    `new. Saved here for anyone putting together a collection they will still wear in five years.`;
  // Trimmed rather than padded: over the ceiling is as invalid as under it,
  // and a description cut mid-word is worse than one cut at a sentence.
  if (text.length <= 500) return text;
  const cut = text.slice(0, 497);
  return cut.slice(0, cut.lastIndexOf(" ")) + "...";
}

(async () => {
  const c = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  const org = await c.query<{ name: string; domain: string | null }>(
    `SELECT o.name, s.domain
       FROM public.organizations o
       LEFT JOIN organic.client_settings s ON s.org_id = o.id
      WHERE o.id = $1`, [orgId]);
  if (org.rowCount === 0) throw new Error(`no org ${orgId}`);
  const { name } = org.rows[0];
  const domain = org.rows[0].domain ?? "https://example-store.com";
  console.log(`${REMOVE ? "Removing walkthrough data from" : "Seeding phase-4 walkthrough into"}: ${name}`);

  const urlNames = URLS.map(([n]) => n);

  if (REMOVE) {
    const steps: Array<[string, string]> = [
      ["cycle tasks", `DELETE FROM organic.client_tasks
          WHERE org_id = $1 AND cycle IN (
            SELECT 'URL-' || left(id::text, 8) FROM organic.urls
             WHERE org_id = $1 AND name = ANY($2))`],
      ["url_boards", `DELETE FROM organic.url_boards WHERE url_id IN (
            SELECT id FROM organic.urls WHERE org_id = $1 AND name = ANY($2))`],
      ["url_keywords", `DELETE FROM organic.url_keywords WHERE url_id IN (
            SELECT id FROM organic.urls WHERE org_id = $1 AND name = ANY($2))`],
      ["urls", `DELETE FROM organic.urls WHERE org_id = $1 AND name = ANY($2)`],
      ["boards", `DELETE FROM organic.boards WHERE org_id = $1 AND name = ANY($3)`],
      ["keywords", `DELETE FROM organic.keywords WHERE org_id = $1 AND term = ANY($4)`],
      ["topic", `DELETE FROM organic.topics WHERE org_id = $1 AND name = $5`],
    ];
    for (const [label, sql] of steps) {
      const r = await c.query(sql, [orgId, urlNames, BOARDS, KEYWORDS.map(([t]) => t), TOPIC]);
      if (r.rowCount) console.log(`  ${label}: ${r.rowCount}`);
    }
    console.log("Removed.");
    await c.end();
    return;
  }

  const live = await c.query<{ n: string }>(
    `SELECT COUNT(DISTINCT cycle)::text AS n FROM organic.client_tasks
      WHERE org_id = $1 AND cycle LIKE 'URL-%'
        AND cycle NOT IN (SELECT 'URL-' || left(id::text, 8) FROM organic.urls
                           WHERE org_id = $1 AND name = ANY($2))`, [orgId, urlNames]);
  if (Number(live.rows[0].n) > 0) {
    throw new Error(
      `${name} already has ${live.rows[0].n} cycle(s) running that this script did not create. ` +
      `Refusing to touch it — pick a store without live cycles.`
    );
  }

  await c.query(`INSERT INTO organic.client_settings (org_id) VALUES ($1) ON CONFLICT DO NOTHING`, [orgId]);

  const topic = await c.query<{ id: string }>(
    `INSERT INTO organic.topics (org_id, name) VALUES ($1, $2)
     ON CONFLICT DO NOTHING RETURNING id::text`, [orgId, TOPIC]);
  const topicId = topic.rows[0]?.id ?? (await c.query<{ id: string }>(
    `SELECT id::text FROM organic.topics WHERE org_id = $1 AND name = $2`, [orgId, TOPIC])).rows[0].id;

  // Five boards, each with enough pins to clear the ten-pin context floor —
  // otherwise the cycle opens with a "thin context" deviation that has
  // nothing to do with what is being demonstrated.
  const boardIds: string[] = [];
  for (const b of BOARDS) {
    const r = await c.query<{ id: string }>(
      `INSERT INTO organic.boards (org_id, topic_id, name, description, status, pin_count, origin)
       VALUES ($1,$2,$3,$4,'PROTECTED'::organic.board_status,24,'KEYWORD_BANK'::organic.board_origin)
       ON CONFLICT DO NOTHING RETURNING id::text`,
      [orgId, topicId, b, boardDescription(b)]);
    boardIds.push(r.rows[0]?.id ?? (await c.query<{ id: string }>(
      `SELECT id::text FROM organic.boards WHERE org_id = $1 AND name = $2`, [orgId, b])).rows[0].id);
  }

  const kwIds: string[] = [];
  for (const [term, volume] of KEYWORDS) {
    await c.query(
      `INSERT INTO organic.keyword_volume_cache (term, volume, not_found, looked_up_at, looked_up_for_org)
       VALUES ($1,$2,false,now(),$3)
       ON CONFLICT (term) DO UPDATE SET volume = EXCLUDED.volume, looked_up_at = now()`,
      [term, volume, orgId]);
    const r = await c.query<{ id: string }>(
      `INSERT INTO organic.keywords (org_id, term, type, source, volume_validated)
       VALUES ($1,$2,'TOPIC_CLUSTER'::organic.keyword_type,'MANUAL'::organic.keyword_source,true)
       ON CONFLICT DO NOTHING RETURNING id::text`, [orgId, term]);
    kwIds.push(r.rows[0]?.id ?? (await c.query<{ id: string }>(
      `SELECT id::text FROM organic.keywords WHERE org_id = $1 AND term = $2`, [orgId, term])).rows[0].id);
  }

  const urlIds: string[] = [];
  for (const [n, path, reason, stage] of URLS) {
    const r = await c.query<{ id: string }>(
      `INSERT INTO organic.urls (org_id, topic_id, url, type, funnel_stage, name, reason, reason_note, is_seasonal)
       VALUES ($1,$2,$3,'COLLECTION'::organic.url_type,$4::organic.funnel_stage,$5,
               $6::organic.url_reason, $7, $8)
       ON CONFLICT DO NOTHING RETURNING id::text`,
      [orgId, topicId, `${domain}${path}`, stage, n, reason,
       `Seeded for the phase 4 walkthrough — ${reason.toLowerCase().replace("_", " ")}.`,
       reason === "SEASONAL"]);
    urlIds.push(r.rows[0]?.id ?? (await c.query<{ id: string }>(
      `SELECT id::text FROM organic.urls WHERE org_id = $1 AND name = $2`, [orgId, n])).rows[0].id);
  }

  // Every URL fully assigned, so the picker shows several ready to start
  // rather than one — the readiness panel is worth seeing with a choice in
  // it. The first one gets the live cycle.
  for (const urlId of urlIds) {
    await c.query(`DELETE FROM organic.url_boards WHERE url_id = $1`, [urlId]);
    for (let i = 0; i < boardIds.length; i++) {
      await c.query(
        `INSERT INTO organic.url_boards (url_id, board_id, position) VALUES ($1,$2,$3)`,
        [urlId, boardIds[i], i]);
    }
    await c.query(`DELETE FROM organic.url_keywords WHERE url_id = $1`, [urlId]);
    for (let i = 0; i < kwIds.length; i++) {
      await c.query(
        `INSERT INTO organic.url_keywords (url_id, keyword_id, is_primary) VALUES ($1,$2,$3)`,
        [urlId, kwIds[i], i === 0]);
    }
  }

  const cycle = `URL-${urlIds[0].slice(0, 8)}`;
  await c.query(
    `INSERT INTO organic.client_tasks (org_id, task_id, cycle, status)
     SELECT $1, td.id, $2, 'TODO'::organic.task_status
       FROM organic.task_definitions td
      WHERE td.phase = 4 AND td.active
     ON CONFLICT (org_id, task_id, cycle) DO NOTHING`,
    [orgId, cycle]);

  const counts = await c.query<{ tasks: string; steps: string }>(
    `SELECT COUNT(*)::text AS tasks, COUNT(DISTINCT td.step)::text AS steps
       FROM organic.client_tasks ct JOIN organic.task_definitions td ON td.id = ct.task_id
      WHERE ct.org_id = $1 AND ct.cycle = $2`, [orgId, cycle]);

  console.log(`  topic:    ${TOPIC}`);
  console.log(`  boards:   ${boardIds.length}`);
  console.log(`  keywords: ${kwIds.length}`);
  console.log(`  urls:     ${urlIds.length} (all five boards + five keywords assigned)`);
  console.log(`  cycle:    ${cycle} on "${URLS[0][0]}"`);
  console.log(`  tasks:    ${counts.rows[0].tasks} across ${counts.rows[0].steps} steps (4.1 - 4.4)`);
  console.log(`\nOpen: /client/${orgId}/phase/4`);
  await c.end();
})().catch((e) => {
  console.error("failed:", (e as Error).message);
  process.exit(1);
});
