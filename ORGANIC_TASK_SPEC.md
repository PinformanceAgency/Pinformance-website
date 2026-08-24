# ORGANIC DASHBOARD — TASK SPECIFICATION

All 116 SOP tasks: what happens, who does it, what data moves.

---

## HOW TO READ THIS

Every task has the same six fields.

| Field | Meaning |
|---|---|
| **Type** | AUTO · AI_DRAFT · IN_DASHBOARD · EXTERNAL |
| **Human** | What the manager actually does |
| **System** | What the dashboard does |
| **Reads** | Data pulled in from earlier tasks, shown as context |
| **Writes** | Objects created or updated |
| **Feeds** | Which later tasks depend on this output |

### The four types

The SOP does not define these types — they were derived to give each task a
consistent UI pattern. The criterion is deliberately conservative:

- **AUTO** — only where no judgement is involved and an error is costly.
  Counting, calculating, fetching, enforcing. Always followed by human confirmation.
- **AI_DRAFT** — the system proposes, the human approves or rewrites.
  Used only where volume makes manual work unsustainable (30 board descriptions
  × 50 clients). Both the generated and the approved text are stored so edit
  distance can be measured.
- **IN_DASHBOARD** — human judgement, structured input. The default.
- **EXTERNAL** — work happens in another tool; the result comes back here.

**Quality outranks speed.** Where automation would remove judgement, the task
stays manual. Where the system can pre-fill or suggest without deciding, it does.

### Data principle

Tasks do not store data. Tasks produce **objects**, and those objects live in a
shared library. That is what makes data flow forward: a later task reads the
object, not the earlier form.

---

## THE OBJECT LIBRARY

| Object | Holds |
|---|---|
| `client_profile` | Niche, AOV, goals, positioning, brand rules, forbidden keywords |
| `access_items` | Each access with status (NOT_REQUESTED / REQUESTED / GRANTED / BLOCKED) and date |
| `audit_findings` | Each audit item: finding, severity, resolved yes/no |
| `competitors` | Competitor accounts and their exported pins |
| `grid_analyses` | Per keyword: dominant format, CTA presence, overlay share, hex codes |
| `taste_graph` | Seven fields, plus the three angles / worlds / moments |
| `keywords` | Term, volume, cache age, cluster, season, parent interest, in-use flag |
| `topics` | Core categories, with board coverage count |
| `boards` | Name, description, topic, pin count, privacy, last activity |
| `urls` | URL, funnel stage, reason, cooldown, performance |
| `cycles` | Per URL: designs, copy sets, 16 pins, calendar |
| `assets` | Every document, linked to the task that produced it |
| `kpi_snapshots` | Monthly measurement plus the phase-1 baseline |

---

## THE DATA FLOW MAP

The ten connections that must work. If any of these requires the manager to
look something up manually, the build is wrong.

| From | To | What moves |
|---|---|---|
| P1.0.3 URL count | P2.4.2 frequency | How many URLs exist |
| P1.1.6 brand book | P4.2.3 design brief | Colours, logo, typography |
| P1.2.13 baseline | Phase 5, every month | Comparison point |
| P1.2.14 top pins | P4.1.1 candidates | Month-1 quick wins |
| P2.1.4 dominant colours | P4.2.3 design brief | Hex codes per keyword |
| P2.3.3 angles & moments | P3.3.1 board list | Board naming input |
| P2.4.2 frequency | P4.1.4 URL selection | How many URLs this month |
| P3.1 keyword bank | P4.1.6 assignment | Keywords with volume |
| P3.3.2 coverage | P4.1.7 board assignment | Blocks below five boards |
| P5.2 winners | P4.1.1 next month | Proven templates and URLs |

---

# PHASE 1 · ONBOARDING & ACCOUNT AUDIT

*One-time. Gates everything downstream.*

## Step 0 — Viability

### P1.0.1 · Good-fit check
**Type:** IN_DASHBOARD
**Human:** Ticks six signals: visual-first product, more than 5 products, URL volume, high AOV, existing visual assets, long-term mindset. Notes reasoning per tick.
**System:** Shows the six as checkboxes with the SOP explanation beside each.
**Reads:** —
**Writes:** `client_viability.good_fit_signals`
**Feeds:** P1.0.4

### P1.0.2 · Red-flag check
**Type:** IN_DASHBOARD
**Human:** Ticks six blockers: technical B2B, local-only services, single landing page, "results tomorrow" mindset, low-effort dropshipping, sensitive niche. One flag is survivable, several are not.
**System:** Counts flags and shows a severity indication.
**Reads:** —
**Writes:** `client_viability.red_flags`
**Feeds:** P1.0.4

### P1.0.3 · Count URL volume
**Type:** AUTO
**Why auto:** Counting is counting. A human miscounts and loses an hour.
**Human:** Reviews the parsed list, removes test pages or discontinued products, confirms.
**System:** Reads the sitemap, counts products / collections / blog posts separately, flags below 10, notes 20 as comfortable and 50+ as room to scale.
**Reads:** `client_profile.website_url`
**Writes:** `url_counts`, raw list into `urls`
**Feeds:** P1.0.4, P2.4.2, expansion assessment

### P1.0.4 · Record viability verdict
**Type:** IN_DASHBOARD
**Human:** Chooses STRONG / MODERATE / WEAK and writes the reasoning. On WEAK, advises blog or SEO build-out first.
**System:** Shows the signal counts and the URL requirement calculation. Blocks the rest of phase 1 until this is set.
**Reads:** `client_viability`, `url_counts`
**Writes:** `client_viability.verdict`
**Feeds:** Gate for all of phase 1

## Step 1 — Access & Intake

### P1.1.1 · Send onboarding questionnaire
**Type:** IN_DASHBOARD
**Human:** Sends the questionnaire link, logs the send date, enters answers when they come back (or the client fills it directly).
**System:** Generates the link, tracks status, parses answers into structured fields. Enforces max two priorities.
**Reads:** —
**Writes:** `client_profile` (niche, AOV, goals, positioning, tone of voice)
**Feeds:** P2.2.1, P3.2.2, P4.2.3, and the whole strategy

### P1.1.2 · Arrange Pinterest access
**Type:** IN_DASHBOARD
**Human:** Records whether direct login was granted, and the end date. Direct login is needed in month 1 for board warming from the client website; Business Access is enough afterwards.
**System:** Tracks status and reminds when the end date approaches.
**Reads:** —
**Writes:** `access_items.pinterest`
**Feeds:** P3.3.7 seeding method

### P1.1.3 · GA4 Analyst access
**Type:** IN_DASHBOARD
**Human:** Requests and confirms Analyst level.
**System:** Tracks status.
**Reads:** —
**Writes:** `access_items.ga4`
**Feeds:** P5.1.2

