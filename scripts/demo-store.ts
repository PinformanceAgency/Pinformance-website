/**
 * A fully worked demo store, so the app can be judged with data in it.
 *
 * Every organic screen is built for a store with history — cohorts,
 * sparklines, coverage matrices, margin. Abbey has none of that, so the
 * screens have only ever been seen in their empty state, which is the
 * wrong thing to design against.
 *
 * This seeds one coherent store: seven months in, jewellery, doing well
 * but with real problems (one topic short of coverage, high-volume
 * keywords never deployed, two failed pins, a client who has been sitting
 * on an approval). The defects are deliberate — a demo where everything
 * is green shows none of the screens that matter.
 *
 *   npx tsx scripts/demo-store.ts          seed (idempotent)
 *   npx tsx scripts/demo-store.ts --remove delete it and everything under it
 *
 * The org is named with a DEMO prefix and a fixed uuid so it can never be
 * confused with a real client and removal can never hit one.
 */
import "dotenv/config";
import { Client } from "pg";

const ORG_ID = "d3e70000-0000-4000-8000-00000000dem0".replace("dem0", "de00");
const ORG_NAME = "DEMO · Vellora Atelier";
const ORG_SLUG = "demo-vellora-atelier";

const db = () =>
  new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

/* ------------------------------------------------------------------ *
 * Deterministic pseudo-randomness
 * ------------------------------------------------------------------ */

// Seeded so re-running produces the same store. A demo that changes shape
// on every run is impossible to talk about with someone else.
let rngState = 20260825;
const rnd = () => {
  rngState = (rngState * 1103515245 + 12345) % 2147483648;
  return rngState / 2147483648;
};
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)];
const between = (lo: number, hi: number) => lo + rnd() * (hi - lo);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
};

/* ------------------------------------------------------------------ *
 * The store's shape
 * ------------------------------------------------------------------ */

const TOPICS = [
  { name: "Gold jewellery",      boards: 6 },
  { name: "Bridal",              boards: 5 },
  { name: "Everyday stacking",   boards: 5 },
  { name: "Gifting",             boards: 5 },
  // Deliberately short: this is what the coverage matrix exists to catch,
  // and it blocks phase 4 for anything under it.
  { name: "Pearls",              boards: 3 },
];

const BOARD_WORDS = [
  "Edit", "Inspiration", "Ideas", "Styling", "Guide", "Looks",
  "Moodboard", "Collection", "Favourites", "Picks",
];

const KEYWORDS = [
  ["gold hoop earrings", 48000], ["bridal jewellery", 31000], ["stacking rings", 22000],
  ["pearl necklace", 19500], ["minimal gold necklace", 14000], ["gift for her jewellery", 12800],
  ["signet ring", 9100], ["layered necklace", 7400], ["birthstone ring", 6900],
  ["chunky gold chain", 5100], ["ear stack ideas", 3300], ["gold anklet", 2200],
  ["dainty gold jewellery", 17600], ["wedding earrings", 15200], ["engagement ring stack", 8800],
  ["everyday earrings", 11300], ["pearl drop earrings", 6100], ["gold huggie hoops", 9700],
  ["jewellery gift guide", 5400], ["minimalist rings", 13100], ["bridal hair jewellery", 4200],
  ["gold bracelet stack", 7800], ["initial necklace", 21000], ["tennis bracelet", 26000],
  ["vintage gold rings", 4700], ["mixed metal jewellery", 3100], ["ear cuff", 8300],
  ["pearl bracelet", 5600], ["statement earrings", 18400], ["jewellery storage", 2900],
] as const;

const URLS = [
  ["Gold Hoops Collection",  "COLLECTION", "BEST_PERFORMER", "TOP"],
  ["Bridal Edit",            "COLLECTION", "SEASONAL",       "MIDDLE"],
  ["Autumn Stacking Edit",   "COLLECTION", "NEW",            "TOP"],
  ["Signet Rings",           "COLLECTION", "BEST_PERFORMER", "MIDDLE"],
  ["Pearl Drops",            "PRODUCT",    "NEW",            "BOTTOM"],
  ["Gift Guide Under 100",   "BLOG",       "SEASONAL",       "TOP"],
  ["Initial Necklaces",      "COLLECTION", "CLIENT_REQUEST", "MIDDLE"],
  ["Tennis Bracelets",       "COLLECTION", "STOCK_PUSH",     "BOTTOM"],
  ["Everyday Earrings",      "COLLECTION", "BEST_PERFORMER", "TOP"],
  ["Care & Cleaning Guide",  "BLOG",       "NEW",            "TOP"],
  ["Ear Stack Builder",      "GALLERY",    "AB_TEST",        "MIDDLE"],
  ["Wedding Guest Edit",     "SELECTION",  "SEASONAL",       "MIDDLE"],
] as const;

const COMPETITORS = [
  ["Astrid & Miyu", "astridandmiyu", 4.2, "ACTIVE"],
  ["Missoma", "missoma", 3.6, "ACTIVE"],
  ["Monica Vinader", "monicavinader", 2.9, "ACTIVE"],
  ["Daisy London", "daisylondon", 1.4, "SEMI_ACTIVE"],
  ["Otiumberg", "otiumberg", 0.8, "SEMI_ACTIVE"],
  ["Edge of Ember", "edgeofember", 0.2, "DORMANT"],
] as const;

