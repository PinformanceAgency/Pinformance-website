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
| `/api/cron/organic-post-pins` | */15 * * * * | **Organic P4.4.1.** Posts organic pins whose `scheduled_date` has arrived. The caps live here, not in the generator: 20/day hard ceiling, the store's `daily_pin_target`, and a gap derived from that target |
| `/api/cron/organic-create-boards` | 30 5 * * * | **Organic P3.3.5.** Creates the boards whose planned date has arrived, for every store in `organic.client_settings`. The pace is not this cron's: `createBoardsToday()` takes at most three per store per run and `check_board_pace()` refuses a fourth the same day, so running it more often changes nothing. A store with no working token is reported apart from a board that failed |
| `/api/cron/organic-seed-boards` | 20 6-17 * * * | **Organic P3.3.7.** Board warming: saves ONE approved seed pin per store per run (`seedNextPin()`), at most `SEEDS_PER_DAY` (10) a day, boards a waterfall is about to publish onto first, and makes a board public on Pinterest at ten pins. The 06:20 run also reconciles every store's board privacy and pin counts against the account (`syncBoardsWithPinterest()`), so boards warmed by hand with the website widget go public too |
| `/api/cron/organic-pull-analytics` | 0 7 * * * | **Organic P5.1.1.** Rolling 14-day / 2-month re-read into `organic.pin_performance` + `organic.monthly_kpis`. An hour after the main pull so the two don't hit Pinterest for the same accounts at once |

### Cron failure alerts

`src/lib/alerts.ts` → `alertCronFailure()` posts to a Slack Incoming Webhook read from `SLACK_ALERT_WEBHOOK` (the channel is baked into the URL). Wired into `weekly-update-seed`, `weekly-update-sync` and `weekly-update-check`; add it to other crons the same way — call it in the route's `catch` before returning the 500, and `await` it so the message leaves before the function shuts down.

Without the env var it is a no-op that logs one line, so local and preview runs never post. It never throws: a broken alert must not take down a run that was otherwise fine. Note it only fires on **fatal** errors — the crons that catch per-store failures internally still report those to the logs only.

All crons authenticate via `CRON_SECRET` env var. Manual trigger:
```bash
curl -H "x-cron-secret: $CRON_SECRET" "https://dashboard.pinformance-agency.com/api/cron/<name>"
```

The two snapshot crons are load-bearing — most other views are computed from their output. If team activity or zones look wrong, first check that snapshot data is fresh (see "Data conventions" below).

### The pin scheduler (`/api/cron/post-pins`)

This is what makes organic automatic, and on 27-08-2026 it was quietly failing:
453 pins overdue, the oldest since 29 July, two stores that had never posted a
single pin. Four things were wrong at once and each is worth not reintroducing.

- **A run budgets itself: `RUN_BUDGET_MS`, 50s by default.** `maxDuration = 300`
  is what we ask for, not what we get — the route was killed twice that morning
  with *"instance was killed because it ran out of available memory"*, and a
  replay of the loop needed ~600s to walk thirteen stores. A run that dies
  mid-flight leaves pins in `posting` (self-healed only ten minutes later) and
  always dies in the same place. It now stops cleanly and reports `not_reached`.
- **Order is least-recently-posted first** (`public.pins_due_orgs()`, migration
  086). The old loop took the orgs in whatever order the database returned,
  which was stable — so the front of the list was served every run and the back
  never. petcura had 40 due pins, a live token and a live board, and had posted
  nothing, ever, because it sat at position 10. Never make this order arbitrary
  again; starvation here is invisible from every screen in the app.
- **A pin that cannot be posted is retired, not retried.** No media, or a board
  with no `pinterest_board_id`, used to `continue` — leaving status and
  `scheduled_at` untouched, so the same pin came back as one of the ten oldest
  every 15 minutes forever. Fit Cherries' ten oldest were all unpostable, and
  the 131 pins behind them had not moved since 2 July. They now go to `failed`
  with a reason in `rejected_reason` (nothing is deleted, so the copy can be
  reused). `scripts/retire-unpostable-pins.ts` clears a backlog in one pass.
- **Video pins are rationed** (`?max_videos=`, one by default) and only started
  when a whole one still fits in the budget. Register → upload → poll runs to
  60s with the file held in memory as a Buffer; the memory kill was a single
  303MB file, and a 120MB size guard now stands in front of every one.
- **The due-pins window is wider than the per-run cap, deliberately.** It was a
  flat 10, which broke twice once caps were raised and videos rationed: a store
  capped at 15 could never post more than 10 a run, and a *deferred* video still
  occupied a slot — The Longevity store had 13 videos queued ahead of 8 images,
  so every run pulled ten videos, deferred nine, and never looked at the images.
  Head-of-line blocking wearing a new hat. `perRunCap` bounds what is posted;
  the window only bounds what is considered.

The per-org caps (`settings.max_pins_per_day`, default 5; swimwear hard-capped
at 2 because Pinterest throttles it) and `settings.min_post_interval_minutes`
are deliberately untouched by all of this — they are an account-safety decision,
not a throughput knob. A backlog drains at the cap or not at all; that is the
intended trade (confirmed 27-08-2026).

- **A store is never skipped, it is continued.** A run that stops on budget
  with stores left hands exactly those to a follow-up run immediately —
  `?only=<ids>&pass=N`, fired from `after()` so it does not count against the
  run that spawned it, bounded by `MAX_PASSES`. The least-recently-posted order
  already made starvation temporary; this makes it a promise rather than an
  emergent property, and turns "up to fifteen minutes later" into seconds.
  `?budget_ms=` (1s–120s, cron secret required) shortens a run on purpose so
  the chain can be exercised on real data.
- **A failure is classified before it is retried.** `isStoreLevel` (trial
  access, auth) stops the whole store and records the reason;
  `isPermanentPinFailure` (media over the size limit, Pinterest rejecting the
  request, video processing failed) retires that pin; only 429, 5xx and network
  errors are retried. The old loop retried everything three times with 5s/10s
  backoff — three stores' worth of unfixable 403s consumed a whole run.

**Each store connects through its own Pinterest app, and a new app starts on
Trial access.** A trial app *cannot create pins in production* — it answers
every create with `403 code 29 "Apps with Trial access may not create Pins in
production ... use API Sandbox instead"`. That is not a bug and no code change
fixes it: the app needs Standard access from Pinterest. It is why petcura had
40 queued pins, a live token, a live board and zero posts since onboarding.

Two traps around this:

- `settings.pinterest_access_tier = "trial"` switches `PinterestClient` to
  `api-sandbox.pinterest.com`. Setting it does **not** make posting work — it
  makes the failure silent. A sandbox pin returns an id and is written back as
  `posted` with a `pinterest_pin_id`, and it does not exist on the real
  profile. No org has it set; leave it that way unless you are deliberately
  testing against the sandbox.
- The reason a store is blocked now lives on
  `organizations.pinterest_last_error` (migration 087), written by the cron and
  cleared on the next successful post. Check it first.

**Planning outruns the cap, and that is where backlogs actually come from.**
Measured 27-08-2026, pins scheduled per day against `settings.max_pins_per_day`:

| Store | planned/day | cap/day |
|---|---|---|
| petcura | 35 | 5 |
| Smartsporter | 28 | 5 |
| Valerie Mason | 19 | 5 |
| Icon Amsterdam | 15 | 5 |
| Celestia | 14 | 5 |

A store planned at 15/day against a cap of 5 accumulates 10/day forever, no
matter how well the cron runs — and on the pins page that looks identical to a
broken scheduler. That is where the 868 queued pins came from.

Closed from both sides on 27-08-2026, because either alone leaves the hole open:

- `/api/pins/bulk` action `schedule` now **refuses** a `pins_per_day` above what
  the store can publish, and says both numbers. A silent clamp would move the
  surprise to a fortnight later.
- `scripts/align-posting-caps.ts` raises each store's cap to the median it is
  actually planned at, bounded by the method's own ceiling of **20 pins/day**.

**`min_post_interval_minutes` binds before the cap and is the half people
forget**: 15/day with 180 minutes between pins delivers 8, not 15. The script
lowers the interval to `floor(1440 / cap)` where it has to, and never raises it
past what somebody chose. The check in the route uses
`min(cap, floor(1440 / interval))` for the same reason.

**Offboarding a store: cancel its queue.** A store that leaves keeps whatever
was scheduled, and `pins_due_orgs()` keeps handing it to the cron — Smartsporter
left with 55 pins queued and a dead refresh token, so every run spent time
failing on it and every backlog figure counted work nobody intended to publish.
`scripts/cancel-org-pins.ts "Store Name"` moves the open pins (`generated`,
`approved`, `scheduled`) to `cancelled` with a reason; posted pins are history
and are never touched, and nothing is deleted.

`cancelled` is a **new lowercase** enum value (migration 088), not the legacy
uppercase `CANCELLED` that was already there. The enum carries both cases; the
application writes lowercase everywhere, so `.eq("status", "cancelled")` against
an uppercase row matches nothing, silently. Never write the uppercase values.

**When pins are not appearing on Pinterest, check in this order:**
`organizations.pinterest_last_error`; is the pin `posted` with a
`pinterest_pin_id` (then it exists — verify with `GET /pins/{id}` before
believing otherwise); is the org's token alive (`GET /user_account`, 401 means
reconnect); is the store being reached at all (`not_reached` in the run's JSON);
is the head of its queue postable.

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

**A dead connection is retried once, and the pool is sized for how the screens actually fan out.** Both fix the same symptom: *"This screen hit an error"* on the organic app, several times a day, with nothing wrong. Serverless is the cause — an instance freezes between invocations, its sockets die quietly on the other side, and the next request either picks up a corpse or waits out `connectionTimeoutMillis` for a connection that will never come. pg reports it as `timeout exceeded when trying to connect`, the server component throws, and the whole screen becomes the error boundary. `organicPool()` now wraps `query` with one retry for failures that happened **before** the statement ran (connection timeouts, terminated connections, ECONNRESET, 57P01/08006/08003). A query timeout is deliberately NOT retried: that statement may well have executed, and re-running an INSERT that already landed is a worse failure than the one being fixed. `pool.connect()` callers — `generateWaterfall`'s transaction — are not covered either, for the same reason. The pool also went from 4 connections to 16 (8 in dev): the phase-4 page awaits **twelve** aggregates in one `Promise.all` and several fan out again — `loadAccountBrief` alone fires fourteen queries at once — so four was a queue, and the queue is what timed out. Transaction mode is what makes that safe (client connections in the hundreds, not session mode's 15).

**All organic tables live in the `organic` Postgres schema, which is NOT exposed
via PostgREST.** Every read and write goes through `organicPool()` in
`src/lib/organic/db.ts` (direct `pg`). Do not try to reach it with the Supabase
JS client — it fails with `PGRST106 Invalid schema: organic`. The pool is held on
`globalThis` under a `Symbol.for` key, deliberately: a module-level binding leaks
a fresh pool on every HMR reload until the pooler refuses connections, and that
surfaces as an unrelated 500 on whatever page queried next.

