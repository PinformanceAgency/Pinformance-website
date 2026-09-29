/**
 * Does the delivery deck say what the database says?
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/check-delivery-meeting.ts 2026-09-29
 *
 * Reads the run rows for that Tuesday (run the pipeline first, --dry-run is
 * fine) and checks, per store, two things — the same idea as
 * check-invoice-month.ts:
 *
 *   1. AMOUNTS. week / prev week / month to date, spend and revenue, against a
 *      plain SQL SUM over pinterest_metrics_snapshots (account level) for the
 *      same dates. The deck's revenue is × revenue_multiplier, so the SUM is
 *      too. Stores whose figures came from monday are listed, not checked:
 *      the database has nothing to compare them with.
 *   2. PILLS. Month on track, week ROAS and week volume against
 *      computeStoreRanking() for the same periods — the page the buyers look
 *      at. Only for stores without a multiplier or a blend, where the two are
 *      meant to be identical; the others are named with the reason.
 *
 * Read-only. Exits 1 on any difference.
 */
import "dotenv/config";
import { Client, types } from "pg";
import { createClient } from "@supabase/supabase-js";
import { computeStoreRanking } from "../src/lib/media-buying/store-ranking";
import type { RunRow } from "../src/lib/delivery-meeting/types";

types.setTypeParser(1082, (v) => v);

const date = process.argv[2];
if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error("Usage: check-delivery-meeting.ts <meeting Tuesday YYYY-MM-DD>");
  process.exit(1);
}

(async () => {
  const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const { data: runs, error } = await supa.from("delivery_meeting_runs").select("*").eq("meeting_date", date);
  if (error) throw error;
  if (!runs?.length) {
    console.error(`No runs for ${date}. Run: npx tsx scripts/delivery-meeting.ts compute --date ${date}`);
    process.exit(1);
  }

  const pg = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await pg.connect();
  let bad = 0;
  let checked = 0;
  const skipped: string[] = [];
  try {
    for (const run of runs as RunRow[]) {
      const p = run.payload;
      const per = p.periods;
      if (!per || !p.stores || !p.deck_data) {
        console.log(`${run.stream}: not computed yet (stage ${run.stage}) — skipped`);
        continue;
      }
      const ranking = await computeStoreRanking(supa, per);
      const rank = new Map(ranking.map((r) => [r.org_id, r]));
      console.log(`\n${run.stream} · week ${per.week_start}..${per.week_end} · prev ${per.prev_week_start}..${per.prev_week_end} · month ${per.month_start}..${per.month_end}`);

      for (const s of p.stores) {
        if (s.source !== "dashboard") {
          skipped.push(`${s.name} (${s.source})`);
          continue;
        }
        const { rows } = await pg.query(
          `SELECT
             COALESCE(SUM(spend)   FILTER (WHERE snapshot_date BETWEEN $2 AND $3), 0)::float8 AS w_spend,
             COALESCE(SUM(revenue) FILTER (WHERE snapshot_date BETWEEN $2 AND $3), 0)::float8 AS w_rev,
             COALESCE(SUM(spend)   FILTER (WHERE snapshot_date BETWEEN $4 AND $5), 0)::float8 AS p_spend,
             COALESCE(SUM(revenue) FILTER (WHERE snapshot_date BETWEEN $4 AND $5), 0)::float8 AS p_rev,
             COALESCE(SUM(spend)   FILTER (WHERE snapshot_date BETWEEN $6 AND $7), 0)::float8 AS m_spend,
             COALESCE(SUM(revenue) FILTER (WHERE snapshot_date BETWEEN $6 AND $7), 0)::float8 AS m_rev
           FROM pinterest_metrics_snapshots
           WHERE entity_type = 'account' AND org_id = ANY($1::uuid[])`,
          [s.org_ids, per.week_start, per.week_end, per.prev_week_start, per.prev_week_end, per.month_start, per.month_end],
        );
        const q = rows[0];
        const m = s.multiplier;
        const pairs: [string, number, number][] = [
          ["week spend", s.week.spend, q.w_spend],
          ["week revenue", s.week.revenue, q.w_rev * m],
          ["prev spend", s.prev.spend, q.p_spend],
          ["prev revenue", s.prev.revenue, q.p_rev * m],
          ["month spend", s.month.spend, q.m_spend],
          ["month revenue", s.month.revenue, q.m_rev * m],
        ];
        const diffs = pairs.filter(([, a, b]) => Math.abs(a - b) > 0.01);
        checked++;
        if (diffs.length) {
          bad++;
          console.log(`  ✗ ${s.name}: ${diffs.map(([k, a, b]) => `${k} deck ${a.toFixed(2)} vs SQL ${b.toFixed(2)}`).join("; ")}`);
        }

        // pills against the Store Ranking page
        const row = p.deck_data[s.deck]?.stores.find((r) => r.key === s.key);
        const r = rank.get(s.org_ids[0]);
        if (!row || !r) continue;
        if (s.org_ids.length > 1 || m !== 1) {
          skipped.push(`${s.name} (pills: ${m !== 1 ? `revenue × ${m}` : "blend"} — differs from the page by design)`);
          continue;
        }
        const pill: [string, boolean, boolean][] = [
          ["month on track", row.month_ok, r.month.on_track],
          ["week ROAS", row.wk_roas_ok, r.week.roas_on_track],
          ["week volume", row.wk_rev_ok, r.week.volume_on_track],
        ];
        const off = pill.filter(([, a, b]) => a !== b);
        if (off.length) {
          bad++;
          console.log(`  ✗ ${s.name}: ${off.map(([k, a, b]) => `${k} deck ${a} vs Store Ranking ${b}`).join("; ")}`);
        }
      }
      for (const deck of p.decks ?? []) {
        const d = p.deck_data[deck.key];
        console.log(`  ${deck.label}: ${d.stores.length} stores, monthly goal ${d.goal.cards[0].now}/${d.goal.cards[0].target}, weekly ${d.goal.cards[1].now}/${d.goal.cards[1].target}, first store ${d.stores[0]?.name}`);
      }
    }
  } finally {
    await pg.end();
  }
  if (skipped.length) console.log(`\nNot checked against the database: ${skipped.join(", ")}`);
  console.log(`\n${checked} stores checked, ${bad} with a difference.`);
  process.exit(bad ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