### P1.1.4 · Google Search Console
**Type:** EXTERNAL
**Human:** Opens GSC, reads Performance → Queries and → Pages, notes top organic terms and most popular pages. Also checks Links for indexed pins pointing to the site.
**System:** Stores the queries as keyword candidates flagged `source: gsc`.
**Reads:** —
**Writes:** `access_items.gsc`, candidates into `keywords`, top pages into `urls`
**Feeds:** P3.1 keyword bank, P4.1.1 candidates

### P1.1.5 · CMS access
**Type:** IN_DASHBOARD
**Human:** Confirms access, notes the platform (Shopify / WordPress / other).
**System:** Tracks status; platform choice drives the Rich Pins fix instructions later.
**Reads:** —
**Writes:** `access_items.cms`, `client_profile.cms_platform`
**Feeds:** P1.2.10, P1.3.2

### P1.1.6 · Collect brand book
**Type:** EXTERNAL
**Human:** Collects logo as transparent PNG, official hex codes, typography rules. Pastes the link.
**System:** Captures the link into Assets automatically and prompts for the hex codes as structured fields.
**Reads:** —
**Writes:** `client_profile.brand_colors`, `client_profile.typography`, `assets`
**Feeds:** P2.2.1, P4.2.3, P4.2.4

### P1.1.7 · Connect content drive
**Type:** EXTERNAL
**Human:** Records the drive link and rates the quality: abundant lifestyle / mixed / white backgrounds only.
**System:** If white-backgrounds-only, flags the AI route as mandatory for this client.
**Reads:** —
**Writes:** `client_profile.content_quality`, `assets`
**Feeds:** P4.2.2 route decision

### P1.1.8 · Other social content
**Type:** EXTERNAL
**Human:** Collects Instagram and TikTok material, uncompressed and without watermarks. Notes what is available.
**System:** Stores links; warns that watermarked material is penalised.
**Reads:** —
**Writes:** `assets`
**Feeds:** P4.2.4

### P1.1.9 · Request Google keyword list
**Type:** EXTERNAL
**Human:** Asks the client for their existing SEO keyword list. Indicative only — Pinterest search behaviour differs.
**System:** Imports as candidates flagged `source: google`, unvalidated.
**Reads:** —
**Writes:** `keywords` (unvalidated)
**Feeds:** P3.1 keyword bank

### P1.1.10 · Audience document
**Type:** EXTERNAL
**Human:** Collects existing persona or audience documentation.
**System:** Stores the link.
**Reads:** —
**Writes:** `assets`
**Feeds:** P2.3.1 taste graph

### P1.1.11 · Connect product feed
**Type:** IN_DASHBOARD
**Human:** Enters the XML or CSV feed URL.
**System:** Validates the feed loads and counts products.
**Reads:** —
**Writes:** `client_profile.feed_url`, product count
**Feeds:** P1.3.4 catalogue, P4.1.1 candidates

## Step 2 — Account Health Audit *(existing accounts only)*

### P1.2.1 · Domain block check
**Type:** EXTERNAL
**Human:** Runs the domain through blockedlinks.flaggedpins.com. If blocked, contacts Pinterest Support and replies to the automated rejection to force human review.
**System:** Records the result and, if blocked, creates a follow-up task.
**Reads:** `client_profile.website_url`
**Writes:** `audit_findings.domain_block`
**Feeds:** Blocks all publishing until resolved

### P1.2.2 · Flagged pin check
**Type:** EXTERNAL
**Human:** Runs app.flaggedpins.com, uploads the report.
**System:** Parses status codes and maps to severity — `blacklisted` HIGH, `sensitive_raw_pin_text` MEDIUM, `is_filtered_mp3_movie_download` MEDIUM, `is_non_recommendable_idea_pin` LOW, `hidden_board` LOW. Unknown codes are listed as UNKNOWN, never silently dropped.
**Reads:** —
**Writes:** `audit_findings.flagged_pins`, `assets`
**Feeds:** Excludes flagged pins from future waterfalls

### P1.2.3 · Redirect and canonical check
**Type:** EXTERNAL
**Human:** Runs canonical.flaggedpins.com, fixes broken redirects in the CMS.
**System:** Records findings; ensures only final destination URLs enter `urls`.
**Reads:** `urls`
**Writes:** `audit_findings.redirects`
**Feeds:** P4.1 URL selection

### P1.2.4 · Find homepage pins
**Type:** AUTO
**Why auto:** Comparing a pin's link against the homepage URL is deterministic.
**Human:** Reviews the list and repoints the pins. Max 150 pin edits per day (platform limit).
**System:** Lists all pins linking to the homepage via the API, tracks progress, enforces the daily edit ceiling.
**Reads:** `client_profile.website_url`
**Writes:** `audit_findings.homepage_pins`
**Feeds:** —

### P1.2.5 · Find pins without a URL
**Type:** AUTO
**Why auto:** Same — a missing link is a fact, not a judgement.
**Human:** Adds the correct destination per pin. Highest priority of the whole audit: a viral pin without a link returns nothing.
**System:** Lists linkless pins ranked by impressions, suggests a URL match by title.
**Reads:** `urls`
**Writes:** `audit_findings.linkless_pins`
**Feeds:** —

### P1.2.6 · Canonical pin ID check
**Type:** EXTERNAL
**Human:** Opens a top pin, replaces the ID in the URL with the canonical pin ID, checks whether another brand appears. If so, traffic is being stolen — reports to Pinterest.
**System:** Records findings and creates a report task if theft is found.
**Reads:** `audit_findings.top_pins`
**Writes:** `audit_findings.canonical`
**Feeds:** —

### P1.2.7 · Board architecture audit
**Type:** IN_DASHBOARD
**Human:** Reviews every existing board name and decides: keep, rename to an exact parent interest, or archive. "Dream Vibe" becomes "Modern Luxury Living Room".
**System:** Lists all boards with pin counts and last activity. Suggests taxonomy matches from the 3,437-row interest sheet, but does not rename anything.
**Reads:** `boards`, Pinterest interest taxonomy
**Writes:** `boards` (renamed, flagged)
**Feeds:** P3.3.1 board list

### P1.2.8 · Inventory group boards
**Type:** AUTO
**Why auto:** Group board membership is a flag on the API response.
**Human:** Decides per board: leave or archive. Outdated for brands — they dilute context with other accounts' pins.
**System:** Lists group boards.
**Reads:** `boards`
**Writes:** `audit_findings.group_boards`
**Feeds:** P3.3.1

### P1.2.9 · Boards under 10 pins
**Type:** AUTO
**Human:** Sets them back to secret until they hold 10–15 pins.
**System:** Lists public boards below the threshold and offers a bulk privacy change.
**Reads:** `boards`
**Writes:** `boards.privacy`
**Feeds:** P3.3.6 seeding

### P1.2.10 · Rich Pins and Open Graph
**Type:** EXTERNAL
**Human:** Pastes a product URL into the Pin Builder. Title and price appearing automatically means it works. If not, follows the per-CMS fix.
**System:** Shows the fix instructions for the recorded CMS platform.
**Reads:** `client_profile.cms_platform`
**Writes:** `audit_findings.rich_pins`
**Feeds:** —