**The organic pool talks to the transaction pooler (`:6543`), not the session
pooler (`:5432`).** `organicPool()` rewrites the port in `DATABASE_URL` itself, so
there is no second env var to keep in sync (`ORGANIC_DATABASE_URL` overrides if
they ever need to point somewhere different). Session mode caps *clients* at
`pool_size` — 15 for the whole project, shared by every Vercel instance, every
cron and every dev machine — and exceeding it answers the next connection with
`(EMAXCONNSESSION) max clients reached in session mode`, which Next renders as
"a server-side exception has occurred" on a page that is itself perfectly fine.
Transaction mode hands a server connection out per statement, so the client cap
is in the hundreds.

What must **not** move to transaction mode is a bare `SET` outside a transaction:
it lands on whichever connection served that one statement and is gone by the
next. `src/lib/media-buying/team-activity.ts` does exactly that (`SET
statement_timeout` on a checked-out client), which is why it stays on session
mode. Explicit `BEGIN`/`COMMIT` on a checked-out client is fine either way — the
pooler pins the connection for the transaction.

**The viability gate flags its own bad answers (P1.0.1 / P1.0.2).** A `TaskField`
in `task-fields.ts` can carry a `concern`: which answer is the bad news, what it
costs downstream, and the question that then has to be answered.
`concernFields()` turns each one into three things — a modal that opens on the
answer landing, a warning panel that stays on the row, and a conditional plan box
(`<key>__plan`, stored in `task_answers`; no migration, `field_key` is free
text). Because the plan box is a real visible field,
`syncTaskStatusFromAnswers` holds the task at IN_PROGRESS until it is filled in.
Before this, "no" and "yes" were the same click: The Longevity store sat at DONE
with two failed fit signals and both red flags raised, and nothing on any screen
said so.

Three things about it that are decisions, not accidents:

- **The modal takes the plan, it does not just acknowledge.** A dialog you
  dismiss with "OK" teaches you to dismiss it with "OK".
- **It can be left for later.** Some of these cannot be solved — a one-product
  store is a one-product store — and blocking would make the honest answer the
  one you have to lie to get past. "We accept the ceiling, here is what it costs"
  is a valid plan and the box says so. The flag stays on the row and in the tally
  either way.
- **Adding a `concern` changes what "answered" means for stores assessed
  earlier**, which would silently reopen their finished tasks. It does not:
  status is only re-derived when somebody saves an answer. `scripts/resync-viability-tasks.ts`
  re-derives in bulk (`RESYNC_DRY_RUN=1` first) and is
  deliberately **not** run as part of shipping a new concern — decided
  27-08-2026, when the alternative was reopening a store whose flags cannot be
  fixed. The warnings show on those stores regardless.

**The audit step (P1.2.1–P1.2.12) carries an "all fixed" box.** Every task there
ends in "and which of them have been fixed" — the finding went into the work
panel and the fixing went nowhere, so a week later the only way to know whether
the 63 homepage pins had been repointed was to go and look. Each of the twelve
now asks one boolean plus a conditional "what is still open, and who is fixing
it?". The boolean carries `holdsCompletionWhenFalse`, which is honoured in
`deriveTaskStatusFromAnswers`: filling in every box is not the same as having
done the work, so the task will not close itself while it stands at no, and
`completionHolds()` renders the reason rather than leaving a form that silently
refuses to finish. **The manual status dropdown still closes it** — on this step
the remaining item is usually the client's developer, and closing by hand is a
legitimate call, not a workaround.

Deliberately not asked: *what* the check found. That belongs in the work panel
every one of these tasks already has. Ask for it twice and it gets recorded in
neither place.

**Retiring a task versus merging two.** These are different operations with
different rules, and the difference is whether the SOP still has that many
steps.

*Retiring* (P1.1.2, P1.1.5, P4.1.5): set `active = false` and leave everything
else alone. `activate.ts` filters on `active` so new stores never see it, and
`loadClientTasks` filters on it too, so a lingering row could not render. The id
**stays in `reconcile-spec.ts`'s SPEC list** — it is reported under RETIRED,
where it is explained; drop it and it reappears under EXTRA, reading as
something nobody meant to build. The ids after it are not touched, because the
task could come back. Step 1 therefore still shows gaps at 2 and 5.

*Merging* (P1.1.8 into P1.1.7, migrations 084 + 085): the step genuinely has one
fewer task, so it gets renumbered and there is no gap. Migration 084 did the
merge and left a hole at 8 on the argument that ids appear in prose; that was
overruled on 27-08-2026 — a numbered SOP that runs 7, 9, 10, 11 is not a
numbered SOP, and "there is no eight" is a thing somebody has to be told every
time. 085 closed it. The full sequence:

1. Fold the surviving text into the keeper; move notes and `time_spent_min`
   across.
2. Reopen a keeper that was DONE while the merged-away half was not — it now
   covers work that never happened.
3. `DELETE` the absorbed task's `client_tasks` and `task_preconditions` rows,
   then its definition.
4. Renumber everything after it, **ascending**, one id at a time. The FKs from
   `client_tasks` and `task_preconditions` are `ON UPDATE NO ACTION` and not
   deferrable, so renaming a definition in place fails at end of statement: each
   rename has to be insert-new, repoint-children, delete-old. The children are
   `client_tasks.task_id`, `task_answers.task_id`, `assets.linked_task_id` and
   both columns of `task_preconditions`.
5. Fix the code in the same commit. Today that is `intake.ts` (`P1_1_TASKS` and
   the `cap()` calls), `assets-auto.ts`, `AssetsBoard.tsx`, `IntakeForm.tsx` and
   `reconcile-spec.ts` — `grep -rn "P1\.1\." src/ scripts/` before assuming that
   list is still complete.
6. Grep the *data* too, not just the code. 085 had to rewrite a note 084 had
   written ("carried over from P1.1.8"), because that id now means a different
   task. Prefer naming the task over quoting its id in anything stored.

**An id in an old migration does not mean what it means today.** P1.1.8 is
"Request Google keyword list" now; in 057, 069 and 084 it is "Other social
content", which no longer exists. Old migrations are history and are not
rewritten — read them against the numbering of their own date.

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

To catch up with the Monday clients board (board 5091362359, group `topics` = active), use the pair:

```bash
DOTENV_CONFIG_PATH=.env.local npx tsx scripts/diff-monday-vs-dashboard.ts          # read-only diff
ADD_STORES_DRY_RUN=1 DOTENV_CONFIG_PATH=.env.local npx tsx scripts/add-monday-active-stores.ts
DOTENV_CONFIG_PATH=.env.local npx tsx scripts/add-monday-active-stores.ts          # create the missing orgs
```

**Match on ad account ID, never on name.** The board names and the org names diverge systematically — `www.terrahouseco.com` is `Terrahouse`, `Nova's Jewelry` is `Nova Jewelry`, `Tola Jewelry` is `Tola Jewelry US`. A name-only comparison reported 26 of 52 active stores as missing where only 4 really were; acting on that would have created 22 duplicate orgs. The ad account → org mapping comes from the snapshot tables (same source as `dashboardLinks()`), with normalised name only as the fallback for stores that never had a snapshot — which is exactly the fresh ones. The add script deliberately creates **no** `store_settings` row: department/niche/BER/invoice ROAS/buyer are decisions, not derivable data, so the store lands on "Needs setup" and stays out of Zones and Benchmarks until someone configures it.

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

### Give a colleague a dashboard login

**The invite has to exist before the login link does.** A profile row in
`public.users` is only ever created from a pending `org_invites` row — the
`on_auth_user_created` trigger reads it, and so does `/auth/callback`. Send the
magic link first and the person gets a real session, no profile, and every
screen behaves as if the app were broken. That is what happened to Louiza on
07-09-2026, and to two accounts before her.

Order: **Settings → Team → Invite** (agency admin only) with the exact address,
*then* let them sign in at the dashboard. "Send Invite" sends nothing — it links
the address; hand them the URL yourself. Every agency colleague is
`agency_admin`; the other roles scope someone to a single org, which is not what
a media buyer needs.

`/overview` now names this case rather than saying "unable to load your
workspace", and carries a **Finish setup** button that posts to
`/api/auth/setup-profile` — so an invite added afterwards is picked up without a
fresh magic link. Repairing one by hand is an INSERT into `public.users` with
the id from `auth.users`.

Two things to know before touching this flow:

- **The role dropdown offers "Store Owner (connect-only)", which the `user_role`
  enum does not have** (`agency_admin`, `client_admin`, `client_viewer`,
  `organic_manager`). Inviting one fails; until 08-09-2026 it failed silently.
- **The magic-link box creates an account for any address typed into it**
  (`shouldCreateUser` defaults to true), which is how a stranger's account ends
  up in `auth.users`. They see nothing, but the accounts accumulate. Closing it
  means having the invite route mint the account through the admin API first —
  not done, because that is also what would make "Send Invite" send a mail.

### Add or remove a media buyer

`MEDIA_BUYERS` in `src/lib/media-buying/config.ts`. Lowercase first names —
that is what sits in `store_settings.media_buyer` and what every table renders
verbatim, so a capitalised entry reads as a different kind of value next to
`dylan`.

Every buyer dropdown used to derive its options from whichever stores were
assigned, which cannot represent a buyer who has no stores yet: they are absent
from the app, so there is no way to hand them their first store. `mediaBuyerOptions()`
unions the roster with what is actually assigned — both halves matter, because
dropping a buyer who left the team must not make the stores still carrying their
name unfilterable. Removing someone from the roster is therefore safe and does
not touch a single store.