/* ------------------------------------------------------------------ */

async function remove(c: Client) {
  console.log(`Removing ${ORG_NAME} …`);
  // Ordered by dependency. Everything is org-scoped, so this cannot reach
  // a real store even if a foreign key were missing.
  const steps: Array<[string, string]> = [
    ["pin_performance", `DELETE FROM organic.pin_performance WHERE pin_id IN (
        SELECT p.id FROM organic.pins p JOIN organic.waterfalls w ON w.id = p.waterfall_id WHERE w.org_id = $1)`],
    ["pins",            `DELETE FROM organic.pins WHERE waterfall_id IN (SELECT id FROM organic.waterfalls WHERE org_id = $1)`],
    // Generated copy and AI drafts hang off designs, so they have to go
    // before the designs do — and they were absent from this list entirely,
    // which meant a reseed left orphaned copy behind pointing at designs
    // that no longer existed.
    ["copy_sets",       `DELETE FROM organic.copy_sets WHERE design_id IN (
        SELECT d.id FROM organic.designs d JOIN organic.waterfalls w ON w.id = d.waterfall_id WHERE w.org_id = $1)`],
    ["ai_drafts",       `DELETE FROM organic.ai_drafts WHERE org_id = $1`],
    ["designs",         `DELETE FROM organic.designs WHERE waterfall_id IN (SELECT id FROM organic.waterfalls WHERE org_id = $1)`],
    ["waterfalls",      `DELETE FROM organic.waterfalls WHERE org_id = $1`],
    ["url_boards",      `DELETE FROM organic.url_boards WHERE url_id IN (SELECT id FROM organic.urls WHERE org_id = $1)`],
    ["url_keywords",    `DELETE FROM organic.url_keywords WHERE url_id IN (SELECT id FROM organic.urls WHERE org_id = $1)`],
    ["urls",            `DELETE FROM organic.urls WHERE org_id = $1`],
    ["boards",          `DELETE FROM organic.boards WHERE org_id = $1`],
    ["keywords",        `DELETE FROM organic.keywords WHERE org_id = $1`],
    ["topics",          `DELETE FROM organic.topics WHERE org_id = $1`],
    ["competitors",     `DELETE FROM organic.competitors WHERE org_id = $1`],
    ["taste_graph",     `DELETE FROM organic.taste_graph WHERE org_id = $1`],
    ["assets",          `DELETE FROM organic.assets WHERE org_id = $1`],
    ["task_answers",    `DELETE FROM organic.task_answers WHERE org_id = $1`],
    ["client_tasks",    `DELETE FROM organic.client_tasks WHERE org_id = $1`],
    ["client_viability",`DELETE FROM organic.client_viability WHERE org_id = $1`],
    ["brand_rules",     `DELETE FROM organic.brand_rules WHERE org_id = $1`],
    ["client_intake",   `DELETE FROM organic.client_intake WHERE org_id = $1`],
    ["grid_analyses",   `DELETE FROM organic.grid_analyses WHERE org_id = $1`],
    ["market_items",    `DELETE FROM organic.market_analysis_items WHERE org_id = $1`],
    ["baseline_kpis",   `DELETE FROM organic.baseline_kpis WHERE org_id = $1`],
    ["monthly_kpis",    `DELETE FROM organic.monthly_kpis WHERE org_id = $1`],
    ["monthly_reports", `DELETE FROM organic.monthly_reports WHERE org_id = $1`],
    ["client_settings", `DELETE FROM organic.client_settings WHERE org_id = $1`],
    ["organization",    `DELETE FROM public.organizations WHERE id = $1`],
  ];
  for (const [label, sql] of steps) {
    const r = await c.query(sql, [ORG_ID]);
    if (r.rowCount) console.log(`  ${label}: ${r.rowCount}`);
  }
  // Cache rows are shared across stores, so only the ones this store
  // introduced go — anything another store also holds stays put.
  const cache = await c.query(
    `DELETE FROM organic.keyword_volume_cache c
      WHERE c.looked_up_for_org = $1
        AND NOT EXISTS (SELECT 1 FROM organic.keywords k WHERE k.term = c.term)`, [ORG_ID]);
  if (cache.rowCount) console.log(`  keyword_volume_cache: ${cache.rowCount}`);
  console.log("Removed.");
}

/* ------------------------------------------------------------------ */

