# Pinformance dashboard — Claude Code guide

Read this file before making changes. It captures conventions that aren't obvious from grepping the code.

## Project

Pinterest media buying agency SaaS for ~40 client stores. Automates organic pin creation, tracks paid campaign performance in zones (red/orange/green), flags stores that need attention. Backend: Next.js 16 App Router + Turbopack, TypeScript strict, Supabase Postgres + RLS + Storage, Vercel deployment.

## Domain isolation (read this before editing anything)

One Next.js repo serves 4 hostnames via middleware routing. Working in the wrong folder = changes leak to other domains you didn't intend.

| Domain | Folder |
|---|---|
| `dashboard.pinformance-agency.com` | `src/app/(dashboard)/**` (main media buyer app) |
| `typage.pinformance-agency.com` | `src/app/ty-page/**` (marketing/landing) |
| `onboarding.pinformance-agency.com` | `src/app/onboarding/**` (client onboarding form) |
| `calculator.pinformance-agency.com` | `src/app/calculator/**` (password-protected calc tool) |

Also live but aliased to the same project: `pinformance-dashboard.vercel.app`, `pinformance-website-live-2.vercel.app`.

Code that affects multiple hostnames:

- `src/app/api/**` — API endpoints called from all frontends
- `src/lib/**` — shared libraries (most media-buying code is dashboard-only, but grep to verify)
- `src/components/**` — shared UI components
- `src/middleware.ts` — hostname routing + Supabase auth
- `src/app/layout.tsx`, `src/app/globals.css` — global layout and styles

Before editing shared code, `grep -rn "from.*<module>" src/` to see the blast radius.

## Deployment flow

- Every push to `main` → Vercel builds and deploys to production in ~1-2 min
- All 6 aliased domains update simultaneously in one build
- **No staging environment**. Test locally with `npm run dev` before pushing.
- Rollback: Vercel dashboard → Deployments → previous good deploy → Promote to Production

## Database migrations

Numbered SQL files under `supabase/migrations/`. Always use the next sequential number.

Run a migration:
```bash
DOTENV_CONFIG_PATH=.env.local npx tsx scripts/run-migration.ts supabase/migrations/042_your_migration.sql
```

The script connects via `pg` using `DATABASE_URL` from `.env.local` (bypasses Supabase JS/PostgREST timeouts). Write idempotent migrations where possible: `CREATE ... IF NOT EXISTS`, `INSERT ... ON CONFLICT`, `ADD COLUMN IF NOT EXISTS`.

## Cron jobs (defined in `vercel.json`)

| Path | Schedule (UTC) | Purpose |
|---|---|---|
| `/api/cron/daily` | 0 17 * * * | Legacy daily maintenance |
| `/api/cron/post-pins` | */15 * * * * | Post scheduled/approved pins to Pinterest |
| `/api/cron/health-check` | 0 * * * * | Basic health check |
| `/api/cron/pull-analytics` | 0 6 * * * | Pull Pinterest analytics |
| `/api/cron/board-metrics` | 30 * * * * | Refresh board-level metrics |
| `/api/cron/optimize-prompts` | 0 3 * * 1 | Weekly AI prompt optimization |
| `/api/cron/refresh-pinterest-tokens` | 0 4 * * * | Refresh OAuth tokens before expiry |
| `/api/cron/snapshot-pinterest` | 30 */6 * * * | Snapshot campaigns/ad_groups/ads every 6h (parallelized) |
| `/api/cron/snapshot-metrics` | 0 */6 * * * | Snapshot spend/revenue/conversions per day every 6h (self-healing 7-day window) |
| `/api/cron/refresh-team-activity` | 15 */6 * * * | Recompute Team Activity cache every 6h |
| `/api/cron/weekly-update-seed` | 0 1 * * 1 | Create an **empty** subitem (timeline + send date only) for every active store on the Monday "Weekly Updates" board, so media buyers can write zone + text update into a row that already exists |
| `/api/cron/weekly-update-sync` | 0 12 * * 1 | Write last week's spend/revenue per store into those same subitems |
| `/api/cron/fx-rates` | 30 6 * * * | Pull ECB daily reference rates into `fx_rates` (used to express EUR zone thresholds per store currency) |

