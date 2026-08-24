# ORGANIC DASHBOARD — ARCHITECTURE & DESIGN BRIEF
Two audiences, one system. Written from the position of an agency adding a
€100k/month organic service to an existing €500k/month operation.
---
# PART 0 · THE GOVERNING PRINCIPLES
Five rules that decide every question below.
**1. Two audiences, one truth, two languages.**
The client sees one tab. Everything else is internal. Both read the same data —
never a separate "client version" of a number, because the moment those diverge
the service is finished. What differs is framing, density and vocabulary.
**2. Quality outranks automation, always.**
The consultancy was bought for €100k precisely because the method involves
judgement. We automate three things and nothing else: **assembly** (putting known
values in front of the person who needs them), **enforcement** (rules that must
never be broken), and **retrieval** (fetching and counting). We never automate
**selection, interpretation or taste**. Where the SOP author works manually, we
work manually — but we remove the looking-up, the transcribing and the
remembering, because those are not craft, they are friction.
**3. A wrong number is worse than no number.**
Every figure carries a provenance state. Missing is shown as missing, never as
zero. A dashboard that has ever shown a client something false is a dashboard
they will never trust again.
**4. Hard data and soft data are never given equal weight.**
Impressions are not results. The visual hierarchy must say so, or we are selling
vanity metrics at premium prices and the good clients will notice first.
**5. The work must be visible, honestly.**
Organic delivers slowly. In month two there is no revenue story. If the client
cannot see the depth of what has been built, they cancel in month three —
precisely before it starts working. So we show the artefacts of the strategy, not
just the outcomes.
---
# PART 1 · THE CLIENT VIEW
One tab. It is the only thing the client ever sees, and it must carry the retainer.
## 1.1 What it has to prove
A client paying €2–5k a month asks four questions, in this order:
1. Is this working?
2. What did you actually do?
3. Why should I believe the numbers?
4. What happens next?
The current build answers none of them. Four KPI tiles and a delta table answer a
fifth question nobody asked — *what are the raw figures*. The client view is
restructured around those four questions, in that sequence.
## 1.2 Structure — a report, not a dashboard
It reads top to bottom as a monthly narrative. Not a grid of widgets.
### Section A — The headline
One sentence, generated from the data and editable by the manager before the
client sees it. *"Pinterest drove 572 outbound clicks and €4,180 in attributed
revenue in August, up 41% on July, with the strongest performance from the
autumn edit collection."*
Beneath it, three to five hard numbers only. Outbound clicks, page visits,
add-to-cart, checkouts, revenue. Large, spaced, with the month-over-month
movement and the baseline comparison. Nothing else at this size.
**Why:** every client-facing report should be readable in ten seconds by someone
who will not scroll. If they scroll, that is a bonus, not the design assumption.
### Section B — Performance over time
A single line chart, monthly, from the phase-1 baseline forward. Two series
maximum: outbound clicks and saves. Compounding is the argument for organic, and
a line going up over twelve months makes that argument better than any paragraph.
Beneath it, a small stacked area showing pins published per month — the effort
line under the results line. The relationship between the two is the whole thesis
of the service.
**Never** a chart that starts at the current month. The baseline is the point.
### Section C — Traffic quality
This is the strongest argument the agency has and it is currently absent.
A grouped bar comparison: Pinterest traffic versus site average on engagement
rate, session duration, pages per session, bounce rate. In the reference data
Pinterest showed 42.55% engagement against 28.47% site-wide, two minutes versus
one, 57% bounce versus 71%.
That single visual reframes the conversation from *volume* to *quality of
audience*, which is where organic actually wins.
### Section D — The attribution note
Its own block, permanently. Not a footnote.
Two figures side by side — what Pinterest measured, what GA4 saw — and the
explanation: over 80% of Pinterest activity happens inside the mobile app, where
the referral tag is dropped by modern privacy handling, so that traffic appears
as *direct* in GA4. Pinterest native is the source of truth for volume; GA4
proves quality.
**Why this is non-negotiable:** the client will open GA4. If they find the gap
before we explain it, we look either incompetent or dishonest. Explaining it
first turns a weakness into evidence of expertise.
### Section E — What was built this month
The honest answer to *what did you actually do*. Counted, not claimed:
- Keywords researched and volume-validated this month
- Boards created, with names
- Pins designed and published
- URLs activated and why each was chosen
- Competitors analysed, with pin volume reviewed
Presented as a compact set of figures with an expandable list behind each. The
keyword list in particular should be browsable — it is the most tangible proof of
craft the client will ever see, and it cost the most hours.
### Section F — Strategy assets
Read-only views of the deliverables that were built once and keep paying:
- **Board architecture** — every board with its topic, keyword focus and pin count
- **The keyword bank** — validated terms with volume, grouped by cluster
- **Taste graph** — the three angles, three worlds, three moments
- **Content calendar** — seasonal windows, when we publish for which peak
These make the €100k method visible. A client who scrolls this section
understands they are not paying someone to post pictures.
### Section G — What worked, and why
The feedback loop, made visual:
- Top pins by outbound clicks and by saves, shown as actual images
- Performance by design intent — click-optimised versus save-optimised
- Performance by board type — broad versus niche
- Performance by URL reason — seasonal, new, best performer
Horizontal bars, direct labels, no legends. This section demonstrates that
decisions are being tested rather than repeated, which is the difference between
a service and an activity.
### Section H — Next month
Forward-looking, drawn from P5.3: rising Pinterest trends in the niche, product
categories gaining momentum, which URLs and themes are queued, and business
advice beyond Pinterest — inventory focus, newsletter angles, photography
direction.
**Why:** this is the section that renews the contract. It moves the report from
*what happened* to *what we recommend*, and it is the thing a client cannot get
from a freelancer.
## 1.3 The hard / soft / unseen hierarchy
Enforced visually, not just conceptually.
| Tier | Metrics | Treatment |
|---|---|---|
| **Hard** | Outbound clicks, saves, page visits, add to cart, checkouts, conversions, revenue | Headline size, top of page, always with baseline comparison |
| **Soft** | Impressions, reach, monthly views, engagement, followers | One collapsed block low on the page, labelled *Distribution & reach*, smaller and lower contrast |
| **Leading** | Indexed pins, board coverage, keywords in play, save rate trend | Own section, framed as *foundation being built* |
| **Unseen** | The GA4 attribution gap | Section D, permanent |
The leading-indicator tier exists specifically for months one to four, when hard
numbers are thin. Without it, early reports look empty and clients churn before
the compounding starts. With it, the report shows a foundation being laid — which
is true, and which is what they are actually paying for at that stage.
## 1.4 Provenance — every number is labelled
A number is never shown without its state:
`LIVE` · `NO BASELINE` · `TAG NOT FIRING` · `GA4 NOT CONNECTED` · `PROCESSING` · `PARTIAL MONTH`
Missing renders as `—` with a reason on hover, never as `0`. Percentage changes
are suppressed entirely when the baseline is absent — the "+466%" that appeared
during testing was an artefact of seeded data, and in a client environment that
must be structurally impossible rather than merely unlikely.
---
# PART 2 · INTERNAL — PER STORE
Denser, faster, built for someone holding fifty accounts. Different visual
density from the client view, deliberately.
## 2.1 Store Overview
**Health score** — one composite figure with its components exposed, never a
black box:
| Component | Weight | Source |
|---|---|---|
| Execution | 30% | Pins published vs target, cycles on schedule |
| Foundation | 25% | Board coverage, keyword bank depth, boards above 10 pins |
| Performance | 25% | Clicks and saves versus baseline, cohort-adjusted |
| Account health | 20% | Open leaks, flags, token status, spam signals |
**Cohort context.** The score is meaningless without tenure. A store in month two
is compared against other month-two stores, never against a mature account. Shown
as: *"Month 3 · above cohort median on foundation, below on execution."*
**Leak panel** — ranked by cost, not by recency:
- Boards under 10 pins *(no context for the algorithm)*
- Topics under 5 boards *(blocks phase 4 for that topic)*
- URLs out of cooldown, unused *(idle inventory)*
- High-volume keywords never deployed *(missed reach)*
- Boards inactive 30+ days
- Cycles stalled mid-waterfall
- Tokens expiring within 14 days
- Performance below baseline two consecutive months
Each leak links directly to the task that resolves it. A leak that cannot be
clicked into a fix is a complaint, not a tool.
## 2.2 Phase Progress
The SOP made navigable. Strategy Core (1–3) as a sequential path with completion
per step; Monthly Management (4–5) as recurring cycles.
Per phase: percentage, blocked count, time invested, and the single next action.
## 2.3 The Library
Four sections, each a working surface rather than a list.
**Boards.** Every board with pin count, last activity, topic, URLs pinned there,
and performance. Plus the **coverage matrix** — topics as rows, board count as a
filled bar, with anything under five in red. This is the single most useful
internal view for spotting where phase 4 will jam.
**Keywords.** The bank, filterable by cluster, season, volume, cache age and
**deployment status**. A scatter of volume against usage exposes the biggest
silent waste in the system: validated high-volume terms nobody ever put on a pin.
**URLs.** Cooldown state as a timeline — which URLs are available now, which
return when. Plus waterfalls run, funnel stage, reason and performance. The
manager plans the next cycle from this screen and nowhere else.
**Assets.** Everything captured, linked to the task that produced it.
## 2.4 Cycles
Running waterfalls as calendars, with the design-to-board matrix visible.
Today's publishing queue. Failures surfaced immediately.
## 2.5 Store Analytics — internal depth
Everything the client sees, plus what they should not:
- Attribution by decision — which reasons, keywords, boards and design intents
  produced clicks and saves