async function seed(c: Client) {
  console.log(`Seeding ${ORG_NAME} …`);
  await remove(c);   // idempotent: always rebuild from clean

  const onboarded = daysAgo(214);          // ~7 months in

  await c.query(
    `INSERT INTO public.organizations (id, name, slug, onboarding_step, onboarding_completed_at, settings)
     VALUES ($1, $2, $3, 5, now(), '{"pins_per_day":5,"auto_approve":false,"timezone":"Europe/Amsterdam"}'::jsonb)`,
    [ORG_ID, ORG_NAME, ORG_SLUG]);

  await c.query(
    `INSERT INTO organic.client_settings
       (org_id, engagement_status, niche, account_class, spacing_hours, daily_pin_target,
        onboarded_date, domain, display_name, bio, urls_per_month, url_cooldown_days,
        monthly_retainer, retainer_currency, hourly_cost, account_created_date, last_activity_date)
     VALUES ($1,'ACTIVE','Fine jewellery','ESTABLISHED',24,5,$2,
             'vellora-atelier.com','Vellora Atelier',
             'Handmade fine jewellery from Antwerp. Gold, pearls, and pieces made to be stacked.',
             2, 90, 3500, 'EUR', 65, $3, current_date)`,
    [ORG_ID, iso(onboarded), iso(daysAgo(900))]);

  /* ---- topics & boards ------------------------------------------- */
  const topicIds: Record<string, string> = {};
  for (const t of TOPICS) {
    const r = await c.query<{ id: string }>(
      `INSERT INTO organic.topics (org_id, name) VALUES ($1,$2) RETURNING id::text`, [ORG_ID, t.name]);
    topicIds[t.name] = r.rows[0].id;
  }

  const boardIds: string[] = [];
  for (const t of TOPICS) {
    for (let i = 0; i < t.boards; i++) {
      const name = `${t.name} ${pick(BOARD_WORDS)}${i ? ` ${i + 1}` : ""}`;
      // A couple of boards deliberately sit under ten pins — that is the
      // leak the overview is built to surface.
      const pins = i === t.boards - 1 && rnd() > 0.55
        ? Math.round(between(3, 9))
        : Math.round(between(14, 68));
      const created = daysAgo(Math.round(between(60, 190)));
      const r = await c.query<{ id: string }>(
        `INSERT INTO organic.boards
           (org_id, topic_id, name, primary_keyword, keywords, breadth, origin, status,
            pin_count, pinterest_board_id, created_on_pinterest, seeded_at, seeded_count, seed_source)
         VALUES ($1,$2,$3,$4,$5,$6,'KEYWORD_BANK','PROTECTED',$7,$8,$9::date,$9::timestamptz,$10,'EXISTING_PINS')
         RETURNING id::text`,
        [ORG_ID, topicIds[t.name], name, KEYWORDS[Math.floor(rnd() * KEYWORDS.length)][0],
         [KEYWORDS[Math.floor(rnd() * KEYWORDS.length)][0]],
         i < 2 ? "BROAD" : "NICHE",
         pins, `demo-board-${boardIds.length + 1}`, iso(created), Math.round(pins * 0.6)]);
      boardIds.push(r.rows[0].id);
    }
  }

  /* ---- keywords + shared volume cache ----------------------------- */
  const keywordIds: string[] = [];
  for (const [term, vol] of KEYWORDS) {
    await c.query(
      `INSERT INTO organic.keyword_volume_cache
         (term, volume, looked_up_at, looked_up_for_org, expires_at, not_found)
       VALUES ($1,$2,$3,$4,$5,false)
       ON CONFLICT (term) DO NOTHING`,
      [term, vol, iso(daysAgo(Math.round(between(10, 160)))), ORG_ID, iso(daysAgo(-200))]);
    const r = await c.query<{ id: string }>(
      `INSERT INTO organic.keywords
         (org_id, term, type, source, volume_validated, seasonal_type, autocomplete_rank, created_at)
       VALUES ($1,$2,$3,'PINCLICKS',true,$4,$5,$6) RETURNING id::text`,
      [ORG_ID, term,
       vol > 20000 ? "GENERIC" : "TOPIC_CLUSTER",
       /bridal|wedding|gift/.test(term) ? "SEASONAL" : "EVERGREEN",
       Math.round(between(1, 9)), iso(daysAgo(Math.round(between(40, 200))))]);
    keywordIds.push(r.rows[0].id);
  }

  /* ---- URLs ------------------------------------------------------- */
  const urlIds: string[] = [];
  for (let i = 0; i < URLS.length; i++) {
    const [name, type, reason, funnel] = URLS[i];
    // Roughly a third are still resting, so the cooldown timeline has
    // something to show on all three of its groups.
    const lastEnd = i < 8 ? daysAgo(Math.round(between(20, 150))) : null;
    const cooldown = lastEnd && i < 4 ? daysAgo(Math.round(between(-70, -5))) : null;
    const r = await c.query<{ id: string }>(
      `INSERT INTO organic.urls
         (org_id, topic_id, url, type, funnel_stage, name, reason, is_seasonal,
          last_waterfall_end, cooldown_until, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id::text`,
      [ORG_ID, topicIds[TOPICS[i % TOPICS.length].name],
       `https://vellora-atelier.com/${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
       type, funnel, name, reason, reason === "SEASONAL",
       lastEnd ? iso(lastEnd) : null, cooldown ? iso(cooldown) : null,
       iso(daysAgo(Math.round(between(60, 200))))]);
    urlIds.push(r.rows[0].id);

    // Keyword and board assignments, so the library screens are populated.
    for (let k = 0; k < 3; k++) {
      await c.query(
        `INSERT INTO organic.url_keywords (url_id, keyword_id, is_primary)
         VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [r.rows[0].id, keywordIds[(i * 3 + k) % keywordIds.length], k === 0]);
    }
    for (let b = 0; b < 4; b++) {
      await c.query(
        `INSERT INTO organic.url_boards (url_id, board_id, position)
         VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [r.rows[0].id, boardIds[(i * 4 + b) % boardIds.length], b + 1]);
    }
  }

  /* ---- waterfalls, designs, pins ---------------------------------- */
  const WATERFALLS: Array<[number, string, number]> = [
    // [url index, status, started days ago]
    [0, "COMPLETED", 172], [1, "COMPLETED", 138], [2, "COMPLETED", 104],
    [3, "COMPLETED", 70],  [8, "RUNNING",    26],  [4, "PRODUCTION", 6],
  ];
  const publishedPins: Array<{ id: string; day: number }> = [];

  for (const [ui, status, startedAgo] of WATERFALLS) {
    const start = daysAgo(startedAgo);
    const wf = await c.query<{ id: string }>(
      `INSERT INTO organic.waterfalls (org_id, url_id, status, start_date, end_date, spacing_hours)
       VALUES ($1,$2,$3,$4,$5,24) RETURNING id::text`,
      [ORG_ID, urlIds[ui], status, iso(start),
       status === "COMPLETED" ? iso(daysAgo(startedAgo - 16)) : null]);

    for (let d = 1; d <= 4; d++) {
      const design = await c.query<{ id: string }>(
        `INSERT INTO organic.designs
           (waterfall_id, design_number, intent, route, qc_status, text_overlay_keyword, fresh_technique)
         VALUES ($1,$2,$3,'AI_GENERATED','APPROVED',$4,$5) RETURNING id::text`,
        [wf.rows[0].id, d, d <= 2 ? "SAVE" : "CLICK",
         KEYWORDS[(ui * 4 + d) % KEYWORDS.length][0], pick(["CROP", "OVERLAY", "FILTER", "TEXT_SWAP"])]);

      for (let v = 0; v < 4; v++) {
        const seq = (d - 1) * 4 + v + 1;
        const dayOffset = startedAgo - (seq - 1);
        const scheduled = daysAgo(Math.max(-14, dayOffset));
        // A running waterfall is part published, part still queued; two
        // pins across the book have failed, which the cycle screen and
        // Today are both built to surface.
        let st = "PUBLISHED";
        if (status === "PRODUCTION") st = "PLANNED";
        else if (status === "RUNNING") st = seq <= 10 ? "PUBLISHED" : "SCHEDULED";
        if (status === "RUNNING" && (seq === 7 || seq === 9)) st = "FAILED";

        const pin = await c.query<{ id: string }>(
          `INSERT INTO organic.pins
             (waterfall_id, design_id, board_id, content_code, sequence_number, copy_variant,
              scheduled_date, scheduled_time, status, image_path, published_at, failure_reason)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id::text`,
          [wf.rows[0].id, design.rows[0].id, boardIds[(ui * 4 + v) % boardIds.length],
           `VA-${iso(scheduled).slice(2, 7).replace("-", "")}-${String(seq).padStart(2, "0")}`,
           seq, ["A", "B", "C", "D"][v], iso(scheduled),
           `${String(8 + (seq % 11)).padStart(2, "0")}:${pick(["00", "15", "30", "45"])}:00`,
           st, null,
           st === "PUBLISHED" ? iso(scheduled) : null,
           st === "FAILED"
             ? pick(["Pinterest 401 — token expired at push time",
                     "Board not found (renamed on Pinterest)"])
             : null]);
        if (st === "PUBLISHED" && dayOffset > 0) {
          publishedPins.push({ id: pin.rows[0].id, day: dayOffset });
        }
      }
    }
  }

  /* ---- daily performance ------------------------------------------
     The compounding curve is the whole argument for organic, so the
     series has to actually compound: a pin earns most in its first
     fortnight, then settles into a long tail that never quite dies. */
  let perfRows = 0;
  for (const p of publishedPins) {
    const rows: Array<[string, string, number, number, number]> = [];
    for (let age = 0; age < Math.min(p.day, 120); age++) {
      const measured = daysAgo(p.day - age);
      const peak = Math.exp(-Math.pow(age - 9, 2) / 210);      // early spike
      const tail = 0.30 + 0.45 * (1 - Math.exp(-age / 40));    // slow build
      const noise = 0.75 + rnd() * 0.5;
      const impressions = Math.round((240 * peak + 90 * tail) * noise);
      if (impressions < 4) continue;
      rows.push([p.id, iso(measured), impressions,
                 Math.round(impressions * between(0.018, 0.042)),
                 Math.round(impressions * between(0.006, 0.016))]);
    }
    if (rows.length) {
      // One multi-row statement per pin rather than one per day.
      const vals = rows.map((_, i) =>
        `($${i*5+1},$${i*5+2},$${i*5+3},$${i*5+4},$${i*5+5})`).join(",");
      await c.query(
        `INSERT INTO organic.pin_performance (pin_id, measured_on, impressions, saves, outbound_clicks)
         VALUES ${vals} ON CONFLICT DO NOTHING`, rows.flat());
      perfRows += rows.length;
    }
  }

  /* ---- baseline, monthly series, report --------------------------- */
  await c.query(
    `INSERT INTO organic.baseline_kpis
       (org_id, period, measured_from, measured_to, impressions, engagements, engagement_rate,
        outbound_clicks, pin_saves, profile_visits, monthly_views, followers_start, followers_end,
        page_visits, add_to_cart, checkouts, conversions, revenue, captured_at)
     VALUES ($1,'last_30d',$2,$3, 41200, 1180, 2.86, 214, 640, 380, 46000, 1240, 1310,
             196, 22, 4, 4, 410, now())`,
    [ORG_ID, iso(daysAgo(244)), iso(daysAgo(214))]);

  for (let m = 6; m >= 0; m--) {
    const d = new Date();
    d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - m);
    const month = iso(d);
    const g = 6 - m;                                  // months elapsed
    const grow = Math.pow(1.34, g);                   // compounding
    const partial = m === 0;
    const f = partial ? 0.8 : 1;
    await c.query(
      `INSERT INTO organic.monthly_kpis
         (org_id, month, outbound_clicks, pin_saves, page_visits, add_to_cart, checkouts,
          conversions, revenue, impressions, engagements, pin_clicks, engagement_rate, save_rate,
          other_impressions, other_saves, pins_published, boards_live, keywords_validated, urls_active,
          ga4_sessions, ga4_engagement_rate, ga4_session_seconds, ga4_pages_per_session, ga4_bounce_rate,
          ga4_site_engagement_rate, ga4_site_session_seconds, ga4_site_pages_per_session, ga4_site_bounce_rate,
          conversion_tag_firing, ga4_connected, is_partial, measured_at)
       VALUES ($1,$2::date,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
               $21,42.6,124,2.4,57.2, 28.5,61,1.5,71.4, true,true,$22, now())`,
      [ORG_ID, month,
       Math.round(232 * grow * f), Math.round(690 * grow * f), Math.round(214 * grow * f),
       Math.round(26 * grow * f), Math.round(6 * grow * f), Math.round(6 * grow * f),
       Math.round(640 * grow * f), Math.round(46000 * grow * f), Math.round(1320 * grow * f),
       Math.round(390 * grow * f), Number((2.9 + g * 0.22).toFixed(2)), Number((1.4 + g * 0.09).toFixed(2)),
       Math.round(3100 * grow * f), Math.round(120 * grow * f),
       Math.round(between(58, 92)), 18 + g, 60 + g * 11, 4 + Math.round(g / 2),
       Math.round(96 * grow * f), partial]);
  }

  // Derived from the rows just written rather than hand-typed, so the
  // sentence and the figures under it cannot disagree — which is exactly
  // the mismatch a client would notice first.
  const lastMonth = new Date(); lastMonth.setUTCDate(1);
  const hd = await c.query<{ clicks: number; revenue: string; prev: number }>(
    `SELECT outbound_clicks AS clicks, revenue,
            (SELECT outbound_clicks FROM organic.monthly_kpis
              WHERE org_id = $1 AND month = ($2::date - interval '1 month')::date) AS prev
       FROM organic.monthly_kpis WHERE org_id = $1 AND month = $2::date`,
    [ORG_ID, iso(lastMonth)]);
  const h = hd.rows[0];
  const up = h?.prev ? Math.round(((h.clicks - h.prev) / h.prev) * 100) : null;
  const headline =
    `Pinterest drove ${h.clicks.toLocaleString("en-US")} outbound clicks and ` +
    `€${Math.round(Number(h.revenue)).toLocaleString("en-US")} in attributed revenue this month` +
    (up !== null ? `, ${up >= 0 ? "up" : "down"} ${Math.abs(up)}% on last month` : "") +
    `, with the strongest performance from the Gold Hoops Collection.`;

  await c.query(
    `INSERT INTO organic.monthly_reports (org_id, month, headline_generated, headline_approved, next_month_notes, published_at)
     VALUES ($1,$2::date,$3,$3,$4, now())`,
    [ORG_ID, iso(lastMonth), headline,
     "Bridal season opens in six weeks, so the wedding-guest edit moves into production now rather than in November. " +
     "Two things worth doing on your side: the pearl range needs lifestyle photography before we can build boards under it, " +
     "and the gift guide would carry a newsletter well in the first week of December."]);

  /* ---- taste graph, competitors, assets --------------------------- */
  await c.query(
    `INSERT INTO organic.taste_graph
       (org_id, core_products, aesthetic_worlds, key_moments, content_angles, visual_worlds,
        moments_seasons, functional_outcome, aspirational_outcome)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [ORG_ID,
     ["Gold hoops", "Stacking rings", "Pearl drops", "Signet rings"],
     ["Warm minimalism", "Old-money quiet luxury", "Coastal European"],
     ["Wedding season", "Christmas gifting", "Everyday dressing"],
     ["How to stack", "What it looks like on", "Gifting made easy"],
     ["Sunlit linen and skin", "Antwerp studio", "Flat-lay on marble"],
     ["Bridal Apr–Sep", "Gifting Nov–Dec"],
     ["Jewellery that survives daily wear", "Pieces that layer with what they own"],
     ["Looking put together without trying", "Quietly expensive"]]);

  for (const [name, handle, ppd, status] of COMPETITORS) {
    await c.query(
      `INSERT INTO organic.competitors
         (org_id, name, profile_url, handle, pins_per_day_4mo, activity_status,
          consistency_score, analyzed_at, niche_fit)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [ORG_ID, name, `https://pinterest.com/${handle}`, handle, ppd, status,
       Math.round(between(4, 10)), iso(daysAgo(Math.round(between(20, 120)))),
       status === "ACTIVE" ? "STRONG" : status === "SEMI_ACTIVE" ? "PARTIAL" : "WEAK"]);
  }

  for (const [title, url, type, task] of [
    ["Account audit — Vellora", "https://docs.google.com/spreadsheets/d/demo-audit", "FLAGGED_PIN_REPORT", "P1.2.13"],
    ["Grid analysis · gold hoop earrings", "https://docs.google.com/spreadsheets/d/demo-grid", "GOOGLE_KEYWORD_LIST", "P2.1.3"],
    ["Competitor pin export (PinInspector)", "https://drive.google.com/file/d/demo-pins", "PININSPECTOR_EXPORT", "P2.1.6"],
    ["Board architecture plan", "https://www.figma.com/file/demo-boards", "MOODBOARD", "P3.3.1"],
  ] as const) {
    await c.query(
      `INSERT INTO organic.assets (org_id, title, url, type, source_tool, linked_task_id, uploaded_at)
       VALUES ($1,$2,$3,$4,'Google',$5,$6)`,
      [ORG_ID, title, url, type, task, iso(daysAgo(Math.round(between(30, 190))))]);
  }

  /* ---- tasks: phases 1-3 worked through, 4-5 in motion ------------ */
  await c.query(
    `INSERT INTO organic.client_tasks (org_id, task_id, status, time_spent_min, completed_at, notes)
     SELECT $1, td.id,
            CASE
              WHEN td.phase <= 2 THEN 'DONE'::organic.task_status
              WHEN td.phase = 3 AND td.step IN ('1','2') THEN 'DONE'::organic.task_status
              WHEN td.phase = 3 THEN 'TODO'::organic.task_status
              WHEN td.phase = 4 AND td.step = '1' THEN 'DONE'::organic.task_status
              WHEN td.phase = 4 THEN 'TODO'::organic.task_status
              ELSE 'TODO'::organic.task_status
            END,
            CASE WHEN td.phase <= 2 THEN 15 + (abs(hashtext(td.id)) % 55) ELSE NULL END,
            CASE WHEN td.phase <= 2 THEN now() - (abs(hashtext(td.id)) % 180) * interval '1 day' ELSE NULL END,
            NULL
       FROM organic.task_definitions td
      WHERE td.active AND td.phase <= 5`,
    [ORG_ID]);

  // Every status represented, in phase 3.
  //
  // Without this the store only ever holds DONE and TODO, so the phase ring
  // renders two of its six segments and there is no way to judge whether
  // "in review" is legible next to "in progress" — which is exactly the
  // kind of thing a demo store exists to answer before a client sees it.
  await c.query(
    `UPDATE organic.client_tasks SET status = 'IN_PROGRESS'::organic.task_status
      WHERE org_id = $1 AND task_id IN ('P3.2.1','P3.2.2','P3.2.3')`, [ORG_ID]);
  await c.query(
    `UPDATE organic.client_tasks SET status = 'REVIEW'::organic.task_status
      WHERE org_id = $1 AND task_id IN ('P3.3.1','P3.3.2')`, [ORG_ID]);
  await c.query(
    `UPDATE organic.client_tasks
        SET status = 'SKIPPED'::organic.task_status,
            skip_reason = 'NOT_APPLICABLE',
            skip_note = 'No group boards on this account.'
      WHERE org_id = $1 AND task_id = 'P3.3.3'`, [ORG_ID]);

  // A client who has been sitting on something for three weeks — the
  // agency execution screen has a panel that exists only for this.
  await c.query(
    `UPDATE organic.client_tasks
        SET waiting_on = 'CLIENT'::organic.waiting_on,
            waiting_since = $2::date,
            waiting_note = 'Waiting on lifestyle photography for the pearl range.'
      WHERE org_id = $1 AND task_id IN ('P3.3.6','P3.3.7')`,
    [ORG_ID, iso(daysAgo(23))]);

  /* ---- two live phase-4 cycles -----------------------------------
     The store had six waterfalls but zero cycle-scoped client_tasks, so
     loadCyclesForOrg() returned nothing and the whole Cycles panel — the
     setup card, the board and keyword pickers, the deviation warnings —
     rendered as "no active cycles". Six months of pins with no cycle to
     show them in.

     One cycle is deliberately off-structure: four boards where the method
     asks five, three of them from another topic. That is what the
     deviation panel exists to say out loud, and a demo where every cycle
     is clean never shows it. */
  {
    const urlRows = await c.query<{ id: string; name: string }>(
      `SELECT id::text, name FROM organic.urls WHERE org_id = $1 ORDER BY name LIMIT 2`, [ORG_ID]);
    for (const u of urlRows.rows) {
      await c.query(
        `INSERT INTO organic.client_tasks (org_id, task_id, cycle, status, completed_at)
         SELECT $1, td.id, $2,
                CASE WHEN td.step = '1' THEN 'DONE'::organic.task_status
                     ELSE 'TODO'::organic.task_status END,
                CASE WHEN td.step = '1' THEN now() - interval '6 days' ELSE NULL END
           FROM organic.task_definitions td
          WHERE td.phase = 4 AND td.active`,
        // The cycle key is URL- plus the first eight characters of the URL
        // id, matching startCycleForUrl(); the full uuid resolves to nothing.
        [ORG_ID, `URL-${u.id.slice(0, 8)}`]);
    }
  }

  /* ---- the research phase 4 actually reads ------------------------
     Without these the store demonstrates only the empty half of every
     screen: no brand book, no grid, no intake. The three grid rows carry
     three DIFFERENT text-overlay buckets on purpose — splitFromGrid()
     exists so the save/click split stops being one constant for every
     keyword, and a demo where every row lands on 80/20 proves nothing. */
  await c.query(
    `INSERT INTO organic.brand_rules
       (org_id, positioning, tone_descriptors, brand_pillars, never_include,
        banned_words, approved_ctas, dominant_colors, asset_locations)
     VALUES ($1,
       'Quiet luxury fine jewellery for women who buy for themselves.',
       ARRAY['warm','considered','unfussy'],
       ARRAY['Made to be worn daily','Solid gold, never plated','Small batch'],
       ARRAY['Discount badges','Stock photography'],
       ARRAY['cheap','bargain','sale','luxury for less'],
       ARRAY['Shop the edit','See the collection','Find your size'],
       ARRAY['#C8A96A','#F4EFE7','#1C1A17'],
       '{"typography":"Canela Deck / Sohne"}'::jsonb)`,
    [ORG_ID]);

  await c.query(
    `INSERT INTO organic.client_intake
       (org_id, contact_name, contact_email, products_services, ideal_audience,
        brand_personality, evergreen_topics, seasonal_promos,
        best_performing_content, primary_goals, completed_at)
     VALUES ($1, 'Manon Devos', 'manon@vellora-atelier.com',
       'Solid 14k gold everyday jewellery: hoops, signet rings, stacking bands, bridal.',
       'Women 28-45, buying for themselves, value longevity over trend.',
       'Understated, warm, never shouty.',
       ARRAY['Stacking','Bridal','Gifting','Jewellery care'],
       ARRAY['Christmas gifting','Wedding season'],
       'Instagram carousels showing one piece styled three ways.',
       ARRAY['TRAFFIC','SALES']::organic.marketing_goal[],
       now() - interval '200 days')`,
    [ORG_ID]);

  for (const [kw, aesthetic, simple, textHeavy, ctas, bucket, feel, h1, h2, h3] of [
    ['gold hoop earrings', true,  true,  false, false, 'MINIMAL', 'Clean daylight product shots on skin, very little text. Warm neutrals throughout.', '#D9C3A5', '#F6F1EA', '#2A2622'],
    ['bridal jewellery',   true,  false, false, true,  'HALF',    'Half editorial bridal portraits, half text-led "what to wear" pins with a CTA.',    '#EDE4DA', '#C9B79C', '#40382F'],
    ['stacking rings',     false, true,  true,  true,  'MOST',    'Text-led how-to pins dominate: numbered stacks, arrows, visible CTAs.',             '#E3D2BA', '#8C6F4E', '#FBF7F2'],
  ] as const) {
    await c.query(
      `INSERT INTO organic.grid_analyses
         (org_id, target_keyword, fmt_pure_aesthetic, fmt_simple_pins, fmt_text_heavy,
          fmt_infographics, fmt_video_916, has_visible_ctas, text_overlay_bucket,
          look_and_feel, hex_1, hex_2, hex_3, analyzed_at)
       VALUES ($1,$2,$3,$4,$5,false,false,$6,$7,$8,$9,$10,$11, now() - interval '180 days')`,
      [ORG_ID, kw, aesthetic, simple, textHeavy, ctas, bucket, feel, h1, h2, h3]);
  }

  // A REJECTED item has to carry a reason — the table enforces it, which is
  // what stops the review step from being a rubber stamp.
  for (const [kind, title, detail, status, reject] of [
    ['STEAL_LIST',    'Jewellery Care & Storage',          'Three of five competitors run this board and it outperforms their product boards.', 'APPROVED', null],
    ['STEAL_LIST',    'Ring Stacking Ideas',               'The highest-saving board in the competitor set.',                                   'APPROVED', null],
    ['BOARD_GAP',     'Gold Jewellery for Sensitive Skin', 'Real search demand, nobody in the set covers it.',                                  'APPROVED', null],
    ['CONTENT_ANGLE', 'What it looks like after a year',   'Longevity is the brand pillar and nobody is showing wear over time.',               'APPROVED', null],
    ['STEAL_LIST',    'Celebrity Jewellery Looks',         'Off-positioning for quiet luxury.',                                                 'REJECTED',
      'Clashes with the quiet-luxury positioning; the client does not want celebrity association.'],
  ] as const) {
    await c.query(
      `INSERT INTO organic.market_analysis_items
         (org_id, kind, title, detail, status, reject_reason, created_at, reviewed_at)
       VALUES ($1,$2,$3,$4,$5,$6, now() - interval '175 days', now() - interval '172 days')`,
      [ORG_ID, kind, title, detail, status, reject]);
  }

  /* ---- viability gate, answered with reasoning -------------------- */
  await c.query(
    `INSERT INTO organic.client_viability
       (org_id, visual_first, more_than_5_products, url_volume, high_aov, existing_assets,
        longterm_mindset, rf_technical_b2b, rf_local_only, rf_single_landing, rf_needs_sales_now,
        rf_low_effort_ds, rf_restricted_niche, total_urls_found, verdict, rationale, assessed_at)
     VALUES ($1,true,true,true,true,true,true,false,false,false,false,false,false,
             38,'STRONG_FIT',
             'All three good-fit signals, neither red flag, 38 usable URLs. Own photography, client has run SEO before and understands compounding — we can be ambitious here.',
             now())`,
    [ORG_ID]);

  const ANSWERS: Array<[string, string, boolean | null, string | null, number | null, string]> = [
    ["P1.0.1","visual_first",true,null,null,"Own studio and lifestyle photography, ~600 images on the brand drive. Jewellery shot on models in daylight — stops a scroll."],
    ["P1.0.1","more_than_5_products",true,null,null,"Five collections, 62 SKUs, plus a journal with 20 posts we can pin as ideas."],
    ["P1.0.1","url_volume",true,null,null,"Sitemap gives 38 usable URLs. Comfortable at two cycles a month with a 90-day cooldown."],
    ["P1.0.1","high_aov",true,null,null,"Client confirms AOV €140. Catalogue midpoint ~€120, so plausible."],
    ["P1.0.1","existing_assets",true,null,null,"Two 2025 shoots on the drive, model and flat-lay. Plenty for four designs per URL without commissioning."],
    ["P1.0.1","longterm_mindset",true,null,null,"Asked what failure looks like at two months — answer was 'nothing, we know this is slow'. They ran SEO for three years."],
    ["P1.0.2","rf_technical_b2b",false,null,null,"Consumer jewellery, DTC. No flag."],
    ["P1.0.2","rf_local_only",false,null,null,"Ships EU-wide from Antwerp. No flag."],
    ["P1.0.2","rf_single_landing",false,null,null,"Full Shopify store, 38 URLs. No flag."],
    ["P1.0.2","rf_needs_sales_now",false,null,null,"Profitable on paid social already. Treating Pinterest as a 2027 channel."],
    ["P1.0.2","rf_low_effort_ds",false,null,null,"Own photography — reverse image search returns only their own domain."],
    ["P1.0.2","rf_restricted_niche",false,null,null,"Jewellery. Nothing in Pinterest's restricted categories."],
    ["P1.0.3","total_urls_found",null,null,38,"38 total: 5 collections, 21 products, 8 guides, 4 selections. Excluded 14 policy/account/cart pages."],
    ["P1.0.3","url_breakdown_note",null,"Collections are strongest — gold hoops and bridal are evergreen. Christmas gifting is seasonal, hold until September. Four product pages are thin, skip them.",null,""],
    ["P1.0.4","verdict",null,"STRONG_FIT",null,"3/3 good-fit, 0 red flags, 38 URLs, own imagery. No reservations — this one can carry an ambitious plan."],
    ["P1.0.4","verdict_risk",null,"Most likely failure is us, not them: pearls have no lifestyle photography and if we do not chase it, that topic never reaches board coverage.",null,""],
  ];
  for (const [task, field, b, t, n, ev] of ANSWERS) {
    await c.query(
      `INSERT INTO organic.task_answers (org_id, task_id, field_key, answer_bool, answer_text, answer_number, evidence)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (org_id, task_id, field_key) DO UPDATE
         SET answer_bool=EXCLUDED.answer_bool, answer_text=EXCLUDED.answer_text,
             answer_number=EXCLUDED.answer_number, evidence=EXCLUDED.evidence`,
      [ORG_ID, task, field, b, t, n, ev || null]);
  }

  /* ---- report ------------------------------------------------------ */
  const counts = await c.query<Record<string, string>>(
    `SELECT
       (SELECT COUNT(*) FROM organic.boards WHERE org_id=$1) boards,
       (SELECT COUNT(*) FROM organic.keywords WHERE org_id=$1) keywords,
       (SELECT COUNT(*) FROM organic.urls WHERE org_id=$1) urls,
       (SELECT COUNT(*) FROM organic.waterfalls WHERE org_id=$1) waterfalls,
       (SELECT COUNT(*) FROM organic.pins p JOIN organic.waterfalls w ON w.id=p.waterfall_id WHERE w.org_id=$1) pins,
       (SELECT COUNT(*) FROM organic.client_tasks WHERE org_id=$1) tasks,
       (SELECT COUNT(*) FROM organic.monthly_kpis WHERE org_id=$1) months`, [ORG_ID]);
  console.log("\nSeeded:");
  for (const [k, v] of Object.entries(counts.rows[0])) console.log(`  ${k}: ${v}`);
  console.log(`  pin_performance rows: ${perfRows}`);
  console.log(`\n  /client/${ORG_ID}/overview`);
  console.log(`  /report/${ORG_ID}`);
}

/* ------------------------------------------------------------------ */

(async () => {
  const c = db();
  await c.connect();
  try {
    if (process.argv.includes("--remove")) await remove(c);
    else await seed(c);
  } finally {
    await c.end();
  }
  process.exit(0);
})();