All crons authenticate via `CRON_SECRET` env var. Manual trigger:
```bash
curl -H "x-cron-secret: $CRON_SECRET" "https://dashboard.pinformance-agency.com/api/cron/<name>"
```

The two snapshot crons are load-bearing — most other views are computed from their output. If team activity or zones look wrong, first check that snapshot data is fresh (see "Data conventions" below).

## Key modules

### Media Buying Hub UI (`src/app/(dashboard)/media-buying-hub/`)

- `overview/` — analytic overview page
- `zones/` — red/orange/green zone matrix, weekly (4 buckets) + monthly (3 buckets) views
- `critical/` — Critical Attention: alarms, exceptions, currently-red, recovering, winners, persistence cards (longest in red/orange/green)
- `team-activity/` — per-store paid + organic activity per rolling 7-day window
- `benchmarks/` — niche/country/self benchmarks
- `store-settings/` — configure per-store BER, invoice ROAS, buyer, invoicing model, countries

### Backend modules (`src/lib/media-buying/`)

- `config.ts` — zone thresholds, `classifyZone()` logic, invoicing model semantics
- `zones.ts` — `computeStoreZones()` main computation; returns weekly_zones (4 buckets), monthly_zones (3 buckets), zone_history (12 buckets)
- `exceptions.ts` — auto-flag rules: red_streak, spend_drop (7d vs prior 7d), roas_crash (3d vs prior 7d), stale_account
- `history.ts` — computeMovers (alarms/recovery categorization)
- `benchmarks.ts` — niche/country/self benchmark math
- `team-activity.ts` — per-store weekly paid + organic activity, cached in `team_activity_cache` table, refreshed by cron

### RPCs (server-side aggregation)

Defined in migrations 031-041. Called from `team-activity.ts` via direct pg connection because PostgREST statement_timeout kills heavy queries.

- `team_paid_activity_for_org(uuid, int)` — launched (campaigns whose start_time falls in window), paused (ACTIVE→PAUSED transitions), ads_paused (in currently-active campaigns), budget_changed (daily_spend_cap diffs), active_days per rolling 7-day window
- `team_organic_activity(int)` — boards_created (excluding source='imported') + pins_added per org per window

## Common tasks

### Add new store(s)

Follow the pattern in `scripts/create-tola-orgs.ts` / `scripts/create-additional-orgs.ts`. Insert into `organizations` (with slug + default settings JSON), then insert an empty `brand_profiles` row.

Or inline SQL:
```sql
INSERT INTO organizations (name, slug, onboarding_step, onboarding_completed_at, settings)
VALUES ('Store Name', 'store-name', 5, now(),
        '{"pins_per_day":40,"auto_approve":false,"timezone":"Europe/Amsterdam","posting_hours":[8,12,17,20],"content_mix":{"static":70,"video":20,"carousel":10},"min_post_interval_minutes":180,"max_pins_per_day":5,"weekend_boost":true,"pillar_rotation":true}'::jsonb)
RETURNING id;
```
Store starts as "Needs setup" — user fills in department, buyer, BER etc via Store Settings UI.

### Offboard store (soft-delete, reversible)

```sql
UPDATE store_settings s
   SET is_active = false,
       notes = COALESCE(NULLIF(s.notes,'') || E'\n', '') || 'Offboarded ' || CURRENT_DATE::text,
       updated_at = now()
  FROM organizations o
 WHERE s.org_id = o.id AND o.name = 'Store Name';
```
Data preserved. Store disappears from Hub / Zones / Benchmarks / Team Activity. Reversible via `is_active = true` again.

### Refresh Team Activity cache manually

```bash
curl -H "x-cron-secret: $CRON_SECRET" "https://dashboard.pinformance-agency.com/api/cron/refresh-team-activity"
```