- Cost per store: hours from `time_spent_min` against retainer
- Cycle efficiency: pins published versus pins planned
- AI draft edit distance — how much the manager rewrites per surface, which tells
  us where prompts need work
- Cache contribution — lookups this store saved for other stores
---
# PART 3 · INTERNAL — BUSINESS LEVEL
This does not exist today and it is where the margin lives.
## 3.1 Portfolio
Fifty stores, ranked by health, **grouped by cohort**. Comparing a month-two
store to a month-fourteen store produces a ranking that is worse than useless
because it drives attention to the wrong accounts.
- Scatter: tenure on the x-axis, performance versus baseline on the y-axis.
  Outliers below the trend line are the ones that need intervention.
- Distribution of health scores — is the book healthy or carried by three
  accounts?
- Movement: who improved, who declined, month over month.
## 3.2 Execution
The project manager's screen. Are we delivering what we sold?
- Pins published versus committed, per store and in aggregate
- Onboardings in progress, with days elapsed against the one-month norm
- Cycles behind schedule
- Blocked work by cause — waiting on client, waiting on access, waiting on assets
- Team throughput: tasks completed per person per week
That "waiting on client" figure is worth its own visual. In most agencies it is
the largest single cause of delay and nobody measures it.
## 3.3 Capacity & Margin
The most valuable screen in the system, and it is nearly free because
`time_spent_min` is already mandatory on every task.
- Hours per store per month → cost per store → **margin per store**
- Margin against retainer, plotted. Stores below the line are either underpriced
  or badly run, and the difference matters
