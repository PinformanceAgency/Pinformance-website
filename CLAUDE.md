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
| `/api/cron/weekly-update-sync-retry` | 30 12 * * 1 | Same run again — finishes stores the 12:00 run didn't reach, no-op (~8s) if it did. Re-exports the handler from `weekly-update-sync`; the separate path only exists because cron paths must be unique |
| `/api/cron/weekly-update-check` | 0 13 * * 1 | Read-only watchdog: is every active store's week row actually filled? Alerts to Slack if not |
| `/api/cron/fx-rates` | 30 6 * * * | Pull ECB daily reference rates into `fx_rates` (used to express EUR zone thresholds per store currency) |

### Cron failure alerts

`src/lib/alerts.ts` → `alertCronFailure()` posts to a Slack Incoming Webhook read from `SLACK_ALERT_WEBHOOK` (the channel is baked into the URL). Wired into `weekly-update-seed`, `weekly-update-sync` and `weekly-update-check`; add it to other crons the same way — call it in the route's `catch` before returning the 500, and `await` it so the message leaves before the function shuts down.

Without the env var it is a no-op that logs one line, so local and preview runs never post. It never throws: a broken alert must not take down a run that was otherwise fine. Note it only fires on **fatal** errors — the crons that catch per-store failures internally still report those to the logs only.

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

### Organic app (`src/app/organic/**`, `src/lib/organic/**`)

Fifth hostname, `organic.pinformance-agency.com`. Locally it is reachable at
`http://organic.localhost:3000` — plain `localhost:3000` serves the dashboard,
so a route tested there is not the route you think you tested.

**All organic tables live in the `organic` Postgres schema, which is NOT exposed
via PostgREST.** Every read and write goes through `organicPool()` in
`src/lib/organic/db.ts` (direct `pg`). Do not try to reach it with the Supabase
JS client — it fails with `PGRST106 Invalid schema: organic`. The pool is held on
`globalThis` under a `Symbol.for` key, deliberately: a module-level binding leaks
a fresh pool on every HMR reload until Supabase's session-mode pooler refuses
connections at 15, and that surfaces as an unrelated 500 on whatever page queried
next.

Surfaces:

| Route | What it is |
|---|---|
| `/` | client list, activate |
| `/client/[orgId]` | store overview — health, leaks, cycles |
| `/client/[orgId]/phase/[1-5]` | the SOP made navigable; phase 4 carries cycle operations |
| `/client/[orgId]/{boards,keywords,urls,assets,analytics}` | the library |
| `/report/[orgId]` | **the client report — the only shareable surface** |
| `/agency/{portfolio,execution,margin,risk,method}` | business level |

The client report sits outside `/client/[orgId]` on purpose. That route carries
the internal workspace chrome, and a document that gets exported to PDF and
forwarded must not inherit the tool's furniture by accident.

Backend modules: `status.ts` (recompute engine), `viability.ts`, `intake.ts`,
`phase2-5.ts`, `provenance.ts`, `health.ts`, `workspace.ts`, `report.ts`,
`internal-analytics.ts`, `agency.ts`, `method.ts`, `expansion.ts`, `ai.ts`.

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

### Demo store (organic)

The organic screens are built for a store with history — cohorts, sparklines,
coverage matrices, margin. No real client has that yet, so they were only ever
seen empty, which is the wrong thing to design or review against.

```bash
DOTENV_CONFIG_PATH=.env.local npx tsx scripts/demo-store.ts           # seed
DOTENV_CONFIG_PATH=.env.local npx tsx scripts/demo-store.ts --remove  # delete
```

Seeds `DEMO · Vellora Atelier` (fixed uuid `d3e70000-…de00`): 7 months of
monthly KPIs, 6.5k rows of daily pin performance, 24 boards, 12 URLs, 6
waterfalls, 96 pins, the full task bank and an answered viability gate. Seeding
is idempotent — it removes and rebuilds, and the RNG is seeded so the store has
the same shape every run.