### P1.2.11 · Determine inactivity period
**Type:** AUTO
**Why auto:** This drives the account class and therefore all pacing. Getting it wrong risks a spam flag.
**Human:** Confirms the calculated class.
**System:** Reads the last pin date via the API and computes: silent longer than 6 months → NEW with 48h spacing, regardless of account age.
**Reads:** Pinterest API
**Writes:** `client_settings.account_class`, `spacing_hours`
**Feeds:** All of phase 4 scheduling

### P1.2.12 · Shadowban signals
**Type:** IN_DASHBOARD
**Human:** Judges whether impressions are stuck in single digits despite history, or whether the audience has been downgraded to lower-value countries after inactivity. Contacts Pinterest Support if suspected.
**System:** Shows the impression curve and audience-country breakdown over 12 months.
**Reads:** `kpi_snapshots`
**Writes:** `audit_findings.shadowban`
**Feeds:** —

### P1.2.13 · Analytics baseline
**Type:** AUTO
**Why auto:** Thirteen KPIs across three periods, manually transcribed, is where errors enter.
**Human:** Fills the GA4 and Conversion Insights figures that are not available via API. Notes the trend direction: growing / stable / declining.
**System:** Pulls Pinterest metrics for last 30 days, month -1 and month -2 side by side, filtered Organic + Claimed Domain + Your Pins, realtime data excluded.
**Reads:** Pinterest API, `access_items.ga4`
**Writes:** `kpi_snapshots.baseline`
**Feeds:** Every phase-5 report, forever

### P1.2.14 · Top performing pins
**Type:** AUTO
**Human:** Selects the 5–10 strongest and marks their URLs as month-1 priorities.
**System:** Ranks by outbound clicks and separately by saves — never impressions.
**Reads:** Pinterest API
**Writes:** `urls` (flagged BEST_PERFORMER), `audit_findings.top_pins`
**Feeds:** P4.1.1 month-1 candidates

### P1.2.15 · Annotations of top pins
**Type:** EXTERNAL
**Human:** Pastes each top pin URL into PinClicks pin stats, copies the annotated interests.
**System:** Stores as keyword candidates, unvalidated. An annotation is not a keyword until it has volume — Pinterest's AI hallucinates.
**Reads:** `audit_findings.top_pins`
**Writes:** `keywords` (unvalidated, `source: annotation`)
**Feeds:** P3.1.6 dedupe

## Step 3 — Technical Setup *(new and existing)*

### P1.3.1 · Business account
**Type:** AUTO
**Human:** Converts in settings if personal.
**System:** Checks account type via API.
**Reads:** Pinterest API
**Writes:** `audit_findings.business_account`
**Feeds:** —

### P1.3.2 · Claim domain
**Type:** EXTERNAL
**Human:** Places the meta tag in the CMS until the verified checkmark appears.
**System:** Verifies claim status via API.
**Reads:** `access_items.cms`
**Writes:** `audit_findings.domain_claim`
**Feeds:** P1.2.13 filters depend on a claimed domain

### P1.3.3 · Pinterest tag
**Type:** EXTERNAL
**Human:** Checks Ads → Conversions that the base code is installed and PageVisit, AddToCart and Checkout all fire.
**System:** Records per-event status.
**Reads:** —
**Writes:** `audit_findings.pinterest_tag`
**Feeds:** P5.1 conversion metrics

### P1.3.4 · Connect catalogue
**Type:** EXTERNAL
**Human:** Connects the feed via Ads → Catalogs or the Shopify app, confirms products ingest.
**System:** Records status and product count.
**Reads:** `client_profile.feed_url`
**Writes:** `audit_findings.catalog`
**Feeds:** —

### P1.3.5 · Profile public
**Type:** AUTO
**Human:** Switches it off private if needed.
**System:** Checks visibility via API.
**Reads:** Pinterest API
**Writes:** `audit_findings.visibility`
**Feeds:** —

### P1.3.6 · Turn off shopping recommendations
**Type:** EXTERNAL
**Human:** Settings → Social Permissions → off, for both standard pins and Idea Pins. Leaving it on lets Pinterest show competing products beside your pin.
**System:** Records confirmation.
**Reads:** —
**Writes:** `audit_findings.shopping_recs`
**Feeds:** —

### P1.3.7 · Limit messages
**Type:** EXTERNAL
**Human:** Sets messaging to no-one unless the client monitors the inbox.
**System:** Records confirmation.
**Reads:** —
**Writes:** `audit_findings.messaging`
**Feeds:** —

### P1.3.8 · Measure page speed
**Type:** EXTERNAL
**Human:** Runs pagespeed.web.dev on mobile and desktop, records both scores, advises compression if weak.
**System:** Stores scores; flags as a performance risk below threshold.
**Reads:** `client_profile.website_url`
**Writes:** `audit_findings.page_speed`
**Feeds:** —

### P1.3.9 · Review URL slugs
**Type:** IN_DASHBOARD
**Human:** Judges whether slugs are keyword-rich or messy. Does not change existing URLs — that breaks Google SEO — but advises better slugs for new pages.
**System:** Lists sample URLs from the sitemap.
**Reads:** `urls`
**Writes:** `audit_findings.slugs`, advice into `client_recommendations`
**Feeds:** —

### P1.3.10 · Image file names
**Type:** IN_DASHBOARD
**Human:** Checks whether site images are named `IMG_8492.jpg` or `modern-vanity-lighting.jpg`. Pinterest's OCR reads file names.
**System:** Records the finding.
**Reads:** —
**Writes:** `audit_findings.image_names`, advice into `client_recommendations`
**Feeds:** P4.2.6 file naming convention

### P1.3.11 · Meta descriptions
**Type:** EXTERNAL
**Human:** Checks meta descriptions on priority pages contain the target keywords. Pinterest scans landing page summary text.
**System:** Records the finding.
**Reads:** `urls`
**Writes:** `audit_findings.meta_descriptions`
**Feeds:** —

### P1.3.12 · Save buttons on the site
**Type:** EXTERNAL
**Human:** Hovers over site images to check for a Save button. Pins saved by visitors rank roughly twice as fast. Advises a plugin if missing.
**System:** Records the finding.
**Reads:** —
**Writes:** `audit_findings.save_buttons`
**Feeds:** —

### P1.3.13 · Mobile experience
**Type:** EXTERNAL
**Human:** Reviews the destination on a phone: loading, scrolling, buying. More than 80 percent of Pinterest traffic is mobile.
**System:** Records the assessment.
**Reads:** —
**Writes:** `audit_findings.mobile_ux`
**Feeds:** —

