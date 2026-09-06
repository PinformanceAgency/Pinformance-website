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
- **Zones has three scopes: last 4 weeks, this month, last month.** All three render the same zone blocks; only which bucket is in focus differs. On the last-month tab each store card also carries that month's spend / revenue / ROAS, which is what the tab exists for — the finished month, with its own numbers, next to the colour. `StoreZoneRow.last_month` carries those plus the full-month scale floor and the period the store actually ran. There was briefly a separate invoice table on that tab with the billing basis, the monthly floor and a CSV export; it was removed on 02-09-2026 because the page is open on media buyers' screens all day and what the agency bills a store on does not belong there. `last_month` itself stays — it is what fills the cards. The month is located **by key** in `monthBucketKeys(end)`, never at bucket index 1: the zone window ends *yesterday*, so on the 1st and 2nd of a month the three buckets are the three months before it. Verify the figures with `DOTENV_CONFIG_PATH=.env.local npx tsx scripts/check-invoice-month.ts` (`MONTH=2026-07` for an older one), which compares every store against a plain SQL SUM over the same rows and exits 1 on any difference.
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
- **Organic — approving a waterfall queues it; the cron publishes it.** `scheduleWaterfall()` (P4.4.1) moves sixteen PLANNED pins to SCHEDULED and the waterfall to RUNNING, and posts nothing. The sixteen dates are spread over weeks on purpose, so publishing on approval collapses the waterfall into one day and undoes the only thing it exists to do. `/api/cron/organic-post-pins` posts each pin when its date arrives, and that is where the caps are enforced — which is what lets two cycles run concurrently without either knowing about the other. Three distinctions the code refuses to collapse: a **rate limit or 5xx** leaves the pin SCHEDULED and stops that org for the round (recording it as FAILED burns a pin the method already paid for in research and design); a **dead token** is reported apart from a failed pin, because the first needs a person and never fixes itself; and `loadPublishHealth` reports **`stuck`** next to `overdue` — the publish query filters on image, board and title, so without it the panel says "6 overdue" while the cron says "0 due" and nothing reconciles them. `scheduleWaterfall` blocks only on what makes the call impossible or the result wrong (no image, no Pinterest board, no title, QC-rejected copy or design); pending QC warns.
- **Organic — `pinterestClientForOrg()` is how you reach Pinterest for a store.** `src/lib/pinterest/for-org.ts` does the decrypt → check-expiry → refresh → write-back dance that previously only `post-pins` and `refresh-pinterest-tokens` did properly; everywhere else an expired token surfaced as a bare 401 that reads like an outage. It throws `PinterestAuthError` **only** when the store genuinely needs reconnecting, never for a network hiccup or a rate limit, so callers can act on the difference. `pinterestClientsForOrgs()` is the batch form and returns failures rather than throwing — a cron over forty stores must not stop at the first dead token. Existing callers are deliberately not refactored onto it.
- **Organic — conversion KPIs are pulled in a second call, and stay null when unavailable.** `analytics-pull.ts` asks for the core metrics and the conversion metrics separately, because Pinterest answers 400 for the *whole* request when one metric name is not available on the account — folding them together takes the core pull down on every store without conversion access. The upsert `COALESCE`s the conversion columns instead of overwriting, so a month whose access lapsed keeps the figures it had rather than blanking a report that already went out. Only days Pinterest marks `READY` are written, and the window ends **yesterday**: realtime numbers move for about a day, and a report that changes after it is sent is worse than one that lands a day later. Prefer `daily_metrics` over lifetime totals — `pin_performance` is keyed on `(pin_id, measured_on)` and a lifetime figure written against one date reads as a single enormous day. `ANALYTICS_FILTERS` is exported so the screen shows the four fixed filters above the numbers; a figure that looks wrong is almost always a filter.
- **Organic — P2.1.6 takes files, and an import is repeatable.** The competitor export is the biggest body of raw research the method collects (700–1000 pins × 5–10 competitors) and it had never once run on a live store: the importer wrote one INSERT per row against a route capped at `maxDuration = 60`, so a single competitor could not finish. Rows now go in 500 at a time through `unnest()` (1000 rows ≈ 0.7s), the upload screen takes one CSV per competitor and matches dropped files to competitors by name, and migration 089 adds a unique index on `(competitor_id, pin_url)` so re-importing after a half-finished run counts duplicates instead of writing them — without it a recovery attempt silently doubled the volume that P2.2.1 reasons over. Three rules in the parser are load-bearing: the **delimiter is detected**, not configured (a European Excel writes semicolons, and a comma-only parser reads such a file as one column while reporting "Imported 1000 rows"); the **BOM is stripped** or the first header name never matches; and a **CSV without a pin-URL column is refused**, because nothing can be deduplicated on and P2.2.1 has no pin to point at — volume with no evidence is the one failure that looks like success everywhere downstream.
- **Organic — P2.1.6 completes per competitor, not per file.** It is the one task that does not go through `completeTaskByDefinition`: that helper overwrites `time_spent_min` and demands a positive number, and one export of six is not a finished task. `recordImportProgress()` accumulates the minutes (the screen books them once, with the first file of a batch), holds the task at `IN_PROGRESS` until every competitor has pins, and leaves `BLOCKED` alone — blocked is computed from preconditions and importing a file does not clear one.
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
- **Organic — phase 5 is execution too, and has `Phase5Action.tsx`.** It was falling through to the generic `PhaseBoard`, so thirteen monthly tasks rendered as note boxes. Same five kinds as phase 4; `readout` and `external` carry more of it there because most of phase 5 genuinely is read-and-judge rather than press-a-button. Two still say **"No control yet"** and are the honest remainder: **P5.2.3** (mark templates proven — `design_templates` exists and nothing writes to it) and **P5.3.3** (the forward-looking trends note).
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
- **Organic — every phase-4 task now has a working control.** The four that did not are built: **P4.2.4** generates the four designs through Krea (`generateDesignImages`, one prompt per design so the four are genuinely distinct, SAVE at 2:3 and CLICK at 9:16, stored in the `pin-images` bucket rather than referenced at Krea because a generated URL there expires); **P4.2.5** cuts the micro-crops with `sharp` (variant A keeps the original, B/C/D take 96% of the frame from a different corner — this is why four copy sets per URL is right and sixteen would be waste); **P4.2.7** and **P4.2.10** are design and copy QC against `designs.qc_status` / `copy_sets.human_qc_status`, and a rejection **requires a reason**, enforced server-side so every caller gets the rule. Image generation needs `KREA_API_KEY` **and a funded Krea API balance** — that balance is separate from the workspace compute balance, and an empty one returns a clear 402 through the UI. The route runs at `maxDuration = 300`: four generations are polled in parallel with a 180s ceiling each, and 60 would cut a normal run in half.
- **Organic — the C2PA metadata-stripping step is deliberately NOT built.** The build reference rules it out: at twenty accounts from one infrastructure it becomes a detectable pattern, and a suspension would take the paid side down with it. It stays manual in Canva if anyone wants it. Do not add it.
- **Organic — phase 4 is EXECUTION; give a task its control, never a note box.** Phases 1–3 capture research, so note-and-attach is right there. Phase 4 links boards, assigns keywords, makes images and puts pins live — copying the research pattern onto it made the dashboard paperwork *about* the work instead of the tool that does it. `Phase4Action.tsx` holds one entry per task: `run` (a button that calls the backend), `panel` (the control is in the cycle card above), `external` (names the tool), `readout` (the system did it, here is what to check), or `missing` — which renders **"No control yet"** in red with what will be built. Never paper a missing control over with a note field. The registry is written task by task, not derived from `task_type`, because the type says who acts, not what the control is.
- **The organic app must reuse the main dashboard's execution machinery, not reinvent it.** `src/lib/ai/pipelines/strategy-pipeline.ts` already generates keywords + a board plan into `public.keywords`/`public.boards`; `content-pipeline.ts` generates pin copy into `public.pins` + `public.calendar_entries`; images run through Krea (`/api/ai/generate-images`, `src/lib/krea/client.ts`), overlay through `src/lib/image/overlay.ts`, approval through `/api/pins/[id]/approve`, publishing through `/api/cron/post-pins`. The organic app built a parallel world in the `organic` schema and wired **none** of the doing. Only the research inputs, the board-linking rules and the waterfall concept differ — the generation, overlay, approval and publishing steps are the same job. Check what exists there before building it again.
- **Organic — phase-4 step routes must work with no cycle running.** Phase-4 tasks are recurring, so they exist only inside a cycle and `loadClientTasks` excludes them. Every `/phase/4/[step]` route therefore read "No tasks in this phase yet" on any store that had not started a cycle — which is every store before its first one, so the manager could not find out what step 4.2 involves without first starting the cycle they were trying to understand. `loadPhase4StepTasks()` returns `instances` (live cycle tasks, rendered as full cards) and `template` (the SOP definitions, read-only) so the step is always legible.
- **Organic — `scripts/seed-phase4-walkthrough.ts <orgId>` makes phase 4 reviewable.** Seeds a topic, five boards (descriptions are 400–500 chars, enforced by a CHECK — a placeholder is rejected), five URLs with reasons and funnel stages, five keywords with cached volume, assigns all of them, and starts one cycle so all 22 tasks are live across 4.1–4.4. `--remove` reverses it. It refuses to run on a store with cycles it did not create.
- **Organic — a cycle task is a task; render it with the same `TaskCard`.** Phase 4's twenty-two SOP tasks used to render as a read-only list of id, name and a status pill, so a manager could see that P4.2.5 existed and was TODO and had nowhere to read what it asks, record it, attach the designs or close it. `TaskCard` is exported from `PhaseBoard.tsx` and used by `Phase4Cycles`; `CycleTaskRow` carries the full definition (description, guidance, expected_output, external tool/url, skip fields) rather than six columns. Every phase-4 task has an `expected_output`, including the AUTO ones — "the system does it" is not "there is nothing to check", and that line says what to look at when the output is wrong, which is when somebody opens the task.
- **Organic — the ten connections from ORGANIC_TASK_SPEC.md are asserted by name in the audit.** The spec's DATA FLOW MAP says: *"The ten connections that must work. If any of these requires the manager to look something up manually, the build is wrong."* `scripts/audit-research-links.ts` checks each one as `FLOW 1`–`FLOW 10` against real data. All ten pass. Two carry a deliberate divergence, both from the standing override rule: **FLOW 7** (frequency → URL selection) and **FLOW 9** (coverage → board assignment) are the spec's "blocks", and neither blocks — they raise a visible deviation instead, because the manager may always overrule. Add a flow here whenever the spec gains one.
- **Organic — verify the research links with `scripts/audit-research-links.ts`, not with grep.** `DOTENV_CONFIG_PATH=.env.local npx tsx scripts/audit-research-links.ts [orgId]` walks every phase 1–3 table to the phase 4–5 decision that consumes it and checks **by value** against that org's real rows, exiting 1 on any break. A grep proves a table is referenced; it does not prove the value arrives, and the two have come apart three times here — copy written by an UPDATE that matched nothing and still returned ok, a name matcher so loose every board scored identically, and a grid lookup that only ever exercised its fallback. Run it after touching anything in brief.ts, structure.ts or phase4.ts. It picks a URL whose primary keyword is actually gridded, so the match path is tested rather than the fallback; a section is only counted as data when it is **answered** (`client_viability.verdict IS NOT NULL`, `market_analysis_items.status = 'APPROVED'`), because both tables carry rows that mean nothing yet.
- **Organic — match a keyword to its grid row case- and whitespace-insensitively.** `grid_analyses.target_keyword` and `keywords.term` are typed by different people at different times; an exact match drops the research to the 80/20 fallback while reporting that as a considered decision.
- **Organic — phase 4 drafts copy and image prompts from the brief; a human still approves.** `generateCopyForDesign()` and `generateImagePromptForDesign()` (phase4.ts) build their prompt from `loadAccountBrief()` + the design brief — tone, banned words, approved CTAs, angles, visual worlds, the grid's format finding, and what has already won. Both run through `generateWithValidator()`, so a rejected draft is regenerated with the specific failures fed back. Nothing publishes: copy lands at `validator_status = PASS`, `human_qc_status = PENDING`, and a regenerate **resets QC to PENDING** so new text cannot inherit approval nobody gave it. `ai_drafts.kind` gained `PIN_COPY` and `IMAGE_PROMPT` (migration 073) — it is a CHECK constraint, not an enum, so extend the constraint.
- **Organic — `validateCopy` enforces the brand book, not just Pinterest's rules.** Pass `{ bannedWords, neverInclude }` from `brand_rules`. Banned words match on **word boundaries** so a brand banning "sale" does not trip on "wholesale"; never-include items match as substrings because they are phrases. Collected in P1.1.6 and previously checked by nobody.
- **Organic — write copy with an UPSERT on `copy_sets.design_id`, never an UPDATE.** The waterfall generator makes one row per design, but a design can arrive from an import or a re-run without one, and an UPDATE matching nothing returned `ok:true` while the generated copy went nowhere — the cost of the model call, none of the result, and no way to tell from the response.
- **Organic — the manager may always overrule; the deviation must be visible.** `src/lib/organic/structure.ts` holds both halves of that: `advise*()` ranks the options the research points at with a reason each, and `check*()` names what a chosen selection departs from. Nothing in it blocks a save or disables a control — `assignBoardsToUrl` used to throw below five boards and no longer does. Deviations are computed **on read** (`CycleView.deviations`, `loadCycleDeviations()`), never stored: a stored warning goes stale the moment a board is pinned past ten, and a stale warning teaches people to dismiss the whole panel. Two kinds, answered differently — `structure` is a rule of the method, `research` contradicts this account's own findings and is often the one the manager knows is out of date.
- **Organic — `winning_combinations` is a VIEW, not a table.** It aggregates published pins and their performance per (design, board), so it is always current and needs no writer — the gap was only that nothing read it. `loadAccountBrief().proven` does now, and it feeds board ranking and the design brief. Do not try to add an index or write rows to it.
- **Organic — fuzzy name matching needs the account's own noise words.** `overlaps()` in structure.ts falls back to a shared significant word, which on a jewellery account matched every board to every Steal List item via "jewellery" — advice that ranks everything first ranks nothing. `noiseWords()` drops any word appearing in more than a fifth of the names. Err strict: a missed match costs one signal, a false match costs the whole ranking.
- **Organic — downstream decisions read `loadAccountBrief()`, never the research tables directly.** `src/lib/organic/brief.ts` assembles everything phases 1–3 produced into one typed object. Before it, phase 4 read four values out of three months of research (keywords, three hex codes, brand rules, the taste-graph 3×3) because each feature wrote its own queries against whichever tables its author remembered. Adding a research input to a decision is now a field on an object the caller already holds. Every section is `Known<T>` — present, or absent **with the reason** — so a store with no grid never silently inherits the defaults of one that has it.
- **Organic — the save/click split comes from the grid, not from a constant.** `splitFromGrid()` maps `grid_analyses.text_overlay_bucket` (how many of the top 15–20 pins carry text) onto the click share: NONE 10 / MINIMAL 20 / HALF 40 / MOST 55 / ALL 65. That is "fitting in beats standing out" (P4.2.1) applied with numbers. The floor and cap are load-bearing: all-save earns reach and sends nobody anywhere, all-click gets traffic that never compounds. With no grid row for the keyword it falls back to 80/20 **and says so** in `basis`. The old hardcoded 80/20 made P2.1.2 and P2.1.3 busywork — the whole point of those tasks is finding out what page one rewards.
- **Organic — still orphaned, if you are looking for the next win.** `competitor_pins`, `keyword_clusters` and `design_templates` are captured and read by nothing downstream, and `winning_combinations` has no production writer (only the demo seeder), so the phase-5 → phase-4 learning loop does not close yet. `ai.ts` is a bare Anthropic wrapper that reads none of the research. The brief is the place to wire each of these in.
- **Organic — a custom-enum array comes back from node-pg as a raw string.** This has now bitten **twice** — `brief.ts` and `loadIntake()`, the second taking the whole intake screen down with a 500 for any client who had actually answered the questionnaire (an empty intake has null there and renders fine, which is why it survived every check until a store with real answers was opened). `SELECT ci.*` does not save you: cast the column explicitly (`ci.primary_goals::text[] AS primary_goals`). Grep for other enum arrays before adding one. `{TRAFFIC,SALES}`, not `["TRAFFIC","SALES"]` — node-pg has no parser registered for the type OID, so `.filter` throws. Cast to `::text[]` in the query (`client_intake.primary_goals` does). `arr()` in brief.ts parses the literal defensively as well, because the next enum array added upstream will not remember the cast.
- **Organic — a task with a checklist derives its own status; do not set it by hand.** `syncTaskStatusFromAnswers()` (workspace.ts) runs on every answer save and clear: every visible question answered → `DONE`, one cleared → `IN_PROGRESS`. It deliberately never touches a task with no checklist (nothing to derive from), never touches `BLOCKED` (that is computed from preconditions, and answering a question does not clear one), and never returns a task to `TODO` (work has started). A field counts as answered only when its required reasoning is also present — without that a task flips to DONE while a row is still flagged red for the missing "why". There is no completion dialog any more; picking DONE on a manual task just does it.
- **Organic — the attachment belongs to the question, not the task.** `organic.task_answers.file_url` / `file_title` (migration 071). A task with six checks used to share one task-level attachment, so the reader got a document and no way to tell which check it proved. Links pasted there are still swept into the Assets library by `autoLinkAssetsFromText()`, so the library view stays complete without anyone filing the same thing twice — do not add an `assets` row by hand for these.
- **Organic — a per-keyword form must stay in step with the list it was built from.** `useKeyedRows` (`src/app/organic/client/[orgId]/useKeyedRows.ts`) is that contract; do not go back to a `useState` initialiser that maps over the snapshot once. P2.1.1 (seed keywords) and P2.1.3 (record the grid) sit on the same step page and are **both expanded by default**, so saving the seed keywords fires a `router.refresh()` that hands the still-mounted grid form a longer keyword list. Its state was built at mount, so every new term read back as undefined and the next render threw on `rows[k].fmt_simple_pins` — clicking a format toggle turned the whole screen white and the toggle never ticked (reproduced and fixed 04-09-2026). A `?? fallback` at the read site stops the crash but not the bug: the new keyword then renders empty while the database holds values for it, which is what P2.1.4, P2.4.1, P3.1.8 and P3.1.12 were quietly doing. `src/app/organic/error.tsx` is the second half of the fix — the organic app had **no error boundary anywhere in `src/app`**, so any thrown render replaced the entire app with Next's bare "Application error". Keep it, and remember when triaging that "the screen goes white" is a client-side throw, not a server fault.
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