The defects in it are deliberate: one topic short of board coverage, high-volume
keywords never deployed, two failed pins, a client sitting on an approval for
three weeks. A demo where everything is green exercises none of the screens that
matter. **Remove it before any client sees the client list.**

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
- **Weekly Updates board — which columns the cron owns**: the sync writes the week's timeline + send date, spend, revenue (not for spend-only stores) and the four **derived** columns via `derivedColumnValues()`: `Spend last week`, `Revenue last week`, `ROAS last week`, `ROAS (for update)`. Rules that are easy to get wrong:
  - Last week's spend/revenue are **copied from the previous week's subitem row**, never re-fetched from Pinterest. That row is frozen and is what the last client update said, and for spend-only stores its revenue is hand-typed by Tristan and exists nowhere else.
  - ROAS goes in at **one decimal**, like the `formula_mm0qb00` column. Not cosmetic: the `ROAS +/- (%)` formula computes from the *rounded* values, so writing 1.88 where the board shows 1.9 yields a percentage that contradicts the numbers under it. Verified against Monday's own formula column on 43 live rows (0 deviations).
  - Unknown stays **empty, never 0**: a freshly onboarded store has no previous row, and a 0 in "last week" turns the WoW formula into a +∞ jump. Same for ROAS when spend is 0.
  - `ROAS (for update)` is skipped for spend-only stores — we don't own this week's revenue, so we can't compute it. The backfill picks it up later from whatever is then on the board.
  - The three `... +/- (for update)` **text** columns (`text_mm1cbeze` / `text_mm1cxxv5` / `text_mm1cyt41`) mirror the formula percentages as text (because a formula column can't be used in a Slack update). Those stay **manual** by decision on 17-08-2026 — don't automate them without asking.
  - Verify the math with `DOTENV_CONFIG_PATH=.env.local npx tsx scripts/check-weekly-derived-columns.ts` — its expected values are real rows the media buyers filled by hand, so it pins both the rounding and the column IDs.
- **Backfilling a week that is already frozen**: the sync never revisits a week once spend + revenue are in (late conversions must not mutate a sent update), so newly added derived columns don't appear on old weeks. `scripts/backfill-week-derived.ts` fills those four columns for an existing week: it computes purely from what's **on the board** (no Pinterest, so amounts can't shift), skips every column that already has a value, and touches nothing else. `BACKFILL_DRY_RUN=1` first; pass the Monday of the week as argument, default is the previous full week. Ran 17-08-2026 for week 10-08 – 16-08: 48 rows, `Revenue last week` 8→39/49, `ROAS last week` 3→39/49, `ROAS (for update)` 0→43/49 (the rest legitimately have no previous row or no revenue yet).
- **Weekly-update call budget — O(1) in stores, not O(n), in both crons**: reckon with **~60s of wall clock, not the declared `maxDuration = 300`**. Both runs were cut off around a minute on 17-08-2026: the seed after 18 of 49 stores (~55s), the sync after 13 of 37. The declared limit is not what applies in practice, so neither run may do per-store API calls in a sequential loop.
  - `weekly-update-seed` reads the whole subitem board in ~3 paginated calls (`loadAllWeekSubitems`) instead of one lookup per store, and creates missing rows 6 at a time (`inBatches`).
  - `weekly-update-sync` does the same: one board-wide read up front, handed to `writeWeek(..., preloaded)`, and the stores processed `SYNC_BATCH` (8) at a time. Don't raise the batch much higher — Monday throttles parallel mutations and the Pinterest reports have their own rate limit.
  - The sync also drops **frozen stores before the Pinterest call**, using the preloaded board data. `writeWeek()` recognises a filled row by itself, but only after the report has been fetched. Doing it up front is what makes a re-run nearly free (~8s over 47 stores), which is the whole basis of the 12:30 retry.
  - Where the time actually goes (measured 22-08-2026, locally): a Pinterest report is **0.6s** and eight in parallel are also 0.6s — the per-store work was never the problem. The fixed cost was: `connectedAdAccountIds()` **19.5s**, board read 7s, client board 1s. See migration 044 for the 19.5s; the three now run in one `Promise.all`. A frozen dry run went 49s → 8s.
  - Both runs end with an **end check** that re-reads the board and reports every store that should have been filled but wasn't: the seed throws (route returns 500), the sync returns `missing[]` and the route fires `alertCronFailure()` and answers `ok:false`. Counters can't catch this — a truncated loop never reaches the stores it skipped, and a Monday update can return 200 without mutating. `missing` is deliberately not the same as `failed`: those threw, these went quiet.
  - **A seed or sync log without a final `EINDCONTROLE` line means the run was cut off**, whatever the counters above it say. A cut-off run never reaches its own alert either, so Slack stays silent — which is why that check can't be the only one (see below).
  - **The watchdog is a separate invocation on purpose.** A check that runs at the end of the run it is checking cannot report on that run dying. `weekly-update-check` (Mon 13:00 UTC, `checkWeekFilled()`) only reads — client board + 3 subitem pages, ~5s — and alerts if a connected store has no numbers or an active store has no week row at all. It stays quiet when everything is fine; a channel that says "all good" every Monday stops being read. Two deliberate exclusions, both of which caused false alarms when they were missing: stores whose ad account is on the board but not connected in the dashboard (`connectedAdAccountIds()`) are reported as manual, not missing; and stores created **after** the week ended (Monday `created_at`) are ignored entirely — that is onboarding, not a failure.
  - **The retry at 12:30 UTC is the safety net, not a nicety.** `weekly-update-sync-retry` runs the exact same handler; the freeze rule makes it idempotent, so it does nothing (~8s, zero mutations) when the 12:00 run finished, and picks up exactly the stores it didn't reach when it was cut off. That turns "13 of 37 and silence" into "the rest lands half an hour later", well before the updates go out.
  - The sync at 12:00 UTC only backfills stores **with** an ad account, so a truncated seed leaves the hand-filled stores empty.
- **Store count is never a constant**: stores are onboarded and offboarded continuously (47 active 14-08-2026, 49 on 16-08-2026). The seed reads the Monday group `topics` raw — deliberately *not* via `loadClients()`, which skips stores without an ad account ID. Those are exactly the freshly onboarded stores that are filled in fully by hand and need the empty row most. Any store count in a comment is a dated snapshot; don't assert on it.
- **Organic — a missing number is never zero.** `src/lib/organic/provenance.ts`
  is the contract: a figure that could not be measured is `null` and renders as an
  em dash with its reason on hover, and a percentage change against an absent
  baseline is not computed at all. This is why retainer, margin, capacity and
  committed-pins are blank rather than 0 on the agency screens — a store nobody
  priced is not a store on nothing, and treating it as zero sorts a healthy
  account to the top of the loss-making list.
- **Organic — never call `toLocaleString()` without a locale.** It formats with
  the Node process locale on the server and the viewer's locale in the browser.
  That is a hydration mismatch *and* a way for a client and an account manager to
  read different numbers off the same report. Always `toLocaleString("en-US")`.
- **Organic — cross-client aggregates are scoped to `organic.client_settings`.**
  `organic.boards` holds rows for ~50 orgs whose boards were imported by the main
  dashboard and that never entered the organic workflow. Aggregating over
  `boards.org_id` reports a 51-store finding from a 1-store book. `method.ts`
  enforces this, and also refuses to state any conclusion below 3 stores and 20
  observations.
- **Organic — cohort before ranking.** Portfolio comparisons are always within a
  tenure cohort against a fitted trend, never a flat league table. A 15-month
  store at +96% vs baseline is *underperforming*; a 2-month store at +18% is
  ahead. A naive ranking inverts both and points attention at the wrong accounts.
- **Pinterest will not create SECRET boards via API.** `POST /v5/boards` with
  `privacy:"SECRET"` returns 403 code 29; `PROTECTED` and `PUBLIC` return 201.
  Isolated by curl outside the client code — it is not a scope or app-tier
  problem. Migrations 051/052 pivoted the whole board path to `PROTECTED`.
- **Organic — retire a task with `task_definitions.active`, never by deleting it.** Before migration 066 that flag was only read by `activate.ts` when it seeds `client_tasks`; every read afterwards joined `task_definitions` unfiltered, so flipping it did nothing for a store that was already activated. It now filters `client_progress`, `client_cycle_progress` and every task-listing query, so deactivation is one reversible switch that all surfaces honour. Two things go with it: **delete the preconditions pointing at the retired task** — dependents wait forever on something that can no longer be completed (P1.2.1 and P1.2.14 hung off P1.1.2, P1.3.8 and P1.3.14 off P1.1.5) — and **delete the untouched `client_tasks` placeholders** (no status beyond BLOCKED/TODO, no notes, no time, no answers), because a dozen ad-hoc "outstanding" counts in the app do not join `task_definitions` and the next one written will not either. Rows that recorded real work stay.
- **Organic — phase 4 drafts copy and image prompts from the brief; a human still approves.** `generateCopyForDesign()` and `generateImagePromptForDesign()` (phase4.ts) build their prompt from `loadAccountBrief()` + the design brief — tone, banned words, approved CTAs, angles, visual worlds, the grid's format finding, and what has already won. Both run through `generateWithValidator()`, so a rejected draft is regenerated with the specific failures fed back. Nothing publishes: copy lands at `validator_status = PASS`, `human_qc_status = PENDING`, and a regenerate **resets QC to PENDING** so new text cannot inherit approval nobody gave it. `ai_drafts.kind` gained `PIN_COPY` and `IMAGE_PROMPT` (migration 073) — it is a CHECK constraint, not an enum, so extend the constraint.
- **Organic — `validateCopy` enforces the brand book, not just Pinterest's rules.** Pass `{ bannedWords, neverInclude }` from `brand_rules`. Banned words match on **word boundaries** so a brand banning "sale" does not trip on "wholesale"; never-include items match as substrings because they are phrases. Collected in P1.1.6 and previously checked by nobody.
- **Organic — write copy with an UPSERT on `copy_sets.design_id`, never an UPDATE.** The waterfall generator makes one row per design, but a design can arrive from an import or a re-run without one, and an UPDATE matching nothing returned `ok:true` while the generated copy went nowhere — the cost of the model call, none of the result, and no way to tell from the response.
- **Organic — the manager may always overrule; the deviation must be visible.** `src/lib/organic/structure.ts` holds both halves of that: `advise*()` ranks the options the research points at with a reason each, and `check*()` names what a chosen selection departs from. Nothing in it blocks a save or disables a control — `assignBoardsToUrl` used to throw below five boards and no longer does. Deviations are computed **on read** (`CycleView.deviations`, `loadCycleDeviations()`), never stored: a stored warning goes stale the moment a board is pinned past ten, and a stale warning teaches people to dismiss the whole panel. Two kinds, answered differently — `structure` is a rule of the method, `research` contradicts this account's own findings and is often the one the manager knows is out of date.
- **Organic — `winning_combinations` is a VIEW, not a table.** It aggregates published pins and their performance per (design, board), so it is always current and needs no writer — the gap was only that nothing read it. `loadAccountBrief().proven` does now, and it feeds board ranking and the design brief. Do not try to add an index or write rows to it.
- **Organic — fuzzy name matching needs the account's own noise words.** `overlaps()` in structure.ts falls back to a shared significant word, which on a jewellery account matched every board to every Steal List item via "jewellery" — advice that ranks everything first ranks nothing. `noiseWords()` drops any word appearing in more than a fifth of the names. Err strict: a missed match costs one signal, a false match costs the whole ranking.
- **Organic — downstream decisions read `loadAccountBrief()`, never the research tables directly.** `src/lib/organic/brief.ts` assembles everything phases 1–3 produced into one typed object. Before it, phase 4 read four values out of three months of research (keywords, three hex codes, brand rules, the taste-graph 3×3) because each feature wrote its own queries against whichever tables its author remembered. Adding a research input to a decision is now a field on an object the caller already holds. Every section is `Known<T>` — present, or absent **with the reason** — so a store with no grid never silently inherits the defaults of one that has it.
- **Organic — the save/click split comes from the grid, not from a constant.** `splitFromGrid()` maps `grid_analyses.text_overlay_bucket` (how many of the top 15–20 pins carry text) onto the click share: NONE 10 / MINIMAL 20 / HALF 40 / MOST 55 / ALL 65. That is "fitting in beats standing out" (P4.2.1) applied with numbers. The floor and cap are load-bearing: all-save earns reach and sends nobody anywhere, all-click gets traffic that never compounds. With no grid row for the keyword it falls back to 80/20 **and says so** in `basis`. The old hardcoded 80/20 made P2.1.2 and P2.1.3 busywork — the whole point of those tasks is finding out what page one rewards.
- **Organic — still orphaned, if you are looking for the next win.** `competitor_pins`, `keyword_clusters` and `design_templates` are captured and read by nothing downstream, and `winning_combinations` has no production writer (only the demo seeder), so the phase-5 → phase-4 learning loop does not close yet. `ai.ts` is a bare Anthropic wrapper that reads none of the research. The brief is the place to wire each of these in.
- **Organic — a custom-enum array comes back from node-pg as a raw string.** `{TRAFFIC,SALES}`, not `["TRAFFIC","SALES"]` — node-pg has no parser registered for the type OID, so `.filter` throws. Cast to `::text[]` in the query (`client_intake.primary_goals` does). `arr()` in brief.ts parses the literal defensively as well, because the next enum array added upstream will not remember the cast.
- **Organic — a task with a checklist derives its own status; do not set it by hand.** `syncTaskStatusFromAnswers()` (workspace.ts) runs on every answer save and clear: every visible question answered → `DONE`, one cleared → `IN_PROGRESS`. It deliberately never touches a task with no checklist (nothing to derive from), never touches `BLOCKED` (that is computed from preconditions, and answering a question does not clear one), and never returns a task to `TODO` (work has started). A field counts as answered only when its required reasoning is also present — without that a task flips to DONE while a row is still flagged red for the missing "why". There is no completion dialog any more; picking DONE on a manual task just does it.
- **Organic — the attachment belongs to the question, not the task.** `organic.task_answers.file_url` / `file_title` (migration 071). A task with six checks used to share one task-level attachment, so the reader got a document and no way to tell which check it proved. Links pasted there are still swept into the Assets library by `autoLinkAssetsFromText()`, so the library view stays complete without anyone filing the same thing twice — do not add an `assets` row by hand for these.
- **Organic — a `choice` field's `options` are the stored values; labels go in `optionLabels`.** These were one and the same until the potential rating shipped buttons reading STRONG/MODERATE/WEAK against an enum holding STRONG_FIT/MODERATE_FIT/WEAK_FIT. Every click 400'd on the enum cast, the answer still landed in `task_answers`, and the button lit up while `client_viability.verdict` stayed null and phase 1 never unblocked. Never prettify an option value in place.
- **Organic — a task states what it hands back; it does not ask you to narrate.** Every task without a form of its own used to render the same three questions (what did you do / found / decided). That asked about the process when the task has an output, and it duplicated the work panel underneath, which already takes free text and attachments. `fieldsFor()` now returns **null** for any task without hand-written questions, and `task_definitions.expected_output` (migration 069) names the artefact instead — "the completed questionnaire", "the brand book" — rendered directly above the box that takes it. Leave `expected_output` null where a task has its own form or its own checklist: a prompt asking for a file that does not exist is noise.
- **Organic — `client_progress` carries a count per status, and they partition the phase.** Migration 068 added `todo_tasks`, `in_progress_tasks` and `review_tasks` next to done/skipped/blocked. Use those six for anything chart-shaped — they sum to `total_tasks` because every row has exactly one status. Do **not** chart `outstanding_tasks` alongside `blocked_tasks`: blocked is a subset of outstanding, so "45 left to do" beside "38 blocked" sums 83 out of 45. `outstanding_tasks` and `pct_done` keep their old meaning; other surfaces read them.
- **Organic — a conformance check does not ask for reasoning.** `task-fields.ts` renders the "Why?" box only when a field defines an `evidence` prompt. Phase 1 step 3 (technical setup) is seventeen yes/no conditions with no prompt at all, plus one `onlyWhen` field that appears the moment any check is answered no. Asking someone to justify a yes on "is the domain claimed" is what teaches people to type "yes" into a box, and the audit is then worth what no audit is worth. The progress ring counts `visibleFields()`, not `set.fields` — otherwise a clean check reads 1 of 2 forever.
- **Organic — `waiting_on` is set by a manager, never inferred.** `BLOCKED`
  status is recomputed from SOP preconditions, which says which task is in the
  way, not who we are waiting on. An inferred "waiting on client" ends up quoted
  back to a client in a review, so it has to be true.
- **Attribution**: default 30/1 (30-day click, 1-day view) unless overridden per-store in `store_settings.attribution_setting`.
- **Supabase JS pagination**: PostgREST caps responses at 1000 rows. Paginate with `.range(offset, offset + PAGE_SIZE - 1)` in a loop if you might exceed that. Sort DESC by the most-important dimension so a hypothetical truncation drops old data instead of recent.

## Known issues / gotchas

1. **Some Pinterest tokens are dead** — Bella Bra, Olvia Charleseton, Smartsporter. Snapshot cron returns 401 for them. Owner must reconnect via `/integrations`. Cron continues successfully for other orgs (per-org try/catch).
2. **Pins stuck in `generated` status** for some stores (Breathfree) — AI created them but they never got approved/posted. Either token is dead, auto-approve is off, or something else. Check `SELECT status, COUNT(*) FROM pins WHERE org_id = ? GROUP BY status`.
3. **Boards imported from Pinterest** during onboarding get `source='imported'`. `team_organic_activity` RPC excludes those from "boards created this week". New AI-generated boards default to `source='ai_generated'`.
4. **PostgREST statement_timeout** — heavier RPCs (LAG over 100k+ rows) blow the ~15s default. `team-activity.ts` bypasses this by connecting via `pg` directly with a 120s pool-level statement_timeout.
5. **CRON_SET typo** — used to exist as a fallback for `CRON_SECRET`. Cleaned up Aug 14 2026. If you see it anywhere, remove it.
6. **The weekly sync's speed depends on a vacuumed index** — `LINKS_QUERY` (ad account → org, from both snapshot tables) took 19.5s over 1.5M rows until migration 044 added covering indexes on `(snapshot_date, org_id, ad_account_id)`. The index alone did nothing: the planner only picked the index-only scan after `VACUUM (ANALYZE)`, which is why 044 also lowers `autovacuum_vacuum_scale_factor` to 0.05 on both snapshot tables. If the Monday cron starts creeping back towards its time limit, measure that query first and check whether autovacuum is keeping up.
7. **ANTHROPHIC_API_KEY typo** — env var was misnamed. Code reads `process.env.ANTHROPIC_API_KEY || process.env.ANTHROPHIC_API_KEY`. Same cleanup pending.

## Don't

- `git push --force` on `main`
- `DELETE FROM <table>` without a WHERE clause
- `DROP TABLE` outside a proper numbered migration file
- Skip sequential numbers on migrations (each must be strictly higher than the previous — check the folder before naming yours)
- Deploy without `npx tsc --noEmit` passing
- Edit shared code (`src/lib/`, `src/components/`, `src/app/api/`) without grepping to see who imports it
- **Create a new public-schema table without also enabling RLS in the same migration.** Supabase flags any table with RLS off as "publicly accessible" (rls_disabled_in_public) because the anon key can read/write/delete it. Every new table needs at minimum: `ALTER TABLE <name> ENABLE ROW LEVEL SECURITY;` plus one or more `CREATE POLICY` statements for the roles that need access (usually authenticated for reads; service_role bypasses RLS automatically for cron writes)

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