### P1.3.14 · Content bank audit
**Type:** IN_DASHBOARD
**Human:** Maps at least two URLs to each funnel stage — top for inspiration, middle for consideration, bottom for conversion.
**System:** Shows the sitemap URLs and lets each be tagged. Counts per stage and warns below two.
**Reads:** `urls`
**Writes:** `urls.funnel_stage`
**Feeds:** P2.4.2 frequency, P4.1.1 candidates

---

# PHASE 2 · MARKET RESEARCH & STRATEGY

*One-time. Sets the visual and semantic direction.*

## Step 1 — Grid & Competitors

### P2.1.1 · Choose seed keywords
**Type:** IN_DASHBOARD
**Human:** Picks five to ten broad terms describing the brand.
**System:** Suggests candidates from the intake, the GSC queries and the product feed. Manager decides.
**Reads:** `client_profile`, `keywords` (source gsc/google)
**Writes:** `keywords` (flagged `seed`)
**Feeds:** P2.1.2, P3.1.1

### P2.1.2 · Review the grid per keyword
**Type:** EXTERNAL
**Human:** Searches each seed keyword incognito, or via PinClicks to avoid personalisation bias. Studies the first 15–20 organic pins.
**System:** Opens the search per keyword and provides the recording form.
**Reads:** `keywords` (seed)
**Writes:** — *(recorded in P2.1.3)*
**Feeds:** P2.1.3

### P2.1.3 · Record the grid
**Type:** IN_DASHBOARD
**Human:** Per keyword: dominant format (2:3 / 9:16 / 1:1 / square product), CTA presence yes/no, text overlay share as a bucket, one line on the feel of page 1.
**System:** Structured choices only — this is where two managers most easily diverge.
**Reads:** `keywords` (seed)
**Writes:** `grid_analyses`
**Feeds:** P2.2.1, P4.2.1, P4.2.3

### P2.1.4 · Extract dominant colours
**Type:** IN_DASHBOARD
**Human:** Right-clicks beside the top 3 pins → View Page Source → searches `dominant_color`. Enters three hex codes per keyword.
**System:** Validates hex format, renders the swatches.
**Reads:** `grid_analyses`
**Writes:** `grid_analyses.dominant_colors`
**Feeds:** P4.2.3 design brief — *the single most-requested cross-phase value*

### P2.1.5 · Identify competitors
**Type:** IN_DASHBOARD
**Human:** Names five to ten real brands with active accounts in the same niche. Not Shein, not individual collectors.
**System:** Captures handle, profile URL, niche fit rating.
**Reads:** `grid_analyses`
**Writes:** `competitors`
**Feeds:** P2.1.6, P2.4.1

### P2.1.6 · Export competitor pins
**Type:** EXTERNAL
**Human:** Exports 700–1000 pins per competitor from PinInspector, uploads the CSVs. Manual by design.
**System:** Parses each CSV, reports the row count back, extracts annotations and dominant colours as candidates.
**Reads:** `competitors`
**Writes:** `competitor_pins`, candidates into `keywords`
**Feeds:** P2.2.1, P3.1.4

### P2.1.7 · Collect top pin designs
**Type:** IN_DASHBOARD
**Human:** Per keyword records the strongest pins: URL, title, description, annotations, colours.
**System:** Structured capture.
**Reads:** `grid_analyses`
**Writes:** `grid_analyses.top_pins`
**Feeds:** P2.2.1

## Step 2 — AI Market Analysis

### P2.2.1 · Run AI market analysis
**Type:** AI_DRAFT
**Why AI:** Synthesising 5–10 competitor CSVs of 1000 rows each is not human work.
**Human:** Reviews the output. Nothing is applied without approval.
**System:** Assembles the prompt from what is already stored — intake, brand book, catalogue, tone of voice, grid analyses, competitor CSVs. Manager pastes nothing. Frequency measured over 4 months, not 30 days. Output is structured, not prose.
**Reads:** `client_profile`, `grid_analyses`, `competitors`, `competitor_pins`, `assets`
**Writes:** `market_analysis`, `ai_drafts`
**Feeds:** P2.2.2

### P2.2.2 · Review insights
**Type:** IN_DASHBOARD
**Human:** Approves or rejects each item individually, with a reason on rejection. Focus on the Steal List (board names competitors use that we should adopt) and the Board Gap (what nobody covers).
**System:** Renders each finding as an approvable item.
**Reads:** `market_analysis`
**Writes:** approved items into `keywords`, `topics`, board candidates
**Feeds:** P3.3.1 board list

## Step 3 — Audience & Taste Graph

### P2.3.1 · Taste graph mapping
**Type:** IN_DASHBOARD
**Human:** Fills seven fields: core products, spaces / use context, aesthetics, moments and seasons, functional outcome, aspirational outcome, related high-affinity interests. Multiple entries each.
**System:** Pre-fills suggestions from the market analysis and audience document; the manager edits freely.
**Reads:** `client_profile`, `market_analysis`, `assets` (audience doc)
**Writes:** `taste_graph`
**Feeds:** P2.3.3

### P2.3.2 · Read Audience Insights
**Type:** EXTERNAL
**Human:** Opens Pinterest Audience Insights → Engaged audience, notes affinities. Surprising correlations often produce the best content angles.
**System:** Captures the affinity list.
**Reads:** —
**Writes:** `taste_graph.affinities`
**Feeds:** P2.3.3

### P2.3.3 · Three angles, worlds and moments
**Type:** IN_DASHBOARD
**Human:** Distils exactly three content angles, three visual worlds, three key moments.
**System:** Enforces exactly three each — this feeds board names, clusters and image prompts, so vagueness here compounds.
**Reads:** `taste_graph`
**Writes:** `taste_graph.distilled`
**Feeds:** P3.1.11 clusters, P3.3.1 board list, P4.2.3 design brief

## Step 4 — Inventory & Frequency

### P2.4.1 · Determine competitor velocity
**Type:** EXTERNAL
**Human:** Measures pins per day for the top 5 competitors over 4 months in PinClicks. Sets the market standard.
**System:** Captures per competitor, computes the market average.
**Reads:** `competitors`
**Writes:** `competitors.velocity`, market average
**Feeds:** P2.4.2

### P2.4.2 · Set frequency
**Type:** AUTO
**Why auto:** The 16-pin math is arithmetic, and getting it wrong makes the whole schedule infeasible.
**Human:** Locks the daily target after seeing the calculation. Two per day for a year beats ten per day for a week.
**System:** Given the daily target: pins/month = target × 30, URLs needed = pins ÷ 16. Compares against available cooldown-safe URLs and warns on a shortfall. Caps at 20 pins/day. For NEW accounts starts at 1/day, prompts a step-up after a few weeks and only above 5 after two months.
**Reads:** `url_counts`, `urls`, `competitors.velocity`, `client_settings.account_class`
**Writes:** `client_settings.daily_pin_target`, `urls_per_month`
**Feeds:** P4.1.4 — how many URLs to select each cycle

---

# PHASE 3 · SEO ARCHITECTURE

*One-time. Builds the keyword bank and the board structure.*