- Hours by phase: how much does onboarding really cost versus monthly management?
  This is what lets you price the Strategy Core separately, as the SOP author does
- Hours by task type: where the time actually goes, which tells you what to
  automate next — evidence, not intuition
- Capacity: hours committed versus hours available, forecast forward. This
  answers *how many more stores can we take* with a number instead of a feeling
## 3.4 Risk
The churn list, three months early.
- Stores with declining performance and rising hours
- Stores where the client has been unresponsive
- Stores approaching contract renewal with weak numbers
- Accounts with unresolved health flags
## 3.5 Method Intelligence
What only an agency running fifty accounts can know, and what the individual
consultant cannot:
- Which board archetypes perform across clients
- Which URL reasons produce the best return, aggregated
- Optimal daily pin target by account class, measured rather than assumed
- Seasonal windows that actually worked versus the theoretical 6–10 weeks
- Keyword volume decay across the shared cache
This is a compounding asset. In two years it is worth more than the consultancy
that started it, because it is measured on your own book.
---
# PART 4 · AUTOMATION DOCTRINE
The SOP author works almost entirely manually and says so. We automate more, but
only under a strict test.
## 4.1 The test
Automate only if **all three** hold:
1. No judgement is involved — the output is determined by the input
2. A human doing it would be slower *and* no more accurate
3. Failure is detectable — a wrong result is visible, not silent
If any fails, it stays manual. If a case is borderline, it stays manual.
## 4.2 What we automate
**Assembly.** Putting known values where they are needed. The design brief pulls
dominant colours, keywords, brand palette, format and split from six earlier
tasks. Nobody types them twice. This is the largest quality gain in the system
and it removes zero craft.
**Enforcement.** Rules that must never break: three boards per day, pin spacing by
account class, daily volume ceiling, 20/day hard cap, URL and board-URL cooldowns,
character limits, coverage gates. These are database triggers, not reminders.
**Retrieval and counting.** Sitemap parsing, analytics fetching, pin listing,
cooldown calculation, waterfall generation, schedule building.
**Detection.** Pins linking to the homepage, pins without URLs, boards under ten
pins, stale cache entries, expiring tokens. Finding is mechanical; fixing is not.
## 4.3 What stays human
Viability judgement. Competitor selection. Grid interpretation. Keyword relevance.
The librarian test on board architecture. URL selection. Design. Creative
interpretation of what won. Client advice.
Roughly three quarters of all tasks. That is the correct proportion for a service
sold on expertise.
## 4.4 AI drafts — proposal, never decision
Six tasks use AI: market analysis, display name, bio, board descriptions, pin
copy, future insights. All follow the same contract:
- The prompt is assembled from stored data — the manager pastes nothing
- Validators run **before** display; a non-compliant draft is regenerated, not shown
- Both the generated and approved versions are stored
- Edit distance is measured per surface, and a prompt that is heavily rewritten
  every time is a prompt that needs fixing