The one picker deliberately left on data alone is the **Benchmarks** filter: its
options reflect the currently loaded cohort, and a benchmark needs three stores
before it says anything at all (`BENCHMARK_MIN_STORES`), so an option that can
only produce an empty cohort would be noise there.

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
- **Zones has four scopes: last 4 weeks, this month, last month, and a custom range.** The first three render the same zone blocks; only which bucket is in focus differs. On the last-month tab each store card also carries that month's spend / revenue / ROAS, which is what the tab exists for — the finished month, with its own numbers, next to the colour. `StoreZoneRow.last_month` carries those plus the full-month scale floor and the period the store actually ran. There was briefly a separate invoice table on that tab with the billing basis, the monthly floor and a CSV export; it was removed on 02-09-2026 because the page is open on media buyers' screens all day and what the agency bills a store on does not belong there. `last_month` itself stays — it is what fills the cards. The month is located **by key** in `monthBucketKeys(end)`, never at bucket index 1: the zone window ends *yesterday*, so on the 1st and 2nd of a month the three buckets are the three months before it. Verify the figures with `DOTENV_CONFIG_PATH=.env.local npx tsx scripts/check-invoice-month.ts` (`MONTH=2026-07` for an older one), which compares every store against a plain SQL SUM over the same rows and exits 1 on any difference.
- **Zones — a custom range is measured against the WEEKLY floor pro-rated over its own days.** The tab (`/api/media-buying/zones/range`, `computeStoreZonesForRange`, `scaleBasis: "range"`) exists because "this Monday to today" was unaskable. The floor is the one real decision in it: the weekly (€5k revenue) and monthly (€20k) floors are deliberately not derived from each other, so a period that is neither has to pick one, and picking the weekly one buys a checkable promise — **a 7-day range lands on exactly the same colour as the weekly bucket over those days**, which is the tab sitting next to it. It is also the stricter day-rate (€714 vs €657), and a range is a look rather than an invoice, so erring strict costs a false green instead of hiding one. `scripts/check-zone-range.ts` asserts that promise against every configured store, re-adds the amounts from a plain SQL SUM, and runs the input validation (`parseZoneRange`, its own module because a route handler cannot be called without a request scope — in the route those branches are only reachable through a logged-in browser). Two smaller decisions: the range **sums every account-level row for an org** rather than taking the first ad account the way `StoreZoneRow.spend` does — that matches the weekly buckets this page is actually read against; and a group total is only shown when every store in it bills in the same currency, because amounts are never converted and a mixed sum renders exactly like a real number.
- **A day with no snapshot row is a day with no activity, not a missing day.** Pinterest leaves a zero-activity day out of the daily breakdown and `snapshot-metrics` writes only the rows it gets back, so an absent date is not a hole. Proven 02-09-2026: for the two stores a day-counting warning had flagged, Pinterest's own aggregate over 27-08 – 01-09 matched the sum of the days we hold **to the sixth decimal** (Olivia & Rose 115,240688 / 48.765 impressions; Nature Roots 373,040334 / 61.950), so the absent 30-08 and 31-08 contributed nothing. Anything genuinely lost inside the 30-day account-level refresh window is refilled by the next nightly run anyway. `last_month` therefore reports the **period** (`measured_from` / `measured_through`) rather than a day count; `gap_days` is printed by `scripts/check-invoice-month.ts` as information, never as a failure — a warning that was wrong on all three of its hits teaches people to ignore the whole panel.
- **Only the month TODAY is in may be pro-rated.** `classifyMonthBucket` decides that from the bucket's own month key, not from `index === 2`. On the 1st of a month bucket 2 is *last* month — finished — and pro-rating it there lowered its floor by however far behind the snapshot cron was.
- **A paginated PostgREST read that gets SUMMED needs a unique tiebreaker in its ORDER BY.** `snapshot_date` alone is not a total order — hundreds of rows share a date — and PostgREST may then return a row on two pages or on none. Measured 02-09-2026 on the zone engine: 21 of 48 stores had an August total that disagreed with a plain SQL SUM over the same rows, in **both** directions, by up to 3% (Nordheim €219,879 vs the true €212,723). It is invisible from every screen, because the wrong number renders exactly like the right one. `zones.ts` and `store-ranking.ts` now order by `snapshot_date` then `id`; add the tiebreaker to any new loop of this shape.
- **Weekly Updates board — seed then fill (two crons, one design)**: `weekly-update-seed` (Mon 01:00 UTC) creates an empty week row for **every** item in the board's active group; `weekly-update-sync` (Mon 12:00 UTC) fills spend/revenue into those rows. Between them the media buyers write zone + text update by hand. `writeWeek()` therefore freezes on **whether we already wrote the numbers** (`isAlreadySynced()`: spend filled, plus revenue filled unless the store is spend-only), never on whether the subitem exists — freezing on existence means the seed leaves every store empty. Never change one cron without the other. Verify the rule with `npx tsx scripts/check-weekly-freeze-rule.ts`. Updates use `change_multiple_column_values`, which only touches columns in the payload, so zone/text update and manually entered Shopify revenue survive.
- **Weekly Updates board — which columns the cron owns**: the sync writes the week's timeline + send date, spend, revenue (not for spend-only stores) and the four **derived** columns via `derivedColumnValues()`: `Spend last week`, `Revenue last week`, `ROAS last week`, `ROAS (for update)`. Rules that are easy to get wrong:
  - Last week's spend/revenue are **copied from the previous week's subitem row**, never re-fetched from Pinterest. That row is frozen and is what the last client update said, and for spend-only stores its revenue is hand-typed by Tristan and exists nowhere else.
  - ROAS goes in at **one decimal**, like the `formula_mm0qb00` column. Not cosmetic: the `ROAS +/- (%)` formula computes from the *rounded* values, so writing 1.88 where the board shows 1.9 yields a percentage that contradicts the numbers under it. Verified against Monday's own formula column on 43 live rows (0 deviations).
  - Unknown stays **empty, never 0**: a freshly onboarded store has no previous row, and a 0 in "last week" turns the WoW formula into a +∞ jump. Same for ROAS when spend is 0.
  - `ROAS (for update)` is skipped for spend-only stores — we don't own this week's revenue, so we can't compute it. The backfill picks it up later from whatever is then on the board.
  - The three `... +/- (for update)` **text** columns (`text_mm1cbeze` / `text_mm1cxxv5` / `text_mm1cyt41`) mirror the formula percentages as text (because a formula column can't be used in a Slack update). Those stay **manual** by decision on 17-08-2026 — don't automate them without asking.
  - Verify the math with `DOTENV_CONFIG_PATH=.env.local npx tsx scripts/check-weekly-derived-columns.ts` — its expected values are real rows the media buyers filled by hand, so it pins both the rounding and the column IDs.
- **Nagekomen conversies alsnog op het bord — `scripts/refresh-week-numbers.ts`.** De vriesregel houdt een verstuurde week stil, maar Pinterest telt daarna dagen door: gemeten 31-08-2026 stond week 17-08 bij vijftien stores hoger, tot €1.079 (Kateandwendy 7.356,95 → 8.435,90). Dit script is de bewuste uitzondering en draait alleen op verzoek, per week, oud → nieuw meegegeven. Het gaat **alleen omhoog** (een lager cijfer is een creditering of herattributie, en dat achteraf verlagen in een verstuurde update is erger dan laten staan), laat **spend** met rust, laat de revenue van **spend-only stores** met rust (die komt uit Shopify) maar berekent hun `ROAS (for update)` wél uit wat op het bord staat — precies het gat dat de sync zelf niet kan vullen. **Het trekt de wéék erna mee**: `Revenue last week` / `ROAS last week` daar zijn kopieën van de regel die verandert, en blijven ze staan dan rekent de `ROAS +/- (%)`-formule tegen een getal dat op de regel eronder niet meer bestaat. `REFRESH_DRY_RUN=1` eerst; een tweede run is een no-op omdat elke kolom tegen zijn huidige waarde wordt vergeleken.
- **Controleren of bord en Pinterest nog gelijklopen: `scripts/check-week-vs-pinterest.ts`** (read-only, `WEEK_OFFSET=n` voor oudere weken). Spend hoort nooit af te wijken — over drie weken en 120 vergelijkingen twee gevallen, beide verklaarbaar. Revenue die in Pinterest hoger staat op een oudere week is normaal (late conversies); revenue die afwijkt bij een spend-only store is per definitie geen defect, want dat is Shopify-omzet naast Pinterest-attributie. Het script rapporteert ook de valuta-labels: 31-08-2026 stond Kateandwendy op `$` terwijl Pinterest in EUR rekent, en Maldaro had een lege valutakolom.
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
- **Organic — regenerating carries the operator's own work across.** The new waterfall used to get four EMPTY designs and four empty copy sets, so a regeneration cost every uploaded image and every written description. Clarissa uploaded the same four designs twice in one morning — 04:50 and again at 11:31 — for a regenerate she did in between, and regenerating is almost never about the images: it is about the dates, or a board that did not exist yet. Designs and copy now come across by **design number**, which is stable (D1-D3 SAVE, D4 CLICK, in both plans). Three rules travel with it: design QC is **preserved**, because the image is byte-for-byte the same file; carried copy is **re-validated against today's primary keyword** rather than inheriting the old verdict, since the keyword may have been swapped in between; and copy QC always drops to **PENDING**, because the boards and the dates changed and "does this copy suit this pin" is part of that review. The micro-crops are not carried — they hang off the new pins, so P4.2.5 has to run again, and the confirm dialog says so. Proven on a throwaway cycle: 4/4 images, 4/4 copy sets, QC preserved / re-validated / reset as described.
- **Organic — every URL-scoped control must go through the LIVE waterfall.** Regenerating supersedes rather than replaces, so a URL collects one ABANDONED waterfall per regeneration, each with its own four designs and sixteen cancelled pins. Any query joining pins or designs to `w.url_id` without a status filter therefore sees every plan that URL ever had. Fit Cherries' "Bhs" had eight: *"Could not run: 128 pin(s) have no design image yet"* on a cycle whose sixteen pins were all fine, and `generateDesignImages` would have sent **32 designs to Krea instead of four** — real money, on plans that were cancelled. `liveWaterfallId()` is the one way in; `generateMicroCrops`, `generateDesignImages`, the `fresh_technique` stamp and `loadCycleAssets` all use it. `proposeWaterfallStart` deliberately does not — it wants every non-cancelled pin for the same URL, which is exactly what the spacing trigger checks.
- **Organic — regenerating a waterfall replaces the one that is there.** The board-URL trigger (migration 048) allows one URL per board per 180 days *between* cycles, and `generateWaterfall` only ever inserted a second waterfall — so pressing "Regenerate" counted the first one's own sixteen unpublished pins and refused the whole transaction with `Board-URL cooldown violated`, naming a cooldown nobody had violated. It now supersedes first: any plan for that URL with pins inside the 180-day window goes to `ABANDONED` with its pins `CANCELLED` (what the trigger already ignores), and the report says what left the cycle so the screen can too. Three lines that matter: nothing is **deleted**, so the old designs and copy stay readable; a waterfall with a **SCHEDULED, PUBLISHED or FAILED** pin is refused instead, because that is a real pin on a real board and cancelling it to make room is a person's decision; and a cycle that finished **more than 180 days ago** is not considered at all, or the fix would block the next legitimate run.
- **Organic — the pacing numbers live in `src/lib/organic/pacing.ts`, and the database mirrors them.** Checked against module 4 of the training (Pinning Strategy & Systems, 13-08-2026) on 10-09-2026. The ceiling is **5 pins/day per store** — it was 20; module 4 teaches 1-5/day for a new or dormant account and 2-10/day for an established one, and Tristan settled on 5 for everybody (150 a month, more than nine URLs of sixteen pins consume). The number exists in three places — the TS constant, the CHECK on `daily_pin_target`, and `check_daily_volume()` — and `scripts/audit-method-rules.ts` asserts all three agree, because a ceiling that disagrees with itself holds until the one call site nobody updated. Same-URL spacing (48h NEW / 24h ESTABLISHED) is enforced by `check_pin_spacing()` and is exactly the training's rule; **the spacing follows the class automatically** on save, since a NEW store on 24h is a new account pinning at an established pace. `computeUrlsPerMonth` now rounds **down**: rounding up planned 32 pins into 30 slots at 1/day, and the month's second waterfall then failed on the volume trigger depending on where it started. The class is still derived by `recompute_account_classes()`, but that walked the **whole table** on every intake save and overwrote hand-picked values; it now skips `account_class_manual` rows and the age boundary is six months, not twelve (Tristan, 10-09-2026 — looser than module 4 on purpose, and overridable either way). `scale_up_eligible_date` finally does something: it was in the schema from the first organic migration and read by nothing, so every new store sat at 1/day for ever. It re-arms to +14 days whenever the target moves, and the client header says either "may go to 2 now" or the date of the next step.
- **Organic — the cycle gate is the method's answer, not a lock.** `urls_selectable` needs **four** assigned boards (module 4 says four to five; it demanded five), and a URL that fails on topic coverage or board count can still be started **with a reason**, recorded on `urls.gate_override_reason` and shown on the cycle from then on. The cooldown is the one condition an override never reaches — it exists so a URL's new pins do not compete with the ones still out there, and no shortage of URLs makes that safe. This closes a hole that was worse than it looked: "Start new cycle" filtered on `is_selectable` and reported "No URLs are currently selectable", while P4.1.4's proposal on the next screen offered every URL and `startCycleForUrl` checked nothing — which is how Fit Cherries ran two cycles on URLs the other screen called ineligible. Board assignment also only exists *inside* a cycle, so the gate was circular: the blocker text told people to assign boards on the URLs page, where there is no such control. **A store with one product can never reach four boards**, and that is the case the override exists for.
- **Organic — a waterfall start date is computed, not guessed** (`proposeWaterfallStart`, "Find a date that fits"). Sixteen pins at 48h spacing occupy every other day for a month, so whether the second cycle of a month fits at all came down to the **parity of the date somebody picked**; when it did not, they got `Dagplafond bereikt: 1 pins op 2026-09-14` in Dutch, mid-transaction, after choosing designs and copy. The triggers stay the authority — this only finds an answer they will accept and says how far it had to move (measured 10-09-2026 on Fit Cherries: today would hit fifteen full days, the first date that fits is 29 days out). `explainSchedulingError()` turns both trigger messages into a sentence naming the day; anything it does not recognise passes through untouched.
- **Organic — a phase-4 control that does the work must also record it, and a precondition is read inside its own cycle.** Three faults found together on 10-09-2026 when the report was "na regenerate wordt er niets opgeslagen en de volgende taak is blocked". (1) The copy panel on the cycle card had a title box, a description box, live validators and the line *"All validators pass — copy would be committed"* — and **no save at all**. Nothing it said was false; it would have been committed, by something that did not exist. Fit Cherries had four copy sets with every title empty while the screen showed a finished 257-character description. `saveCopyForDesign()` writes it, per design (four designs, four copy sets, shared across a design's crops), through the same UPSERT and the same server-side `validateCopy` as the generated path, and drops QC back to PENDING because text that just changed has not been reviewed. (2) `generateWaterfall` did the work and never marked **P4.3.1**, so P4.3.2 waited for a task that was already done — every phase-4 task on that store was BLOCKED or TODO with a live sixteen-pin plan underneath. Generating now completes P4.3.1 and queueing completes P4.3.2; `scripts/mark-generated-waterfalls-done.ts` catches up what was generated before (5 cycles, `DRY_RUN=1` first, safe to re-run). (3) `status.ts` keyed its status map on `task_id` alone, so with two cycles open on one store the last row won and **one cycle's progress decided whether the other's tasks unblocked**. It is keyed on `cycle::task_id` now, resolving a dependency inside its own cycle and falling back to the cycle-less row for a phase-1-to-3 dependency. Related: `loadCycleAssets` had no status filter, so after the regenerate change it handed the QC panel every design ever planned for that URL — 28 for Fit Cherries, 24 of them from cancelled plans. It reads the live waterfall only.
- **Organic — approving a waterfall queues it; the cron publishes it.** `scheduleWaterfall()` (P4.4.1) moves sixteen PLANNED pins to SCHEDULED and the waterfall to RUNNING, and posts nothing. The sixteen dates are spread over weeks on purpose, so publishing on approval collapses the waterfall into one day and undoes the only thing it exists to do. `/api/cron/organic-post-pins` posts each pin when its date arrives, and that is where the caps are enforced — which is what lets two cycles run concurrently without either knowing about the other. Three distinctions the code refuses to collapse: a **rate limit or 5xx** leaves the pin SCHEDULED and stops that org for the round (recording it as FAILED burns a pin the method already paid for in research and design); a **dead token** is reported apart from a failed pin, because the first needs a person and never fixes itself; and `loadPublishHealth` reports **`stuck`** next to `overdue` — the publish query filters on image, board and title, so without it the panel says "6 overdue" while the cron says "0 due" and nothing reconciles them. `scheduleWaterfall` blocks only on what makes the call impossible or the result wrong (no image, no Pinterest board, no title, QC-rejected copy or design); pending QC warns.
- **Organic — `pinterestClientForOrg()` is how you reach Pinterest for a store.** `src/lib/pinterest/for-org.ts` does the decrypt → check-expiry → refresh → write-back dance that previously only `post-pins` and `refresh-pinterest-tokens` did properly; everywhere else an expired token surfaced as a bare 401 that reads like an outage. It throws `PinterestAuthError` **only** when the store genuinely needs reconnecting, never for a network hiccup or a rate limit, so callers can act on the difference. `pinterestClientsForOrgs()` is the batch form and returns failures rather than throwing — a cron over forty stores must not stop at the first dead token. Existing callers are deliberately not refactored onto it.
- **Organic — conversion KPIs are pulled in a second call, and stay null when unavailable.** `analytics-pull.ts` asks for the core metrics and the conversion metrics separately, because Pinterest answers 400 for the *whole* request when one metric name is not available on the account — folding them together takes the core pull down on every store without conversion access. The upsert `COALESCE`s the conversion columns instead of overwriting, so a month whose access lapsed keeps the figures it had rather than blanking a report that already went out. Only days Pinterest marks `READY` are written, and the window ends **yesterday**: realtime numbers move for about a day, and a report that changes after it is sent is worse than one that lands a day later. Prefer `daily_metrics` over lifetime totals — `pin_performance` is keyed on `(pin_id, measured_on)` and a lifetime figure written against one date reads as a single enormous day. `ANALYTICS_FILTERS` is exported so the screen shows the four fixed filters above the numbers; a figure that looks wrong is almost always a filter.
- **Organic — the volume cache is lowercase; the keyword bank is not.** `normalizeTerm()` lowercases everything written to `organic.keyword_volume_cache`, but `organic.keywords` keeps its capitals on purpose — parent interests are taxonomy labels and have to read as themselves on a board. So every comparison between the two matches on `lower(term)`: the queue close in `submitPinClicksResults`, the `keywords` updates in P3.1.10 and P3.1.12, and the cache lookup in `dedupeAgainstCache`. An exact match looks like it works, because most terms are lowercase already. It silently left eleven of Fit Cherries' 323 lookups QUEUED with their volumes sitting in the shared cache (07-09-2026) — the work done, the screen saying it was not, and the next work list asking for the same terms again. `scripts/close-stuck-volume-queue.ts` closes any queue row whose answer is already cached, and is safe to re-run.
- **Organic — one keyword, one row, whatever case it is typed in.** P3.1.9 keeps its capitals on purpose (a parent interest is a taxonomy label and has to read as itself on a board); everything else in phase 3 normalises to lowercase. Both used to upsert on the exact term, so "Lingerie" landed *next to* the existing "lingerie" — and the older row was the one holding the validated volume and the cluster. `setParentInterests` and `formTopicClusters` now adopt whatever is already in the bank on `lower(term)`: the parent interest takes over the row and gives it the label's spelling, a cluster is added to the row that exists. `scripts/merge-case-duplicate-keywords.ts` merges what the old behaviour made (oldest row survives, most structural type wins, proper-noun spelling wins, flags OR'd, `url_keywords` repointed, loser deleted *before* the rename or the unique index refuses it). Ran 08-09-2026: 5 groups on Fit Cherries, 375 → 370 keywords, none left agency-wide.
- **Organic — no phase-3 write may loop one statement per keyword.** A keyword bank is hundreds of terms (375 for Fit Cherries) and a PinClicks session is the whole work list at once. `submitPinClicksResults` ran three statements per term — ~970 round trips — and answered `HTTP 504 FUNCTION_INVOCATION_TIMEOUT` on a normal session, which is indistinguishable from lost work: nothing commits, the draft is all that survives. Everything that writes per keyword now goes through `unnest()` in batches of 500 (P3.1.1–P3.1.5, P3.1.7, P3.1.8, P3.1.10, P3.1.12), the same shape migration 089 gave the competitor import. Two rules that come with it: **deduplicate on the normalised term first** — `ON CONFLICT DO UPDATE` refuses to touch one row twice inside a statement — and keep `ON CONFLICT DO NOTHING` where duplicates inside the batch are expected.
- **Organic — P2.1.6 takes files, and an import is repeatable.** The competitor export is the biggest body of raw research the method collects (700–1000 pins × 5–10 competitors — **a target, not a floor, decided 06-09-2026**: few competitors in a normal niche hold that many, and selecting competitors by pin volume selects for accounts that are already fully organic-optimised rather than the ones the client competes with. Take what the competitor has and record the count; migration 093) and it had never once run on a live store: the importer wrote one INSERT per row against a route capped at `maxDuration = 60`, so a single competitor could not finish. Rows now go in 500 at a time through `unnest()` (1000 rows ≈ 0.7s), the upload screen takes one CSV per competitor and matches dropped files to competitors by name, and migration 089 adds a unique index on `(competitor_id, pin_url)` so re-importing after a half-finished run counts duplicates instead of writing them — without it a recovery attempt silently doubled the volume that P2.2.1 reasons over. Three rules in the parser are load-bearing: the **delimiter is detected**, not configured (a European Excel writes semicolons, and a comma-only parser reads such a file as one column while reporting "Imported 1000 rows"); the **BOM is stripped** or the first header name never matches; and a **CSV without a pin-URL column is refused**, because nothing can be deduplicated on and P2.2.1 has no pin to point at — volume with no evidence is the one failure that looks like success everywhere downstream.
- **Organic — P2.1.6 completes per competitor, not per file.** It is the one task that does not go through `completeTaskByDefinition`: that helper overwrites `time_spent_min` and demands a positive number, and one export of six is not a finished task. `recordImportProgress()` accumulates the minutes (the screen books them once, with the first file of a batch), holds the task at `IN_PROGRESS` until every competitor has pins, and leaves `BLOCKED` alone — blocked is computed from preconditions and importing a file does not clear one.
- **Organic — an imported URL needs a topic, or it is dead on arrival.** `organic.urls_selectable` gates on `topic_covered`, which is a LEFT JOIN on `topic_id`; a null topic joins nothing, coalesces to false, and the URL can never enter a cycle. The importer wrote null on every row it ever created and nothing in the app could set one, so Fit Cherries sat at **167 URLs in the pool / 0 URLs eligible** and no amount of board building would have moved it. Three halves to the fix and all three are load-bearing: `acceptProposals` now carries a **proposed** topic (`matchTopic()` scores the URL's name and path against each topic's own board names and primary keywords — a topic called "Women's Underwear" shares no word with "Wireless Push Up Bra", but the boards under it are called "Push Up Bras For Small Bust"; an exact tie between two topics returns null, because picking the alphabetically-first would be a coin toss presented as a decision); `setUrlTopic()` + the picker on the URLs library page set the ones it cannot place, with a bulk assign that only ever fills empties; and `upsertUrl` now does `topic_id = COALESCE(EXCLUDED.topic_id, organic.urls.topic_id)` so a re-import cannot blank a topic somebody chose. `scripts/backfill-url-topics.ts` (`BACKFILL_DRY_RUN=1` first) does the same for what was already imported. Expect a low automatic hit rate and do not tune it up — 17 of 167 on Fit Cherries, because most of the rest are quiz pages and duplicate collections that genuinely belong to no topic. A wrong topic is worse than an absent one: it counts towards a coverage figure somebody then trusts.
- **Organic — the creation schedule puts the boards a running cycle is waiting on first.** The pace is unchanged (three a day, module 4); which three is not. `generateCreationSchedule` ordered by board age, so "Bikinis for Petite Women" — carrying seven scheduled pins — sat at position 20 and would have been created on the 17th, holding a whole waterfall for a week over its fifth board. It now sorts by how many live-cycle pins are waiting on the board, then by age. Re-running it is safe and re-sorts what has not been created yet.
- **Organic — boards are created by a cron, not by a person pressing a button per store per day.** That is what the dashboard is for: the architecture is designed once, the boards appear on the account by themselves, and the waterfall schedules pins onto them. Until 10-09-2026 `createBoardsToday()` only ever ran from the P3.3.5 button on one store — fifty stores means fifty clicks a day, every day, for a job the method already has a schedule for. `/api/cron/organic-create-boards` (05:30 UTC) does it for every store in `organic.client_settings`. Three things worth keeping: the **pace is not the cron's** (three per store per run, and `check_board_pace()` refuses a fourth the same day — running hourly would change nothing, and the burst is what Pinterest flags on a young account); **P3.3.5 closes when the queue is empty**, not on the first run, via `recordTaskProgress` — a store with 23 boards is a week of runs and marking it DONE on day one says the architecture is live when none of it is; and **`dryRun` now writes nothing**. It used to "just flip locally" — set the rows to PROTECTED with today's creation date without ever calling Pinterest — which is not a dry run but a lie recorded in the database: the board shows as live, coverage counts it, and no such board exists on the account. Tolerable behind a button pressed once, not behind a cron carrying `?dry_run=1`.
- **Organic — the waterfall panel has the step that locks the plan in.** Section 3 could only generate and regenerate: sixteen pins sat at PLANNED, which the publishing cron ignores, and the next visit offered the same button again — so the work was redone rather than finished. **Save & queue** calls the same `push` action as P4.4.1's control (`scheduleWaterfall`), moving the pins to SCHEDULED and the waterfall to RUNNING, and it closes P4.3.2. It asks first, because after queueing a regeneration cancels real scheduled pins rather than a plan. It only appears while the waterfall is PLANNING; a RUNNING one says so instead.
- **Organic — a board that already exists on Pinterest is not `PLANNED`, and coverage needs ONE covered topic, not all of them.** Both found on 10-09-2026 chasing "step 4.1 URL selection is still blocked and I don't see why". Three separate things were true at once. (1) The `topic_coverage` precondition demanded that **every** topic in the store be covered — a rule the method does not have, since coverage gates phase 4 *for what sits under that topic* and `urls_selectable` already enforces that per URL. Fit Cherries had two stray topics from the keyword work ("Fashion", no boards; "Lingerie", one) with no URLs under them, which would have kept step 4.1 shut even after the three real topics were built out. It now needs one covered topic, and the reason names which of the three faults is in the way. (2) **28 boards imported from the main dashboard** (`origin = MIGRATED`) carried their real `pinterest_board_id` at status PLANNED — "designed, not created". So the creation scheduler queued them and the next "create boards today" would have made a second *On-Sale (NL & BE)* on the client's own account; nine were due. `adoptExistingBoards()` reconciles against `getBoards()`: each row takes the privacy and pin count Pinterest reports, and a board that is no longer on the account has its id cleared. It runs at the start of `createBoardsToday`, and **nothing with `origin = MIGRATED` is ever queued for creation** — if the client deleted one since the import, that was their decision. It does not stamp `created_on_pinterest`: that column means "we made this, on this day" and `check_board_pace()` counts it against the three-a-day rule, so adopting is not creating. Migration 095 narrows `public_needs_seeding` to boards the method builds — a client's own PUBLIC board with four pins has to be recordable as what it is. (3) The queue those migrated boards were sitting in had pushed the 23 real boards out to 17-25 September; rescheduling put them on 11-18, so the first topic reaches five live boards two days out instead of ten.
- **Organic — `topic_covered = false` is three different faults and must be reported as three.** For a year every surface rendered that one boolean as *"sits under a topic with fewer than five boards"*, which is true of one of the three states and sends the manager to the boards screen in all of them. Fit Cherries was wrong twice over: the URLs had **no topic**, so there was nothing to build boards for, and the topics that existed held seven **PLANNED** boards each and zero created — and `topic_coverage.is_covered` counts only boards that exist on Pinterest (`SECRET`/`PROTECTED`/`PUBLIC`), never boards on paper. `checkUrlReadiness()` and `loadCycleReadiness()` now split them: no topic → set one on the URL; designed but not created → create them (P3.3.4); genuinely short → build more (P3.3.2). A fix that cannot work is worse than no fix, because somebody follows it for weeks and watches nothing change.
- **Organic — the URL pool is imported, not typed.** `url-import.ts` has two sources: `fromSitemap()` (what pages exist) and `fromTopPins()` (what Pinterest already rewards — smaller, worth more). Neither writes; both propose and `acceptProposals()` goes through `upsertUrl` so there is no second, laxer path into `organic.urls`. **Collapse locale variants or the cooldown is defeated**: a Shopify sitemap lists `/products/x`, `/nl-nl/products/x` and `/en-nl/products/x` as three entries for one page, and each would carry its own 60-day cooldown. The unprefixed URL wins; a bare two-letter segment counts as a locale only when an unprefixed sibling proves it. Classification falls back to **SELECTION**, never PRODUCT — PRODUCT is the one type that publishes with no text overlay, so guessing it wrongly is the expensive mistake. GA4/Search Console is the third source and is deliberately absent: no OAuth grant exists for it yet, and a half-wired source makes the other two look unreliable.
- **Organic — P4.1.4 / P4.1.6 / P4.1.7 / P4.1.8 propose, they do not decide.** `proposeMonthlySelection()` and `proposeCyclePrefill()` read only; applying is a separate call, and `applyCyclePrefill` refuses to overwrite an existing assignment unless explicitly asked — re-running a proposal over boards somebody hand-picked is how people stop trusting a tool. Every suggestion carries its reason, so the manager reviews a proposal instead of auditing a black box. What the system cannot know is what the client wants pushed this month (stock, a launch, a campaign elsewhere), which is exactly what P4.1.3 and P4.1.4 are for.
- **Organic — `url_keywords.is_overlay` is P4.1.8's actual output** (migration 083). Before it, the task asked for three to five overlay terms and had nowhere to store the answer, so `generateDesignBrief` just took the first five non-primary keywords — a decision with no effect. The brief falls back to that behaviour when nothing is marked, so an untouched store is unchanged. A CHECK keeps the primary out: it already opens the title. The picker prefers three-word-plus terms but does **not** filter on them — plenty of banks are all two-word terms, and a task specified as "three to five" that returns nothing has failed, not found nothing.
- **Organic — seasonality belongs on the keyword** (`keywords.peak_window_start/end`, migration 083). It lived only on `urls`, so "wool scarves peak in November" had to be retyped for every URL using the term and in practice never was. A URL inherits the window from its primary keyword; its own setting still wins, because a URL can be seasonal for a reason unrelated to its keyword (a dated campaign, a launch).
- **Organic — P4.1.5 is retired** (`active = false`, 26-08-2026). The reason is now set when the URL enters the pool rather than as a step of its own. `urls.reason` itself is still load-bearing — `candidateUrls()` builds the PROVEN_WINNER / PHASE1_TOP_PIN / NEW_URL labels from it and `upsertUrl()` requires it.
- **Organic — a QC rejection steers the retry.** `generateImagePromptForDesign(orgId, designId, { steer })` puts the rejection reason last in the context, and `generateDesignImages(..., { onlyRejected: true })` regenerates just what came back. Before this the reason went into the database and changed nothing: "regenerate" re-rolled the same brief and produced the same problem. Regenerating all four would also discard designs somebody had already approved. And `generateDesignImages` must **not** touch `designs.filename` — `generateWaterfall` set it from the primary keyword (P4.2.6, Pinterest reads file names with OCR), and overwriting it with the storage path threw that signal away on every AI-route design.
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
- **Organic — `brief.ts` is what phase 4 decides on; `research.ts` is what it refers back to.** Two loaders on purpose. The brief is small, typed and opinionated, with a fallback for every gap, and it feeds the design brief, the advice and the deviation checks. The research record (`loadResearchRecord()`, rendered at `/client/[orgId]/research`) is everything phases 1–3 produced — including **`organic.task_answers`**, every answer, every piece of reasoning and every attached file, which no surface outside the task itself had ever read back. Folding them together would grow the brief into a hundred-field object where the six values that actually drive production get lost, and would give the record the brief's opinions about what matters. Add automatic influence to the brief; add lookup-only context to the record.
- **Organic — a retired question keeps its answers.** `AnsweredItem.retired` marks an answer whose field no longer exists in task-fields.ts (P1.0.1 went from six good-fit signals to three). It renders under the field key with a marker rather than being hidden: deleting it would rewrite what the assessment actually said at the time, and showing it bare reads as a bug.
- **Organic — where the build reference contradicts itself, section 2 wins.** It is headed "HARD RULES — NUMERIC REFERENCE"; the phase prose is narrative. Two known contradictions, both resolved to section 2 and both asserted in the audit: seasonal ramp-up is **6–10 weeks** (phase-4 prose said 8–12), and board descriptions are **400–480** characters (the CHECK said 400–500). Where the contradiction has a safe side, take it — publishing late is the method's most common failure and there is no penalty for early, so `ramp_up_start` is peak **− 10** weeks, the point the window opens, not the midpoint it used to be.
- **Organic — `ORGANIC_TASK_SPEC.md` + the build reference are the method; check against them with `scripts/audit-method-rules.ts`.** `DOTENV_CONFIG_PATH=.env.local npx tsx scripts/audit-method-rules.ts` asserts the hard numbers from the build reference against the live schema and the live code — copy limits, the 80/20 split, the waterfall rotation, the DB-level constraints, pacing per account class, the 20/day ceiling, the agency-wide volume cache, the 60-day URL cooldown — and exits 1 on any divergence. It exists because a rule was **invented in code** and looked identical to a rule from the method three months later.
- **Organic — the save/click split is fixed at 80/20; the overlay is decided by URL page type.** An earlier version derived the split from `grid_analyses.text_overlay_bucket` (MOST → 45/55). That was invented, not the method. The build reference fixes save at 80% (2:3, **zero** text overlay, lifestyle) and click at 20% (9:16, overlay, CTA), and decides overlay per URL: PRODUCT usually not, COLLECTION / BLOG / GALLERY / SELECTION yes. The grid reading still reaches the designer — "page one is text-heavy here" changes how a click pin is drawn — but it must not move the split, which is a pacing decision about the account, not a response to one search result.
- **Organic — the waterfall rotation is `(designIndex + copyIndex) % boards.length`, never `% 4`.** It was `% 4` with the board list sliced to four, so on the normal case — the method asks for a **minimum of five** boards per URL — the fifth board and beyond were assigned and never received a pin.
- **Organic — nothing is orphaned any more; `loadAccountBrief()` reads every research table.** `competitor_pins` (summarised to its top boards — six hundred rows do not belong in a brief, but which boards a competitor's winners sat on is a board-choice signal), `keyword_clusters`, and `design_templates` (only the proven ones, into `designBrief.proven_templates` and the copy prompt). The link audit reports 0 unused; a regression shows up as a section going absent rather than as silence.
- **Organic — the phase-5 loop closes: P5.2.3 writes `is_proven`, the design brief reads it.** `loadTemplateStandings()` ranks templates on outbound clicks then saves — impressions are deliberately absent from the panel, because putting them on screen invites marking a template proven on reach alone. P5.3.3 drafts the forward-looking paragraph through the same validator harness as the copy; with no trend notes recorded it says the reading is thin rather than inventing movement, which is the one thing that section cannot do.
- **Organic — phase 5 is execution too, and has `Phase5Action.tsx`.** It was falling through to the generic `PhaseBoard`, so thirteen monthly tasks rendered as note boxes. Same five kinds as phase 4; `readout` and `external` carry more of it there because most of phase 5 genuinely is read-and-judge rather than press-a-button. Every task there now has a control: **P5.2.3** marks templates proven (`loadTemplateStandings()`) and **P5.3.3** drafts the forward-looking note, both built after this file first said they were the honest remainder.
- **Organic — P2.1.7 and P2.3.2 have structured tables, not note boxes.** `organic.top_pin_designs` (per keyword: pin URL, title, description, annotations, three hexes) and `organic.audience_affinities` (name, index, **is_surprising**, note). Deliberately not folded into existing tables: `competitor_pins` is per competitor and these are per keyword including our own, and `taste_graph.related_interests` is a flat array with nowhere to record strength or whether a correlation was surprising — which is the part the method says produces content angles. Annotations here never write to the keyword bank: an annotation is research until it passes a volume check.

  Both forms were repeaters that saved and then looked as if they hadn't (fixed
  01-09-2026), and the three reasons are worth not reintroducing. They **load on
  mount** — the list used to open behind an "Open the pin list" gate, so
  re-opening the form after a save showed one empty row and read as data loss.
  They **complete their task**: alone among the phase-2 forms these two took no
  `time_spent_min` and never called `completeTaskByDefinition`, so a filled-in
  list left the task at TODO with nothing on any screen saying it had been done.
  And a **half-filled row is refused by name, not skipped**: the save `continue`d
  past any row missing a keyword or a pin URL, so six pins where five still
  lacked their URL saved as one and reported success. The replace also runs in a
  transaction — a DELETE followed by an INSERT loop that fails half way is the
  literal mechanism of "my list disappeared".
- **Organic — a store-readiness precondition does not apply inside a cycle.** `requires_check` conditions (`topic_coverage`, `urls_selectable`) ask whether the STORE is ready to start phase 4. Phase-4 tasks are seeded per cycle, so those checks were being evaluated on tasks living inside a cycle that had already started — and P4.1.4 is *"select this month's URLs"*, in a cycle that exists **because** a URL was selected. Fit Cherries had "Select URLs · BLOCKED" on two cycles whose URLs it had already selected, with no way out: the check reads `urls_selectable`, and those URLs were started through the override precisely because they do not pass it. `evaluateBlockReasons` now skips `requires_check` when the task carries a cycle; a cycle-less row still gets the full check, which is what gates starting phase 4 in the first place. Task-to-task preconditions are untouched — those are about this cycle's own order of work.
- **Organic — the copy Save button explains itself instead of going grey.** It was disabled on `!validation.overall.ok`, which on empty boxes is a dead button that reads as broken — reported as exactly that. It is the third time this pattern has bitten (phases 2 and 3 gated Save on time-on-task the same way). Copy is the one form that genuinely cannot be half-saved: `copy_sets` has DB CHECKs for a ≤100-char title and a 250-300 description, so there is no "save what is filled in" to fall back on. So the button is always pressable and names what is missing, and `useFormDraft` now keeps the boxes — keyed `P4.2.8:<designId>`, with the editor **remounted per design** (`key={design_id}`). That remount is load-bearing: the draft hook captures its baseline at mount, so without it the first design's baseline would follow you to the second and report one design's text as "restored" under another.
- **Organic — every phase-4 control records its own task.** Phase 4 used to leave its tasks where it found them: sixteen pins under a BLOCKED P4.3.1, four uploaded designs under a BLOCKED P4.2.4. The person doing the work sees a red pill saying the opposite of what they just did, and everything downstream stays shut. `recordCycleWork()` closes a task when the thing it produces is actually there — P4.2.3 on assembling the brief, P4.2.4 when every design has an image (uploaded **or** generated), P4.2.5 when every pin carries one, P4.2.8/P4.2.9 when all four copy sets are written and past the validator, P4.2.7/P4.2.10 when every design and copy set has been judged, P4.3.1 on generating and P4.3.2 on queueing. The setup step too: **P4.1.1 and P4.1.4 close the moment a cycle exists** — it exists *because* a URL was picked out of the pool, which is exactly what those two tasks ask for — and P4.1.6/P4.1.7/P4.1.8 close when the keywords, the four boards and the overlay terms are actually on the URL. P4.1.8 only closes when something was marked: the design brief falls back to the first long-tail terms otherwise, and "the fallback ran" is not "somebody chose". It goes through `completePhase4Task`, not `recordTaskProgress`: that one refuses to move a BLOCKED row, and BLOCKED is exactly the state these get stuck in. A precondition describes the SOP's **order**; finished work is a fact about reality, and reality wins. Never the other way round — nothing is closed on a promise, only on the artefact. `scripts/reconcile-phase4-tasks.ts` catches up what earlier runs left behind (`DRY_RUN=1` first, safe to re-run).
- **Organic — uploading a design is the normal route on this account, generating is the fallback.** Decided 10-09-2026: the generated images are not good enough for Fit Cherries, and the designs come out of Canva. So the per-design **Upload design** button is the prominent control and "Generate the four designs instead" is the quiet one beside it, with the difference stated — generating replaces all four at once, uploading touches one. The C2PA note stays on screen because it only applies to the AI route: apply the 1% transparent frame in Canva before export.
- **Organic — a design image can be uploaded, not only generated.** Krea was the ONLY way an image could ever reach a design, which quietly made the whole method conditional on a funded Krea balance and on the AI route being right for that account. It is not: `designs.route` has carried DIRECT since the first migration, the build reference sends accounts with usable lifestyle material down it, and plenty of designs are drawn in Canva. There was simply nowhere to put the file, so every design on Fit Cherries sat at `asset_path = null` — and no image means no crops, which means no pin, ever. `saveDesignImage()` + `POST /api/organic/phase4/<orgId>/design-image` (multipart, because a 4 MB design does not belong in a JSON body) take one file per design; the P4.2.4 control lists the four designs with a thumbnail and an Upload/Replace button each, next to the generate-all button. Two rules travel with it: the object gets the **SOP file name**, not the upload's — Pinterest reads it out of the URL, so "Untitled-3.png" lands as `padded-push-up-bras-d1.jpg` — and QC drops to PENDING, because a new image has not been reviewed.
- **Organic — the SOP file name is rebuilt from the URL's CURRENT primary keyword at the moment the file is created.** `generateWaterfall` stamps `designs.filename` at generation time, and a keyword swap afterwards leaves it pointing at the old term: Essential High Waist carried `gifts-for-her-d1.jpg` against a primary keyword of "small bust swimwear" (10-09-2026, repaired). Both image routes now derive it fresh. The old rule still holds and is the reason this is worth stating carefully: `filename` must never be overwritten with the **storage path** — that is what replaced "gold-hoop-earrings-d1.jpg" with "design-1.jpg" and threw the P4.2.6 signal away.
- **Organic — `scripts/check-publish-chain.ts` answers "can this store actually publish?"** `DOTENV_CONFIG_PATH=.env.local npx tsx scripts/check-publish-chain.ts "Fit Cherries"` walks token → boards on Pinterest → per cycle: image, title, board, QC, pin status, using exactly the conditions `publishDuePins()` and `scheduleWaterfall()` filter on, and exits 1 on anything in the way. It exists because most links in that chain fail **silently**: a pin whose board does not exist on Pinterest yet is simply not returned by the publish query. No error, no failure count, it just never goes out.
- **Organic — every phase-4 task now has a working control.** The four that did not are built: **P4.2.4** generates the four designs through Krea (`generateDesignImages`, one prompt per design so the four are genuinely distinct, SAVE at 2:3 and CLICK at 9:16, stored in the `pin-images` bucket rather than referenced at Krea because a generated URL there expires); **P4.2.5** cuts the micro-crops with `sharp` (variant A keeps the original, B/C/D take 96% of the frame from a different corner — this is why four copy sets per URL is right and sixteen would be waste); **P4.2.7** and **P4.2.10** are design and copy QC against `designs.qc_status` / `copy_sets.human_qc_status`, and a rejection **requires a reason**, enforced server-side so every caller gets the rule. Image generation needs `KREA_API_KEY` **and a funded Krea API balance** — that balance is separate from the workspace compute balance, and an empty one returns a clear 402 through the UI. The route runs at `maxDuration = 300`: four generations are polled in parallel with a 180s ceiling each, and 60 would cut a normal run in half.
- **Organic — board warming is Johanne's SOP (module 2, 06-08-2026, 1:05–1:14) and nothing else.** A new board stays hidden, is warmed with 10–15 of the client's **own** pins — first pins already on the account, otherwise pinned from the website with the Pinterest widget (a person with the login) — and goes public at ten; never a competitor's pin. Module 4 (1:21) adds that a pin on a private board must still fit it. How that is built, since 11-09-2026:
  - **P3.3.6 proposes, a person chooses.** `proposeSeedPins()` reads every pin on the account and keeps only those whose link is on `client_settings.domain` — that is the "own content" check, not an assumption, and it refuses to run without a domain. `pickSeedPins()` (ai.ts, `claude-opus-5`, structured output) judges which fit which board; word matching was tried first and failed both ways ("small bust" never matched "small breasts"; loose, a lingerie pin topped "Bikinis for Petite Women"). Rows land in `organic.seed_plan` (migration 097) as PROPOSED; the panel approves per board or removes single pins (REMOVED is kept, so a re-proposal does not offer it again). A new proposal reopens P3.3.6; it closes when nothing is left unreviewed.
  - **Saving is `POST /pins/{id}/save`, not `createPin`.** The old code created up to fifteen *duplicate* pins per board in one burst — and never ran, because the button sent no plan and crashed on "r is not iterable".
  - **Ten a day per store, one per hourly run** (Tristan, 11-09-2026; `SEEDS_PER_DAY`). There is deliberately no "seed now" button. Order: every board's first ten before anyone's eleventh, then the board with the earliest live waterfall pin, then creation date and the proposal's rank.
  - **Public means public on Pinterest.** `goPublicIfWarm()` PATCHes the board first and then writes the row, and decides on Pinterest's own privacy, never our status column. The `auto_publish_board` trigger that flipped the *row* to PUBLIC at ten pins without telling Pinterest is dropped (097): it had marked hidden catalogue boards ("Products", 191,632 pins) as public. Pinterest's `pin_count` lags a save by a moment, so our own count is the floor.
  - **A board the account's own pins cannot fill needs the widget** — Fit Cherries has six (the strapless, adhesive, backless and sports-bra boards). The panels say so per board; P3.3.7 stays IN_PROGRESS naming them. That is the SOP's second route, not a gap.
- **Organic — the Creative Machine is Johanne's tool, ported as a TEST (11-09-2026).** `/client/[orgId]/creative`, `src/lib/organic/creative-machine.ts`, migration 098. It is her `pinterest-creative-machine` app from module 3 (zip on Drive, linked from the Module 3 Notion page): brand brief + 3–10 brand images → `BRAND_STYLE_LOCK`; per campaign 1–5 Pinterest inspirations → insights; a scenario count with a full/partial/no-human split + 1–3 product images → a closed scenario library; per scenario a prompt that is pasted into **Google Flow by hand** with the product image. Her prompt texts are verbatim and so is her model (`claude-sonnet-4-6`) — the point is to compare with what she showed; only storage differs (database per store instead of localStorage) and the brief is prefilled from the intake. Nothing here generates or publishes images: the kept image goes in through the P4.2.4 upload, which names the file. Measured on Fit Cherries: brand analysis 48s, 40 scenarios in 71s with the split exact. **To remove:** that lib file, `src/app/api/organic/creative/`, `client/[orgId]/creative/`, the sidebar link, and the two tables. Do not wire it into phase 4 before the test says the images are worth it.
- **`getBoards()` returns every page.** It read the first page only (25), and `adoptExistingBoards` treated every board not on it as deleted and cleared its Pinterest id — three real boards on Fit Cherries (29 on the account). It now pages, and re-links imported boards that lost their id by exact name.
- **Organic — the C2PA metadata-stripping step is deliberately NOT built.** The build reference rules it out: at twenty accounts from one infrastructure it becomes a detectable pattern, and a suspension would take the paid side down with it. It stays manual in Canva if anyone wants it. Do not add it.
- **Organic — phase 4 is EXECUTION; give a task its control, never a note box.** Phases 1–3 capture research, so note-and-attach is right there. Phase 4 links boards, assigns keywords, makes images and puts pins live — copying the research pattern onto it made the dashboard paperwork *about* the work instead of the tool that does it. `Phase4Action.tsx` holds one entry per task: `run` (a button that calls the backend), `panel` (the control is in the cycle card above), `external` (names the tool), `readout` (the system did it, here is what to check), or `missing` — which renders **"No control yet"** in red with what will be built. Never paper a missing control over with a note field. The registry is written task by task, not derived from `task_type`, because the type says who acts, not what the control is.
- **The organic app must reuse the main dashboard's execution machinery, not reinvent it.** `src/lib/ai/pipelines/strategy-pipeline.ts` already generates keywords + a board plan into `public.keywords`/`public.boards`; `content-pipeline.ts` generates pin copy into `public.pins` + `public.calendar_entries`; images run through Krea (`/api/ai/generate-images`, `src/lib/krea/client.ts`), overlay through `src/lib/image/overlay.ts`, approval through `/api/pins/[id]/approve`, publishing through `/api/cron/post-pins`. The organic app built a parallel world in the `organic` schema and wired **none** of the doing. Only the research inputs, the board-linking rules and the waterfall concept differ — the generation, overlay, approval and publishing steps are the same job. Check what exists there before building it again.
- **Organic — phase-4 step routes must work with no cycle running.** Phase-4 tasks are recurring, so they exist only inside a cycle and `loadClientTasks` excludes them. Every `/phase/4/[step]` route therefore read "No tasks in this phase yet" on any store that had not started a cycle — which is every store before its first one, so the manager could not find out what step 4.2 involves without first starting the cycle they were trying to understand. `loadPhase4StepTasks()` returns `instances` (live cycle tasks, rendered as full cards) and `template` (the SOP definitions, read-only) so the step is always legible.
- **Organic — `scripts/seed-phase4-walkthrough.ts <orgId>` makes phase 4 reviewable.** Seeds a topic, five boards (descriptions are 400–500 chars, enforced by a CHECK — a placeholder is rejected), five URLs with reasons and funnel stages, five keywords with cached volume, assigns all of them, and starts one cycle so all 22 tasks are live across 4.1–4.4. `--remove` reverses it. It refuses to run on a store with cycles it did not create.
- **Organic — a cycle task is a task; render it with the same `TaskCard`.** Phase 4's twenty-two SOP tasks used to render as a read-only list of id, name and a status pill, so a manager could see that P4.2.5 existed and was TODO and had nowhere to read what it asks, record it, attach the designs or close it. `TaskCard` is exported from `PhaseBoard.tsx` and used by `Phase4Cycles`; `CycleTaskRow` carries the full definition (description, guidance, expected_output, external tool/url, skip fields) rather than six columns. Every phase-4 task has an `expected_output`, including the AUTO ones — "the system does it" is not "there is nothing to check", and that line says what to look at when the output is wrong, which is when somebody opens the task.
- **Organic — the ten connections from ORGANIC_TASK_SPEC.md are asserted by name in the audit.** The spec's DATA FLOW MAP says: *"The ten connections that must work. If any of these requires the manager to look something up manually, the build is wrong."* `scripts/audit-research-links.ts` checks each one as `FLOW 1`–`FLOW 10` against real data. All ten pass. Two carry a deliberate divergence, both from the standing override rule: **FLOW 7** (frequency → URL selection) and **FLOW 9** (coverage → board assignment) are the spec's "blocks", and neither blocks — they raise a visible deviation instead, because the manager may always overrule. Add a flow here whenever the spec gains one.
- **Organic — verify the research links with `scripts/audit-research-links.ts`, not with grep.** `DOTENV_CONFIG_PATH=.env.local npx tsx scripts/audit-research-links.ts [orgId]` walks every phase 1–3 table to the phase 4–5 decision that consumes it and checks **by value** against that org's real rows, exiting 1 on any break. A grep proves a table is referenced; it does not prove the value arrives, and the two have come apart three times here — copy written by an UPDATE that matched nothing and still returned ok, a name matcher so loose every board scored identically, and a grid lookup that only ever exercised its fallback. Run it after touching anything in brief.ts, structure.ts or phase4.ts. It picks a URL whose primary keyword is actually gridded, so the match path is tested rather than the fallback; a section is only counted as data when it is **answered** (`client_viability.verdict IS NOT NULL`, `market_analysis_items.status = 'APPROVED'`), because both tables carry rows that mean nothing yet.
- **Organic — match a keyword to its grid row case- and whitespace-insensitively.** `grid_analyses.target_keyword` and `keywords.term` are typed by different people at different times; an exact match drops the research to the 80/20 fallback while reporting that as a considered decision.
- **Organic — "Draft the copy" is a URL-level control, and had never worked.** The task is "four sets per URL, one per design", and the button on its card is `RunButton`, which posts `url_id` — that is all it has. The `generate_copy` action read `body.design_id`, got `undefined`, and answered *"Design not found for this org"* on every press since it shipped. `generateCopyForUrl()` drafts all four of the live waterfall's designs, sequentially (four model calls at once on a route that also carries image generation is how you meet the rate limit with somebody watching) and reports per design, so one bad draft does not cost the three that worked. The per-design entry point stays for the copy panel, which does have a design id. Both paths now close P4.2.8 and P4.2.9 on the **last** of the four — the AI path was not recording either.
- **Organic — phase 4 drafts copy and image prompts from the brief; a human still approves.** `generateCopyForDesign()` and `generateImagePromptForDesign()` (phase4.ts) build their prompt from `loadAccountBrief()` + the design brief — tone, banned words, approved CTAs, angles, visual worlds, the grid's format finding, and what has already won. Both run through `generateWithValidator()`, so a rejected draft is regenerated with the specific failures fed back. Nothing publishes: copy lands at `validator_status = PASS`, `human_qc_status = PENDING`, and a regenerate **resets QC to PENDING** so new text cannot inherit approval nobody gave it. `ai_drafts.kind` gained `PIN_COPY` and `IMAGE_PROMPT` (migration 073) — it is a CHECK constraint, not an enum, so extend the constraint.
- **Organic — `validateCopy` enforces the brand book, not just Pinterest's rules.** Pass `{ bannedWords, neverInclude }` from `brand_rules`. Banned words match on **word boundaries** so a brand banning "sale" does not trip on "wholesale"; never-include items match as substrings because they are phrases. Collected in P1.1.6 and previously checked by nobody.
- **Organic — write copy with an UPSERT on `copy_sets.design_id`, never an UPDATE.** The waterfall generator makes one row per design, but a design can arrive from an import or a re-run without one, and an UPDATE matching nothing returned `ok:true` while the generated copy went nowhere — the cost of the model call, none of the result, and no way to tell from the response.
- **Organic — the manager may always overrule; the deviation must be visible.** `src/lib/organic/structure.ts` holds both halves of that: `advise*()` ranks the options the research points at with a reason each, and `check*()` names what a chosen selection departs from. Nothing in it blocks a save or disables a control — `assignBoardsToUrl` used to throw below five boards and no longer does. Deviations are computed **on read** (`CycleView.deviations`, `loadCycleDeviations()`), never stored: a stored warning goes stale the moment a board is pinned past ten, and a stale warning teaches people to dismiss the whole panel. Two kinds, answered differently — `structure` is a rule of the method, `research` contradicts this account's own findings and is often the one the manager knows is out of date.
- **Organic — `winning_combinations` is a VIEW, not a table.** It aggregates published pins and their performance per (design, board), so it is always current and needs no writer — the gap was only that nothing read it. `loadAccountBrief().proven` does now, and it feeds board ranking and the design brief. Do not try to add an index or write rows to it.
- **Organic — fuzzy name matching needs the account's own noise words.** `overlaps()` in structure.ts falls back to a shared significant word, which on a jewellery account matched every board to every Steal List item via "jewellery" — advice that ranks everything first ranks nothing. `noiseWords()` drops any word appearing in more than a fifth of the names. Err strict: a missed match costs one signal, a false match costs the whole ranking.
- **Organic — downstream decisions read `loadAccountBrief()`, never the research tables directly.** `src/lib/organic/brief.ts` assembles everything phases 1–3 produced into one typed object. Before it, phase 4 read four values out of three months of research (keywords, three hex codes, brand rules, the taste-graph 3×3) because each feature wrote its own queries against whichever tables its author remembered. Adding a research input to a decision is now a field on an object the caller already holds. Every section is `Known<T>` — present, or absent **with the reason** — so a store with no grid never silently inherits the defaults of one that has it.
- **Organic — the save/click split comes from the grid, not from a constant.** `splitFromGrid()` maps `grid_analyses.text_overlay_bucket` (how many of the top 15–20 pins carry text) onto the click share: NONE 10 / MINIMAL 20 / HALF 40 / MOST 55 / ALL 65. That is "fitting in beats standing out" (P4.2.1) applied with numbers. The floor and cap are load-bearing: all-save earns reach and sends nobody anywhere, all-click gets traffic that never compounds. With no grid row for the keyword it falls back to 80/20 **and says so** in `basis`. The old hardcoded 80/20 made P2.1.2 and P2.1.3 busywork — the whole point of those tasks is finding out what page one rewards.
- **Organic — what is still unwired, if you are looking for the next win.** `ai.ts` is a bare Anthropic wrapper that reads none of the research; every other research table now reaches a decision through `loadAccountBrief()`, and `winning_combinations` is a view that needs no writer. The brief is the place to wire anything new in.
- **Organic — a custom-enum array comes back from node-pg as a raw string.** This has now bitten **twice** — `brief.ts` and `loadIntake()`, the second taking the whole intake screen down with a 500 for any client who had actually answered the questionnaire (an empty intake has null there and renders fine, which is why it survived every check until a store with real answers was opened). `SELECT ci.*` does not save you: cast the column explicitly (`ci.primary_goals::text[] AS primary_goals`). Grep for other enum arrays before adding one. `{TRAFFIC,SALES}`, not `["TRAFFIC","SALES"]` — node-pg has no parser registered for the type OID, so `.filter` throws. Cast to `::text[]` in the query (`client_intake.primary_goals` does). `arr()` in brief.ts parses the literal defensively as well, because the next enum array added upstream will not remember the cast.
- **Organic — a task with a checklist derives its own status; do not set it by hand.** `syncTaskStatusFromAnswers()` (workspace.ts) runs on every answer save and clear: every visible question answered → `DONE`, one cleared → `IN_PROGRESS`. It deliberately never touches a task with no checklist (nothing to derive from), never touches `BLOCKED` (that is computed from preconditions, and answering a question does not clear one), and never returns a task to `TODO` (work has started). A field counts as answered only when its required reasoning is also present — without that a task flips to DONE while a row is still flagged red for the missing "why". There is no completion dialog any more; picking DONE on a manual task just does it.
- **Organic — an answer belongs to the cycle it was given in** (migration 096). `task_answers` was keyed on `(org_id, task_id, field_key)`, which is right for phases 1-3: those tasks exist once per store. Phase 4 does not — its tasks exist once per **cycle** — and exactly one of them has a checklist: **P4.2.1, the grid reading**, which asks what Pinterest is rewarding for *that URL's* primary keyword. Fit Cherries runs two cycles on "padded push up bras" and "small bust swimwear"; on the old key they shared one row, so filling in the second silently overwrote the first and each screen showed the other cycle's answer as its own. The key is now `(org_id, task_id, cycle, field_key)`, with `''` for a store-level task so every existing answer stays where it is. Two things travelled with it: `syncTaskStatusFromAnswers` updated `WHERE cycle IS NULL`, so a phase-4 checklist could never advance its own task's status — it matched nothing, and the task sat at TODO however completely it was filled in; and `TaskChecklist` filters the answers it renders on the cycle it is in, or a card would show the other cycle's work.
- **Organic — the attachment belongs to the question, not the task.** `organic.task_answers.file_url` / `file_title` (migration 071). A task with six checks used to share one task-level attachment, so the reader got a document and no way to tell which check it proved. Links pasted there are still swept into the Assets library by `autoLinkAssetsFromText()`, so the library view stays complete without anyone filing the same thing twice — do not add an `assets` row by hand for these.
- **Organic — a per-keyword form must stay in step with the list it was built from.** `useKeyedRows` (`src/app/organic/client/[orgId]/useKeyedRows.ts`) is that contract; do not go back to a `useState` initialiser that maps over the snapshot once. P2.1.1 (seed keywords) and P2.1.3 (record the grid) sit on the same step page and are **both expanded by default**, so saving the seed keywords fires a `router.refresh()` that hands the still-mounted grid form a longer keyword list. Its state was built at mount, so every new term read back as undefined and the next render threw on `rows[k].fmt_simple_pins` — clicking a format toggle turned the whole screen white and the toggle never ticked (reproduced and fixed 04-09-2026). A `?? fallback` at the read site stops the crash but not the bug: the new keyword then renders empty while the database holds values for it, which is what P2.1.4, P2.4.1, P3.1.8 and P3.1.12 were quietly doing. `src/app/organic/error.tsx` is the second half of the fix — the organic app had **no error boundary anywhere in `src/app`**, so any thrown render replaced the entire app with Next's bare "Application error". Keep it, and remember when triaging that "the screen goes white" is a client-side throw, not a server fault. The invariant itself — every rendered key present in state, including after a stale draft is restored — is asserted by `npx tsx scripts/check-keyed-form-rows.ts`, because the failure is invisible until somebody clicks and by then their work is gone.
- **Organic — time on task is recorded where somebody wants to record it, never demanded** (decided 06-09-2026). Phase 1 dropped the field long ago; phases 2 and 3 kept it and gated the Save button on it, so the button sat greyed out with nothing saying why, and the overview's own DONE path opened a dialog that refused to close without a positive number. `completeTaskByDefinition` now treats a falsy `timeSpentMin` as "not recorded" and leaves the column alone — which is what the status route always did. Two consequences worth knowing: the viability route (P1.0.1–P1.0.4) had required a positive time while its own forms posted 0 since phase 1 dropped the field, so **every save from those forms answered 400** until this went in; and `time_spent_min` still feeds the margin per client, so the figures are now sparser than they look.
- **Organic — P1.0.3 keeps the sitemap, not only the count.** Every later task that says "the URL pool from P1.0.3" pointed at something that did not exist: the count was written to the viability gate and the URLs were thrown away. The form now also runs the phase-4 import (`import_sitemap` proposes, `accept_urls` writes through `upsertUrl`, so locale folding, shortener refusal and classification all apply exactly once) and offers the list for import into the pool. Importing at phase 1 rather than phase 4 only means earlier; the pool dedupes.
- **Organic — the file name Pinterest can read is the one in the URL.** `designs.filename` has carried the SOP keyword name since `generateWaterfall` (P4.2.6 — Pinterest OCRs file names), but every uploaded object was called `design-1.jpg` / `crop-B.jpg`, so the signal was computed, stored and thrown away at the one moment it counted. `storageName()` builds the object name from that filename, falling back to the positional name so a design without one still publishes.
- **Organic — a task that does not apply to this store has to be able to say so.** The Valerie Mason flow test (06-09-2026) found the same shape six times: re-optimising existing top pins on an account that never published, top-performing pins on an account with no clicks yet, a slug convention for new pages on a shop that needs none, three settings that require the owner's login we do not have. None of them were wrong to ask; all of them were unanswerable, so they sat open looking like work. The guidance now names when a task applies and says that skipping with that reason is the right answer (migration 092), and `P1.3.17`'s "submitted, or granted?" became a `choice` — it never was a yes/no. `conformance()` and `audit()` take an extra field list for exactly this: a check whose honest answer is a value, not a tick. Careful with what you add there — `syncTaskStatusFromAnswers` counts **every visible field**, so a field that is legitimately empty for most stores (a date that only exists once applied) holds the task at IN_PROGRESS for ever.
- **Organic — the phase-1 baseline is stored per month, because everything compares it to a month.** P1.2.13 records three months; `computeDeltas` puts that row beside one report period, `health.ts` beside the last 30 days, `workspace.ts` beside two consecutive months and `agency.ts` beside `clicks_last_30d`. Stored as recorded, a store performing exactly at baseline reads as three times below it — in the health score, in the leak list and in the **client report**. `seedBaselineFromP1_2_13` therefore divides the counts by three and leaves rates, follower levels and monthly views alone; the note keeps the figures as they were recorded, and the row is the comparable form of them. Nobody had hit this because no store had ever filled P1.2.13 in — the button that now fills it in one click is what would have fired it on every store at once.
- **Organic — P1.2.13 asks Pinterest first, and Pinterest gives 90 days, not three months.** `pullBaselineSuggestion()` fills impressions, engagements, engagement rate, outbound clicks, saves and the follower count from `user_account/analytics`; the other seven KPIs are not on any endpoint we can reach (profile visits and monthly views are UI-only figures, the audience split is Audience Insights) and the form says so per field rather than leaving boxes that look like they failed to load. Two limits are stated on screen because they change the number: the endpoint answers `400 code 1` beyond **90 days**, so the task's three-month window is not obtainable; and the API has no equivalent of the UI's claimed-domain filter, so a pulled figure can sit above what the task's own filter instructions produce. It fills only empty boxes — a typed figure is never overwritten.
- **Organic — finishing a task must recompute what it unblocks, on every path.** `syncTaskStatusFromAnswers` wrote DONE and did not recompute, so a checklist task closed by answering its last question left its dependents at BLOCKED until some unrelated save happened to trigger one. Fit Cherries, 06-09-2026: P1.3.14 was ticked off at 09:22 and P2.1.1 — the first task of market research, whose only precondition it is — was still blocked hours later. It is invisible from every screen: the dependent task just sits there greyed out, and the person in front of it concludes the tool is broken for them while it works for everyone else. `scripts/recompute-task-blocks.ts` repairs whatever the old behaviour left behind (`RECOMPUTE_DRY_RUN=1` first) and is safe to re-run.
- **Organic — nothing typed into a form may live only in the browser.** `useFormDraft` (`src/app/organic/client/[orgId]/useFormDraft.ts`) mirrors what is being typed into `localStorage` on every keystroke and into `organic.form_drafts` (migration 091) on a 1.2s debounce, restores it on mount behind a visible "restored, never saved" banner, and deletes it the moment a real save lands. Wired into every phase-2 and phase-3 form that holds typed state. It exists because on 06-09-2026 a media buyer did a full day of market research on Fit Cherries and none of it reached a single table — and no screen, log or table could show that it had ever existed. Three rules: a form that loads its own rows asynchronously passes `{ enabled: !loading }`, or the load lands after the restore and silently wins; the draft is **never** the record, so it is applied with a banner rather than silently; and a failed round-trip only downgrades the hint to "kept on this device", never interrupts someone who is typing.
- **Organic — a draft must retire with the save it describes, and may never blank a filled row.** Two halves of one bug, found on The Longevity store 10-09-2026 when the report was "I still cannot save". The per-keyword Save buttons on P2.1.3 and P2.1.4 write straight to the database and bypass `FormShell`, which is the only place that called `draft.clear()` — so a draft outlived the row it had just written. On the next visit the restore merged it blindly (`{...cur, ...d.rows}`) and **blanked a row the record held**: three saved hex codes disappeared from the screen, and because one other row had a single hex typed into it, the Save button answered *"Three valid hex codes needed for: energy boost. Nothing was saved."* Saved work looked lost and nothing could be written on top of it. Three fixes, and all three are needed: every inline save now clears the draft; `mergeDraftRows()` makes the merge one-directional — a draft that **has** something still wins, it only loses where it has nothing to say and the record does; and the half-typed check no longer throws before the write, because refusing the whole save is exactly what it must not do to the rows that are finished (the principle was already written down, the code did the opposite). Asserted by `npx tsx scripts/check-keyed-form-rows.ts`, which now covers all three row shapes the keyed forms use.
- **Organic — a form saves what is filled in; only completion closes the task.** P2.1.3 and P2.1.4 used to throw on the first keyword without a text-overlay bucket and post nothing at all, so an afternoon of reading result pages could end with zero rows — the error appeared in a small red span at the bottom of a form several screens long. They now post every complete row, name what is still open, and `recordTaskProgress()` (complete.ts) holds the task at IN_PROGRESS instead of closing it. The distinction that keeps this honest: a **half-filled** row is an error and is named (three hex codes or none), an **untouched** row is simply not done yet — and neither may cost the rows that are finished. Every keyword also has its own Save button that needs no time entry, because finishing a card should be enough to make it safe.
- **Organic — phase 2 asks about the seed keywords, not the keyword bank** (`organic.keywords.is_seed`, migration 090). A store can arrive with a bank imported by the main dashboard: Fit Cherries had **185** rows at `source = MIGRATED`, so P2.1.1 prefilled its box with 185 lines and then rejected the save as "must be 5–10", and P2.1.3 rendered 185 cards that could not be saved until every one of them was filled in. `loadPhase2Snapshot` filters on `is_seed` and `saveSeedKeywords` sets it (promoting an existing term on conflict, so choosing a migrated term as a seed works and **keeps** its provenance — `source` says where a term came from, `is_seed` says what phase 2 is about). Dropping a term from the seed list only clears the flag; nothing is ever deleted. The seed form names the size of the bank, because a form that opens empty on a store with 185 keywords reads as data loss.
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