## Step 1 — Keyword Bank

### P3.1.1 · Candidates from the search bar
**Type:** EXTERNAL
**Human:** Types each seed keyword in Pinterest search, records suggestions **in order** — that order is ranked by volume and is a free proxy.
**System:** Stores each with its rank.
**Reads:** `keywords` (seed)
**Writes:** `keywords` (`source: autocomplete`, with rank)
**Feeds:** P3.1.6

### P3.1.2 · Candidates from bubbles
**Type:** EXTERNAL
**Human:** Records the coloured filter bubbles above results and the related searches below.
**System:** Stores as candidates.
**Reads:** `keywords` (seed)
**Writes:** `keywords` (`source: bubbles`)
**Feeds:** P3.1.6

### P3.1.3 · Candidates from the Interest Sheet
**Type:** IN_DASHBOARD
**Human:** Searches the official Pinterest taxonomy in the dashboard, selects relevant interests. If an interest exists, there is demonstrable audience.
**System:** Full-text search over the 3,437-row taxonomy with checkbox selection.
**Reads:** Pinterest interest taxonomy
**Writes:** `keywords` (`source: taxonomy`, flagged as parent interest)
**Feeds:** P3.1.9, P3.3.1 board naming

### P3.1.4 · Candidates from competitor annotations
**Type:** AUTO
**Human:** Selects which extracted annotations are worth validating.
**System:** Mines the PinInspector exports for annotated interests, ranks by frequency across competitors.
**Reads:** `competitor_pins`
**Writes:** `keywords` (`source: annotation`)
**Feeds:** P3.1.6

### P3.1.5 · Recognise a cloaked niche
**Type:** EXTERNAL *(conditional)*
**Human:** If Pinterest hides suggestions (sensitive niches: kids, health, weight loss, intimates), runs the top 3 pins through PinClicks pin stats and reads the annotations there instead.
**System:** Only surfaces this task when the manager flags a cloaked niche.
**Reads:** `client_profile.niche`
**Writes:** `keywords` (`source: cloaked_workaround`)
**Feeds:** P3.1.6

### P3.1.6 · Deduplicate against the cache
**Type:** AUTO
**Why auto:** Volume is a property of the term, not the client. Two managers must never look up the same term twice.
**Human:** Reviews the hit/miss split.
**System:** Matches all candidates against the shared `keyword_volume_cache` (no org_id by design). Reports hits, misses, and stale entries older than 180 days. Shows how many lookups the cache just saved.
**Reads:** all candidate `keywords`, `keyword_volume_cache`
**Writes:** volume onto cached terms
**Feeds:** P3.1.7

### P3.1.7 · Generate work list
**Type:** AUTO
**Human:** Reviews and reorders if needed.
**System:** Produces a prioritised list of cache misses only, so the manual session stays manageable.
**Reads:** dedupe result
**Writes:** `keyword_lookup_queue`
**Feeds:** P3.1.8

### P3.1.8 · PinClicks session
**Type:** EXTERNAL
**Human:** Works the list in PinClicks, enters volume per term. Adds related keywords found along the way — that is where the good finds are.
**System:** Writes every entry to the shared cache with a 180-day expiry. Records whether the term has a taxonomy match, which is a stronger signal than volume alone.
**Reads:** `keyword_lookup_queue`
**Writes:** `keyword_volume_cache`, `keywords.volume`, `keywords.validated`
**Feeds:** Everything downstream that needs volume

### P3.1.9 · Assign parent interests
**Type:** IN_DASHBOARD
**Human:** Groups validated keywords under taxonomy threads. Minimum five. These become board names.
**System:** Suggests matches from the taxonomy; manager confirms.
**Reads:** `keywords` (validated), taxonomy
**Writes:** `topics`
**Feeds:** P3.3.1, P3.3.2 coverage

### P3.1.10 · Determine generic keywords
**Type:** IN_DASHBOARD
**Human:** Applies the test to each candidate: does this apply to every product? Yes → generic. No → belongs in a cluster. Five to ten pass.
**System:** Presents each validated keyword with an explicit yes/no; enforces the 5–10 range server-side.
**Reads:** `keywords` (validated)
**Writes:** `keywords.is_generic`
**Feeds:** P3.2.1 display name, P3.2.2 bio, P4.1.6

### P3.1.11 · Form topic clusters
**Type:** IN_DASHBOARD
**Human:** Builds at least three clusters of 10–15 keywords. Clusters by product, moment, colour, size, material or season — moment usually works best on Pinterest.
**System:** Nested editor; enforces the minimums.
**Reads:** `keywords` (validated), `taste_graph.distilled`
**Writes:** `keywords.cluster`
**Feeds:** P3.3.1 board list, P4.1.6

### P3.1.12 · Seasonal classification
**Type:** IN_DASHBOARD
**Human:** Reads the curve in Pinterest Trends and classifies each keyword EVERGREEN / SEASONAL / MICRO_TREND. Enters the peak window for seasonal terms.
**System:** Only shows date fields for SEASONAL. Auto-excludes MICRO_TREND from board candidacy — micro-trends never become a board.
**Reads:** `keywords` (validated)
**Writes:** `keywords.season_type`, `peak_window`
**Feeds:** P3.1.13, P4.1.2 seasonal candidates

### P3.1.13 · Calculate publishing windows
**Type:** AUTO
**Why auto:** Publishing late is the single most common failure, and the arithmetic is fixed.
**Human:** Reviews; can pull earlier for Black Friday and Christmas.
**System:** Computes peak minus 6–10 weeks per seasonal keyword, defaulting to 8.
**Reads:** `keywords.peak_window`
**Writes:** `keywords.publish_from`
**Feeds:** P4.1.2, content calendar

### P3.1.14 · Align keywords with the client
**Type:** IN_DASHBOARD
**Human:** Shares the bank with the client. Some high-volume terms clash with positioning — better to know now.
**System:** Generates a shareable list; records approved and forbidden terms.
**Reads:** `keywords`
**Writes:** `keywords.client_approved`, `client_profile.forbidden_keywords`
**Feeds:** Blocks forbidden terms everywhere downstream

## Step 2 — Profile Optimisation

### P3.2.1 · Display name
**Type:** AI_DRAFT
**Human:** Approves or rewrites.
**System:** Proposes from brand name plus high-volume generic keywords. Validates: max 65 characters, at least one keyword with cached volume. Multiple segments are allowed — real accounts use `Brand | Category | Keyword`.
**Reads:** `client_profile`, `keywords` (generic, validated)
**Writes:** `client_profile.display_name`, `ai_drafts`
**Feeds:** —

### P3.2.2 · Bio
**Type:** AI_DRAFT
**Human:** Approves or rewrites.
**System:** Proposes natural sentences carrying roughly five broad keywords, CTA at the end. Validates: max 500 characters, 3–7 cached keywords, no keyword stuffing, no hashtags, no em dash.
**Reads:** `client_profile`, `keywords` (generic, validated)
**Writes:** `client_profile.bio`, `ai_drafts`
**Feeds:** —