This is how AI raises the floor without lowering the ceiling.
---
# PART 5 · VISUAL DESIGN
The dashboard has to *feel* like a €5k/month deliverable. That comes from
restraint, not decoration.
## 5.1 What makes software look expensive
Cheap dashboards share the same traits: pure white backgrounds, default chart
palettes, heavy rounded cards with drop shadows, emoji, gradient buttons, every
number the same size, legends everywhere, colour used decoratively.
Expensive interfaces do the opposite. Generous whitespace. Strong typographic
hierarchy — the difference between a headline number and a supporting number is
dramatic, not incremental. Colour used sparingly and meaningfully. Data drawn
with a high data-to-ink ratio. Layouts that read like an editorial page rather
than an admin panel.
The reference points are the Financial Times, Stripe's dashboard and a McKinsey
exhibit — not a SaaS template.
## 5.2 Typography
Two families, used with intent.
**Display** — a high-contrast transitional or modern serif for section headings,
the monthly headline, and large numbers in the client view. Serif is what makes
it read as *report* rather than *tool*, and it is the single highest-leverage
choice in the whole design.
**Interface** — a clean neutral sans for labels, tables, navigation and all
internal views. Tabular figures switched on for anything numeric, so columns align.
Scale is dramatic. Headline figures at 48–64px; supporting figures at 14–16px.
The gap between them is the hierarchy — a client should never have to work out
what matters.
## 5.3 Colour
**Background.** A warm off-white for the client view (near `#FAFAF8`), not pure
white. Pure white reads as unstyled default; a warm paper tone reads as designed.
Internal views may sit on a cooler neutral to signal a different mode.
**Text.** Near-black at high contrast, with a mid-grey for secondary and a light
grey for tertiary. Three levels, no more.
**Brand red (#E30613).** Accent only. Section markers, the active navigation
state, one emphasised data series. Never a background fill, never a large area,
never on more than a few percent of the screen. Red used sparingly reads as
confident; red used everywhere reads as loud.
**Data palette.** Desaturated and deliberate — a deep teal, a warm sand, a muted
clay, a slate. Never default chart colours. Sequential scales for magnitude,
diverging only for above/below baseline. Green and red reserved strictly for
positive and negative movement, so they retain meaning.
## 5.4 Charts
- Thin lines, no fills unless area carries meaning
- No gridlines unless reading exact values matters
- **Direct labelling** at the end of each series instead of a legend
- Baseline always drawn as a reference line, never implied
- Axes start at zero for bars, never for lines showing change
- Annotations on the timeline for events — onboarding complete, first waterfall,
  seasonal push — because a chart with context is analysis and a chart without it
  is decoration
- Every chart answers one question, named in its title. If it needs a paragraph
  to explain, it is the wrong chart
## 5.5 Density
Deliberately different between modes.
**Client view:** generous. Wide margins, large type, one idea per band, vertical
rhythm. It should feel like a document, and it should print or export cleanly to
PDF — because it will be forwarded to someone who was not in the meeting.
**Internal views:** dense. Compact tables, tight rows, keyboard navigation,
filters that persist. Someone managing fifty stores needs information per screen,
not breathing room.
That contrast is itself a design signal: the client view feels considered because
it is not built like the tool behind it.
## 5.6 Navigation
Left sidebar, fixed. The client boundary is explicit — a visual divider and a
label, so nobody ever has to guess what is shareable.
```
PINFORMANCE ORGANIC
Abbey London                    Month 3
─── CLIENT ────────────────────
  Report                        ← the only shared surface
─── WORK ──────────────────────
  Today                    (12)
  Strategy Core
    1 · Onboarding & audit  44/47
    2 · Market research     14/14
    3 · SEO architecture    18/25
  Monthly Management
    4 · Content engine    2 cycles
    5 · Review & reporting
─── LIBRARY ───────────────────
  Boards · Keywords · URLs · Assets
─── ANALYSIS ──────────────────
  Store analytics
  Settings
─── AGENCY ────────────────────
  Portfolio · Execution · Margin · Risk
```
## 5.7 Motion and detail
Transitions under 200ms, easing rather than linear, applied only to state changes.
Charts animate once on load, never on every re-render. Loading states are
skeletons, never spinners. No hover animations on non-interactive elements.
Motion should be almost unnoticeable. Anything the user notices as an animation is
too much.
---
# PART 6 · IMPLEMENTATION ORDER
Sequenced so that each stage is usable on its own.
**Stage 0 — Correctness.** Resolve the data inconsistency between the client list
and the client detail page. Implement provenance states and suppress derived
figures where the baseline is absent. Nothing else ships until a number can be
trusted.
**Stage 1 — Design system.** Typography, colour, spacing, chart library,
components. Applied to one screen as the reference, reviewed, then rolled out.
Doing this after the screens are built means rebuilding them.
**Stage 2 — Client report.** Sections A through H. This is the revenue surface
and the hardest to get right; it should be built while attention is highest.
**Stage 3 — Store internal.** Overview with the leak panel, phase navigation,
library, cycles.
**Stage 4 — Business level.** Portfolio, execution, margin, risk.
**Stage 5 — Method intelligence.** Cross-client aggregation, once enough stores
are running to make it meaningful.
---
# PART 7 · THE STANDARD
Three tests, applied before anything ships.
**The client test.** Would a marketing director at a €10m brand read this report
and conclude they are working with the best agency they have hired? Not *is it
accurate* — accuracy is assumed — but *does it demonstrate expertise they could
not buy elsewhere*.
**The manager test.** Can someone managing fifty stores open this and know within
thirty seconds what needs doing today, without opening fifty pages?
**The owner test.** Can you see, in one screen, which stores make money, which
lose money, and how many more you can take on?
If any of the three fails, the build is not finished.