## Data conventions

- **Time windows**: rolling 7-day windows (`today-6` to `today` inclusive) for Team Activity; ISO week (Mon-Sun) or calendar month for Zones weekly/monthly views.
- **Postgres DATE serialization gotcha**: node-pg's default parser turns DATE into JS Date at LOCAL midnight — which then serializes back as the PREVIOUS day if the process TZ isn't UTC. Every module that queries DATE columns via `pg` registers `types.setTypeParser(1082, val => val)` (see top of `team-activity.ts`) to keep dates as raw "YYYY-MM-DD" strings. Copy this pattern when writing new modules.
- **Currency**: stored as-is per Pinterest ad account (EUR/USD/CHF/GBP...). Never mixed in computations without conversion. The live currency per ad account is readable from `pinterest_metrics_snapshots.currency` (that table only; `pinterest_entity_snapshots` doesn't carry it). Amounts written to the Monday "Weekly Updates" board stay in the ad account's currency — never convert. The currency column there is a label only, and the store name is not a reliable hint: Tola Jewelry **US** bills in **EUR**. `weekly-update-sync.ts` logs a `VALUTA-LABEL` warning when the label and Pinterest disagree.
- **Amounts vs thresholds**: amounts (spend, revenue) are NEVER converted — they stay in the ad account's currency everywhere: dashboard, Monday board, exports. The **thresholds** are the things that move. All zone thresholds are configured in euros (including per-store overrides in `zone_thresholds` / `min_monthly_spend`), and `scaleFloorFor({ fxPerEur })` converts them into the store's currency at the latest ECB rate from `fx_rates`. €20k becomes CHF 18,780 / $23,134 / £17,090. Skipping this measures a USD store against a floor that is 13.5% too lenient and a GBP store against one 17% too strict.
- **Zone scale gate**: green needs ROAS ≥ invoice ROAS **and** enough scale, and the scale floor depends on the bucket's period (`scaleBasis` on `classifyZone`). Weekly buckets use the weekly floor (€5k revenue / €7.5k÷4.345 spend); calendar-month buckets use the monthly floor (€20k revenue for `revenue_fee`, €7.5k spend for `spend_fee`) because the agency invoices per month. The month in progress is prorated by `daysWithData / daysInMonth`, where `daysWithData` is the newest `snapshot_date` we received that month, taken **globally** — a store that only ran ads 3 of 13 elapsed days is behind, and dividing by its own active days would hide that. Finished months get the full floor. Never classify a month bucket with the weekly floor; that was the bug fixed on 14-08-2026.
- **Weekly Updates board — seed then fill (two crons, one design)**: `weekly-update-seed` (Mon 01:00 UTC) creates an empty week row for **every** item in the board's active group; `weekly-update-sync` (Mon 12:00 UTC) fills spend/revenue into those rows. Between them the media buyers write zone + text update by hand. `writeWeek()` therefore freezes on **whether we already wrote the numbers** (`isAlreadySynced()`: spend filled, plus revenue filled unless the store is spend-only), never on whether the subitem exists — freezing on existence means the seed leaves every store empty. Never change one cron without the other. Verify the rule with `npx tsx scripts/check-weekly-freeze-rule.ts`. Updates use `change_multiple_column_values`, which only touches columns in the payload, so zone/text update and manually entered Shopify revenue survive.
- **Seed call budget — O(1) in stores, not O(n)**: `weekly-update-seed` reads the whole subitem board in ~3 paginated calls (`loadAllWeekSubitems`) and creates missing rows 6 at a time. It used to do one lookup + one create per store; on its first live run (17-08-2026) that was cut off after 18 of 49 stores, ~55s in, leaving 31 stores without a week row — even though the route declares `maxDuration = 300`, so the declared limit is not what applies in practice. Never add a per-store API call to this run. The sync at 12:00 UTC only backfills stores **with** an ad account, so a truncated seed leaves the hand-filled stores empty. The run ends with an **end check** that re-reads the board and throws (route returns 500) if any active store lacks a row — counters alone can't catch this, since a truncated loop never reaches the stores it skipped. **A seed log without a final `EINDCONTROLE` line means the run was cut off**, whatever the counters above it say.
- **Store count is never a constant**: stores are onboarded and offboarded continuously (47 active 14-08-2026, 49 on 16-08-2026). The seed reads the Monday group `topics` raw — deliberately *not* via `loadClients()`, which skips stores without an ad account ID. Those are exactly the freshly onboarded stores that are filled in fully by hand and need the empty row most. Any store count in a comment is a dated snapshot; don't assert on it.
- **Attribution**: default 30/1 (30-day click, 1-day view) unless overridden per-store in `store_settings.attribution_setting`.
- **Supabase JS pagination**: PostgREST caps responses at 1000 rows. Paginate with `.range(offset, offset + PAGE_SIZE - 1)` in a loop if you might exceed that. Sort DESC by the most-important dimension so a hypothetical truncation drops old data instead of recent.

## Known issues / gotchas

1. **Some Pinterest tokens are dead** — Bella Bra, Olvia Charleseton, Smartsporter. Snapshot cron returns 401 for them. Owner must reconnect via `/integrations`. Cron continues successfully for other orgs (per-org try/catch).
2. **Pins stuck in `generated` status** for some stores (Breathfree) — AI created them but they never got approved/posted. Either token is dead, auto-approve is off, or something else. Check `SELECT status, COUNT(*) FROM pins WHERE org_id = ? GROUP BY status`.
3. **Boards imported from Pinterest** during onboarding get `source='imported'`. `team_organic_activity` RPC excludes those from "boards created this week". New AI-generated boards default to `source='ai_generated'`.
4. **PostgREST statement_timeout** — heavier RPCs (LAG over 100k+ rows) blow the ~15s default. `team-activity.ts` bypasses this by connecting via `pg` directly with a 120s pool-level statement_timeout.
5. **CRON_SET typo** — used to exist as a fallback for `CRON_SECRET`. Cleaned up Aug 14 2026. If you see it anywhere, remove it.
6. **ANTHROPHIC_API_KEY typo** — env var was misnamed. Code reads `process.env.ANTHROPIC_API_KEY || process.env.ANTHROPHIC_API_KEY`. Same cleanup pending.

## Don't

- `git push --force` on `main`
- `DELETE FROM <table>` without a WHERE clause
- `DROP TABLE` outside a proper numbered migration file
- Skip sequential numbers on migrations (each must be strictly higher than the previous — check the folder before naming yours)
- Deploy without `npx tsc --noEmit` passing
- Edit shared code (`src/lib/`, `src/components/`, `src/app/api/`) without grepping to see who imports it

## Do

- `git pull` before starting (someone else may have pushed)
- Small, focused commits
- Conventional-commit prefixes: `feat(hub): ...`, `fix(zones): ...`, `chore(cron): ...`, `refactor(critical): ...`
- Test locally with `npm run dev` when touching the frontend
- When adding a migration that changes semantics, update this file's "Data conventions" or "Known issues" section in the same commit
- When adding a new metric to Team Activity or a new card to Critical Attention, note the source data + refresh cadence here

## First-run smoke test after fresh setup

After cloning the repo, `npm install`, `vercel env pull .env.local`, verify:

```bash
# 1. Type check passes
npx tsc --noEmit

# 2. DB connection works
DOTENV_CONFIG_PATH=.env.local npx tsx -e "require('dotenv/config'); const {Client}=require('pg'); (async()=>{const c=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}}); await c.connect(); const r=await c.query('SELECT COUNT(*) FROM organizations'); console.log('orgs:', r.rows[0].count); await c.end();})();"

# 3. Cron auth works (should return 200 or empty results, not 401)
curl -H "x-cron-secret: $CRON_SECRET" "https://dashboard.pinformance-agency.com/api/cron/health-check"
```

If all three succeed, you're set up correctly.