### P3.2.3 · Profile photo and cover
**Type:** EXTERNAL
**Human:** Uploads a sharp 1:1 photo and a cover checked on both desktop and mobile — the crop differs. If the client sells to both genders, shows both.
**System:** Records completion and stores the assets.
**Reads:** `client_profile.brand_colors`, `assets`
**Writes:** `assets`
**Feeds:** —

## Step 3 — Boards & Seeding

### P3.3.1 · Finalise board list
**Type:** IN_DASHBOARD
**Human:** Decides the full list. Think like a librarian, not a collector — do not just mirror the catalogue, also cover colours, occasions and moments. Twenty to thirty boards, mixing broad and niche.
**System:** Proposes candidates from parent interests, clusters, the Steal List and the Board Gap. Enforces 20–30. Every board must be linked to a topic.
**Reads:** `topics`, `keywords`, `market_analysis`, `taste_graph.distilled`, existing `boards`
**Writes:** `boards` (status PLANNED)
**Feeds:** P3.3.2

### P3.3.2 · Check coverage
**Type:** AUTO
**Why auto:** This is a gate. It must be enforced, not remembered.
**Human:** Adds boards where coverage fails.
**System:** Counts active boards per topic. Below five blocks phase 4 for that topic.
**Reads:** `boards`, `topics`
**Writes:** `topics.coverage_ok`
**Feeds:** **Blocks P4.1.1 and P4.1.7**

### P3.3.3 · Board descriptions
**Type:** AI_DRAFT
**Why AI:** Thirty descriptions of 400–480 characters per client, fifty clients. This is where consistency is won or lost.
**Human:** Reads, rewrites where it misses, approves.
**System:** Generates per board from the board name, its assigned keywords with volume, brand tone and taste graph. Runs validators before showing: 400–480 characters, board name in the first sentence, 5–10 keywords in running sentences, no stuffing. A draft that fails is regenerated, not displayed.
**Reads:** `boards`, `keywords`, `client_profile`, `taste_graph`
**Writes:** `boards.description`, `ai_drafts` (generated + approved)
**Feeds:** P3.3.5

### P3.3.4 · Generate creation schedule
**Type:** AUTO
**Why auto:** Exceeding three boards per day is a spam signal on a fresh account.
**Human:** Reviews the dates.
**System:** Spreads board creation at max 3/day. Twenty boards therefore takes a week.
**Reads:** `boards` (PLANNED)
**Writes:** `boards.scheduled_creation_date`
**Feeds:** P3.3.5

### P3.3.5 · Create boards
**Type:** AUTO
**Human:** Confirms; monitors failures.
**System:** Creates boards via the Pinterest API as `PROTECTED` (the API rejects `SECRET`), on schedule, enforced by the 3/day database trigger. Writes back the Pinterest board ID.
**Reads:** `boards`, `boards.description`
**Writes:** `boards.pinterest_board_id`, `boards.status`
**Feeds:** P3.3.6

### P3.3.6 · Select seeding pins
**Type:** IN_DASHBOARD
**Human:** Chooses 10–15 existing own pins per board. Never competitor content — that leaks conversion traffic.
**System:** Proposes matches from the client's own pins ranked by keyword and board relevance. Competitor pins are structurally excluded. If the account has no own pins, routes to the manual widget method from the client website.
**Reads:** `boards`, own `pins`, `keywords`
**Writes:** `seeding_plan`
**Feeds:** P3.3.7

### P3.3.7 · Run seeding
**Type:** AUTO *(or EXTERNAL in month 1)*
**Human:** Confirms. In month 1, may pin manually via the Pinterest widget from the client website using direct login — this guarantees no foreign brand aesthetics enter the board.
**System:** Pins via API respecting spacing and daily volume triggers.
**Reads:** `seeding_plan`
**Writes:** `pins`, `boards.pin_count`
**Feeds:** P3.3.8

### P3.3.8 · Set boards to public
**Type:** AUTO
**Human:** —
**System:** Flips a board to PUBLIC automatically once it holds ten pins.
**Reads:** `boards.pin_count`
**Writes:** `boards.privacy`
**Feeds:** P3.3.2 coverage recount

---

# PHASE 4 · MONTHLY CONTENT ENGINE

*Recurring. One cycle per URL. This is the production engine.*

## Step 1 — URL Selection

### P4.1.1 · Show candidate URLs
**Type:** AUTO
**Human:** Browses. Everything shown is already allowed.
**System:** Lists bestsellers, top pins and new launches with the 60-day URL cooldown and topic coverage already filtered out. Month 1 leads with the P1.2.14 top performers. Later cycles lead with the previous month's winners.
**Reads:** `urls`, `urls_selectable` view, `topics.coverage_ok`, P5.2 winners
**Writes:** —
**Feeds:** P4.1.4

### P4.1.2 · Seasonal candidates
**Type:** AUTO
**Human:** Reviews.
**System:** Surfaces URLs whose keywords peak 8–12 weeks out, per the 90-day rule.
**Reads:** `keywords.publish_from`, `urls`
**Writes:** —
**Feeds:** P4.1.4

### P4.1.3 · Request new URLs
**Type:** IN_DASHBOARD
**Human:** Asks the client about launches and new blog posts. The algorithm rewards brand-new URLs heavily.
**System:** Captures new URLs into the pool, flagged NEW.
**Reads:** —
**Writes:** `urls` (reason NEW)
**Feeds:** P4.1.4

### P4.1.4 · Select URLs
**Type:** IN_DASHBOARD
**Human:** The core judgement of the month. Starts with bestsellers and most-visited pages, cross-references with season.
**System:** Shows how many URLs the frequency requires and counts down as they are selected.
**Reads:** `client_settings.urls_per_month`, candidates
**Writes:** `cycles` (one per URL)
**Feeds:** All of phase 4

### P4.1.5 · Fill in why this URL matters
**Type:** IN_DASHBOARD
**Human:** Picks a mandatory reason: Seasonal, New, Best Performer, Client Request, Stock Push, AB Test.
**System:** Fixed enum, server-rejected on anything else. This is the only way to learn afterwards why something did not work.
**Reads:** —
**Writes:** `urls.reason`
**Feeds:** P5.2.2 attribution by reason

### P4.1.6 · Assign keywords
**Type:** IN_DASHBOARD
**Human:** Picks up to five per URL, mixing short and long-tail.
**System:** Shows the keyword bank filtered to validated, client-approved, non-forbidden terms with their volume and cluster. Marks the primary keyword.
**Reads:** `keywords`
**Writes:** `cycles.keywords`, marks keywords in-use
**Feeds:** P4.2.3, P4.2.8

### P4.1.7 · Assign boards
**Type:** IN_DASHBOARD
**Human:** Picks at least five semantically relevant boards. Swimwear does not belong on a strapless bra board even though both are lingerie.
**System:** Shows boards for the URL's topic with coverage status and the 180-day board-URL cooldown already applied. Blocks below five.
**Reads:** `boards`, `topics.coverage_ok`, board-URL history
**Writes:** `cycles.boards`
**Feeds:** P4.3.1 rotation

### P4.1.8 · Long-tail to the design brief
**Type:** IN_DASHBOARD
**Human:** Picks three to five descriptive keywords to serve as the text-overlay hook.
**System:** Filters to long-tail terms from the assigned set.
**Reads:** `cycles.keywords`
**Writes:** `cycles.overlay_keywords`
**Feeds:** P4.2.3

## Step 2 — Content Production

### P4.2.1 · Grid analysis before designing
**Type:** EXTERNAL
**Human:** Searches the primary keyword now and records what Pinterest is currently rewarding. Fitting in beats standing out — neon pink in a beige grid fails.
**System:** Mandatory gate: blocks the design brief until recorded for this cycle. Shows the phase-2 grid analysis alongside for comparison.
**Reads:** `grid_analyses`
**Writes:** `cycles.grid_check`
**Feeds:** **Gates P4.2.3**

### P4.2.2 · Determine route
**Type:** IN_DASHBOARD
**Human:** Direct design if the client has lifestyle material, otherwise the AI route.
**System:** Pre-selects based on the content quality recorded in P1.1.7.
**Reads:** `client_profile.content_quality`
**Writes:** `cycles.production_route`
**Feeds:** P4.2.4

### P4.2.3 · Generate design brief
**Type:** AUTO
**Why auto:** Pure assembly of values already stored. Re-entering them by hand is where drift enters.
**Human:** Reviews and hands to the designer.
**System:** Assembles per URL: primary and secondary keywords, dominant hex codes from P2.1.4 **and** the fresh grid check, format, overlay yes/no, the 80/20 save-click split, brand colours and typography, overlay hook keywords, safe zones, sans-serif requirement.
**Reads:** `cycles`, `grid_analyses`, `client_profile`, `taste_graph.distilled`
**Writes:** `cycles.design_brief`
**Feeds:** P4.2.4

### P4.2.4 · Create four designs
**Type:** EXTERNAL
**Human:** Builds four visually distinct designs in Canva or Figma. 80 percent save pins (2:3, lifestyle, no text), 20 percent click pins (9:16, text, CTA) across the monthly volume. On the AI route: applies a 1% transparent frame before export to strip C2PA metadata, and never enables "Mark as AI-Modified" in the Pin Builder.
**System:** Shows the brief beside the upload. Stores the four designs.
**Reads:** `cycles.design_brief`
**Writes:** `cycles.designs`, `assets`
**Feeds:** P4.2.5

### P4.2.5 · Generate fresh copies
**Type:** EXTERNAL
**Human:** Applies a micro-crop to copies B, C and D of each design. Image is the heaviest freshness signal after the URL — this keeps distribution at 64–77 percent instead of dropping to 11–35.
**System:** Shows the freshness ladder so the manager can see what the crop is worth. Stores 16 image variants.
**Reads:** `cycles.designs`
**Writes:** `cycles.copies` (16)
**Feeds:** P4.3.1

### P4.2.6 · File names
**Type:** AUTO
**Human:** Applies the suggested names on export.
**System:** Generates lowercase hyphenated names containing the primary keyword. A hidden SEO signal — Pinterest's OCR reads file names.
**Reads:** `cycles.keywords`
**Writes:** `cycles.file_names`
**Feeds:** P4.4.1

### P4.2.7 · Design QC
**Type:** IN_DASHBOARD
**Human:** Confirms: colours match the grid, overlay rule respected, four genuinely different designs, sans-serif fonts only, safe zones clear, file names correct, no watermarks, no AI-modified label.
**System:** Checklist with the brief shown beside it. Cannot be skipped silently.
**Reads:** `cycles.design_brief`, `cycles.designs`
**Writes:** `cycles.design_qc`
**Feeds:** P4.2.8

### P4.2.8 · Generate copy
**Type:** AI_DRAFT
**Why AI:** Four sets per URL, sixteen URLs a month, fifty clients. Volume makes it impossible by hand at consistent quality.
**Human:** Edits and approves each set.
**System:** Generates four sets per URL, one per design — the four crops of a design share their text, because image weighs more than text. Each set produces **four outputs**: on-pin tagline (4–9 words, max 12, contains the primary keyword), pin title, pin description, and where needed the board description. Prompt is assembled from stored data: brand tone, primary and secondary keywords, landing page content, image context.
**Reads:** `cycles`, `client_profile`, `keywords`
**Writes:** `cycles.copy_sets`, `ai_drafts`
**Feeds:** P4.2.9

### P4.2.9 · Run validators
**Type:** AUTO
**Why auto:** Character limits are mechanical, and a violation is invisible until distribution suffers.
**Human:** Fixes anything that fails.
**System:** Blocks, does not warn: title max 100 characters with a keyword at the front, description 250–300, no em dash, no en dash, no exclamation mark, no hashtag, tagline within word limits, no URL shorteners, no manual UTM parameters.
**Reads:** `cycles.copy_sets`
**Writes:** `cycles.validation_result`
**Feeds:** P4.2.10

### P4.2.10 · Copy QC
**Type:** IN_DASHBOARD
**Human:** Judges only what a validator cannot: does it sound like the brand, does it match the image, does the landing page deliver on it, are the four sets genuinely different.
**System:** Shows copy beside its design and the landing page.
**Reads:** `cycles.copy_sets`, `cycles.designs`
**Writes:** `cycles.copy_qc`
**Feeds:** P4.3.1

## Step 3 — Waterfall Planning

### P4.3.1 · Generate waterfall
**Type:** AUTO
**Why auto:** This is the mechanism the whole system exists for. Manual scheduling of 16 pins across rotating boards is where errors are guaranteed.
**Human:** — *(reviews in P4.3.2)*
**System:** Builds 16 pins: 4 designs × 4 fresh copies. Board rotation by offset — `board_position = (design_index + copy_index) % 4` — so design 1 goes to boards 1-2-3-4, design 2 to 2-3-4-1, and every board receives four pins from four different designs. Interval between same-design pins = number of designs × spacing days: 4 days established, 8 days new. Enforces the 180-day board-URL cooldown across waterfalls but not within one. Waterfalls are rolling chains, never bounded by calendar month.
**Reads:** `cycles`, `client_settings.spacing_hours`, board-URL history
**Writes:** `cycles.waterfall`, 16 `pins` with dates and boards
**Feeds:** P4.3.2

### P4.3.2 · Approve waterfall
**Type:** IN_DASHBOARD
**Human:** Checks the spread on a visual calendar before anything is scheduled.
**System:** Renders the calendar and the design-to-board matrix. Flags collisions with other running cycles against the daily pin target.
**Reads:** `cycles.waterfall`, other active cycles
**Writes:** `cycles.approved`
**Feeds:** P4.4.1

## Step 4 — Scheduling

### P4.4.1 · Schedule on Pinterest
**Type:** AUTO
**Human:** Confirms.
**System:** Publishes via the Pinterest API. Always standard pins — never simplified or idea format, which are barely distributed. Respects the pin spacing trigger, the daily volume ceiling and the 20/day hard cap.
**Reads:** `cycles.waterfall` (approved)
**Writes:** `pins.pinterest_pin_id`, `pins.status`
**Feeds:** P4.4.2, P5.1.1

### P4.4.2 · Monitor publishing
**Type:** AUTO
**Human:** Acts on failures.
**System:** Flags errors, queues on rate limits, reports expiring or expired tokens before they break a cycle.
**Reads:** `pins`
**Writes:** `pins.errors`
**Feeds:** Leak panel

---

# PHASE 5 · MONTHLY REVIEW & REPORTING

*Recurring monthly. Closes the loop back into phase 4.*

## Step 1 — Data & Reporting

### P5.1.1 · Pull Pinterest analytics
**Type:** AUTO
**Human:** Reviews.
**System:** Fetches with fixed filters: Organic + Claimed Domain + Your Pins, realtime data excluded. Pulls the thirteen KPIs including page visits, add to cart, checkouts, conversions and revenue from Conversion Insights. Reports Your Pins and Other Pins separately.
**Reads:** Pinterest API
**Writes:** `kpi_snapshots`
**Feeds:** P5.1.4, P5.2.1

### P5.1.2 · Pull GA4 data
**Type:** EXTERNAL
**Human:** Pulls session duration, bounce rate, pages per session and engagement rate for Pinterest traffic. GA4 measures quality, not volume.
**System:** Structured entry, compared against site-wide averages.
**Reads:** `access_items.ga4`
**Writes:** `kpi_snapshots.ga4`
**Feeds:** P5.1.4

### P5.1.3 · Explain the attribution gap
**Type:** IN_DASHBOARD
**Human:** Confirms the explanation is included in the client report.
**System:** Provides pre-written client-facing copy: more than 80 percent of Pinterest activity happens in the mobile app where the referral tag is lost, so that traffic appears as direct in GA4. Pinterest native is the source of truth for volume; GA4 proves quality.
**Reads:** `kpi_snapshots`
**Writes:** `monthly_report.attribution_note`
**Feeds:** P5.1.4

### P5.1.4 · Update Looker Studio
**Type:** EXTERNAL
**Human:** Inputs the figures into the client's Looker Studio template: channel overview, organic breakdown, Pinterest performance panel, on-site quality analysis.
**System:** Presents all figures in the required layout so nothing is transcribed twice.
**Reads:** `kpi_snapshots`
**Writes:** `monthly_report.dashboard_updated`
**Feeds:** —

## Step 2 — Creative Optimisation

### P5.2.1 · Identify winners
**Type:** AUTO
**Human:** Reviews.
**System:** Ranks the top 3–5 pins on outbound clicks and separately on saves. Never impressions — those say nothing about intent.
**Reads:** `pins`, `kpi_snapshots`
**Writes:** `winners`
**Feeds:** P5.2.2

### P5.2.2 · Analyse winning combinations
**Type:** IN_DASHBOARD
**Human:** Interprets which design on which board worked and why. High clicks means a strong hook; high saves means strong aesthetics.
**System:** Shows performance attributed back to every decision: design, copy set, keyword, board, board breadth, and the "why this URL matters" reason. This is what makes cycle two better than cycle one.
**Reads:** `winners`, `cycles`, `urls.reason`, `boards`
**Writes:** `insights`
**Feeds:** P5.2.3, P4.1.1 next cycle

### P5.2.3 · Update the design brief
**Type:** IN_DASHBOARD
**Human:** Marks winning templates as proven so next month's production reuses them.
**System:** Flags templates; proven ones surface first in future design briefs. Each client converges on a handful of layouts that work.
**Reads:** `insights`
**Writes:** `design_templates.proven`
**Feeds:** P4.2.3

## Step 3 — Trends & Roadmap

### P5.3.1 · Check Pinterest Trends
**Type:** EXTERNAL
**Human:** Opens trends.pinterest.com for the client's market. Notes what is rising for the coming 60–90 days across yearly, monthly and growing trends.
**System:** New terms enter the keyword bank as unvalidated candidates.
**Reads:** `client_profile.market`
**Writes:** `keywords` (`source: trends`)
**Feeds:** P3.1.6 next validation round, P5.3.4

### P5.3.2 · Check Shopping Trends
**Type:** EXTERNAL
**Human:** Checks which product categories are surging in the client's niche.
**System:** Captures as structured advice items.
**Reads:** —
**Writes:** `insights.shopping_trends`
**Feeds:** P5.3.3

### P5.3.3 · Future insights for the client
**Type:** AI_DRAFT
**Human:** Reviews and adapts before sending.
**System:** Drafts the client-facing forecast slide: what is rising, what it means for inventory, content, newsletters and creative direction. Frames the Google Predictor effect — what rises on Pinterest rises on Google weeks later. This turns reporting from backward-looking into strategic.
**Reads:** `keywords` (trends), `insights.shopping_trends`, `client_profile`
**Writes:** `monthly_report.future_insights`, `ai_drafts`
**Feeds:** P5.3.4

### P5.3.4 · Next month roadmap
**Type:** IN_DASHBOARD
**Human:** Confirms the candidate list for next month's URL selection.
**System:** Combines winners from P5.2, rising trends from P5.3.1, seasonal terms whose publishing window opens, and URLs coming out of cooldown. The circle closes.
**Reads:** `winners`, `keywords`, `urls`
**Writes:** `next_cycle_candidates`
**Feeds:** **P4.1.1 — the loop**

---

## TYPE DISTRIBUTION

| Type | Count | Share |
|---|---|---|
| IN_DASHBOARD | 45 | 39% |
| EXTERNAL | 38 | 33% |
| AUTO | 27 | 23% |
| AI_DRAFT | 6 | 5% |

Roughly three quarters of all tasks involve human judgement. That is intentional.

---

## OPEN ITEMS

1. **Task count mismatch.** This document specifies 116 tasks. The live dashboard
   currently shows 47 in phase 1 rather than 44 — three tasks were added during the
   URL-expansion work and are not specified here. Reconcile before building.

2. **Not yet in the task list**, recommended additions from the source review:
   social claimed check (Shopify/Instagram, auto-publish OFF), re-optimising
   existing top pins that lack links or SEO (max 10–20/day, platform limit 150),
   Verified Merchant status check, six-monthly full SEO review, and the
   Organic-to-Paid audience handover in phase 5.

3. **Every task carries mandatory `time_spent_min` on completion**, and can be set
   to SKIPPED only with a reason from a fixed list. Skipped tasks do not satisfy
   the preconditions of other tasks.