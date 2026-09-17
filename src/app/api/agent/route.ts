/**
 * GET /api/agent — what this API is, in the answer itself.
 *
 * A connector is configured once by a person and then driven by a model, so
 * the model has to be able to find out what it may ask for and what the
 * numbers mean without anybody pasting documentation into a Slack channel.
 * This route is that: the endpoint list, and the handful of conventions that
 * are load-bearing enough that getting them wrong produces a confident wrong
 * answer rather than an error.
 *
 * The conventions below are the ones that have actually been got wrong here
 * before — amounts converted between currencies, a month bucket judged
 * against a weekly floor, a store count quoted from memory. An agent that
 * reads them cannot make those mistakes on our behalf.
 */
import { NextRequest } from "next/server";
import { requireAgentKey, agentJson } from "@/lib/agent/auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = requireAgentKey(request);
  if (!auth.ok) return auth.response;

  return agentJson({
    api: "pinformance-agent",
    version: 1,
    access: "read-only — every route here exports GET and nothing else",
    endpoints: [
      {
        path: "/api/agent/stores",
        what: "One row per store: fee model, invoice ROAS, break-even ROAS, buyer, department, niche, countries, currency.",
        params: {
          include_inactive: "1 to include offboarded stores (default: active only)",
        },
      },
      {
        path: "/api/agent/zones",
        what: "Red/orange/green per store with the numbers it was decided on: 7-day window, 4 weekly buckets, 3 monthly buckets, month-to-date and the last completed month.",
        params: {
          window: "7 | 14 | 30 (default 7)",
          start: "YYYY-MM-DD — with `end`, switches to one custom period instead of the buckets",
          end: "YYYY-MM-DD — cannot be in the future",
          zone: "red | orange | green — filter",
          buyer: "media buyer's first name, lowercase",
          include_unconfigured: "1 to include stores that have no settings yet",
        },
        note: "Ask for a period with start+end rather than deriving a zone yourself from spend and thresholds — a zone computed elsewhere will disagree with the dashboard and nobody will be able to say which is right.",
      },
      {
        path: "/api/agent/benchmarks",
        what: "Per niche, per country and per store against its own history — the Benchmarks page's cohort and maths.",
        params: { window: "7 | 14 | 30 (default 7)" },
        note: "A cohort under `min_stores_for_a_benchmark` is not a benchmark. Say 'too few stores to compare' instead of quoting the average.",
      },
      {
        path: "/api/agent/critical",
        what: "Auto-flagged exceptions (red streak, spend drop, ROAS crash, stale account) and stores that flipped zone versus the previous window.",
        params: { window: "7 | 14 | 30 (default 7)" },
      },
      {
        path: "/api/agent/team-activity",
        what: "Per store, per rolling 7-day window: campaigns launched and paused, ads paused, budgets changed, active days, boards and pins created. Served from the cache the cron refreshes every 6h; `refreshed_at` says when.",
      },
      {
        path: "/api/agent/organic",
        what: "Per store on the organic method: daily pin target, account class, live/queued boards, pins scheduled, published and failed, running cycles.",
      },
      {
        path: "/api/agent/pinterest/{org_id}/{resource}",
        what: "Read straight from Pinterest on behalf of one store, through the dashboard's own token handling (decrypt + refresh). Whitelisted read resources only.",
        resources: [
          "account", "ad-accounts", "boards", "board-pins", "pins", "pin",
          "top-pins", "user-analytics", "ad-account-analytics",
          "campaigns", "campaign-analytics", "ad-groups", "ads", "ad-analytics",
        ],
        note: "GET /api/agent/pinterest/{org_id} lists the resources with their parameters.",
      },
    ],
    conventions: [
      "AMOUNTS ARE NEVER CONVERTED. Spend and revenue stay in the currency of the store's Pinterest ad account (the `currency` field). Do not add up two stores in different currencies, and do not translate an amount into euros.",
      "THRESHOLDS ARE THE THINGS THAT MOVE. Every zone threshold is configured in euros and converted into the store's currency at the latest ECB rate. `scale_target` is already in the store's currency; `scale_target_eur` is what it was derived from.",
      "GREEN NEEDS ROAS *AND* SCALE. A store above its invoice ROAS on €400 of revenue is not green. The floor depends on the period: weekly buckets use the weekly floor, calendar-month buckets use the monthly one (€20,000 revenue for a revenue-fee store, €7,500 spend for a spend-fee store), and the month in progress is pro-rated.",
      "A DAY WITH NO SNAPSHOT IS A DAY WITH NO ACTIVITY, not missing data. Pinterest omits zero-activity days.",
      "NEVER QUOTE A STORE COUNT FROM MEMORY. Stores are onboarded and offboarded continuously; count what /api/agent/stores returns today.",
      "A NULL IS NOT A ZERO. A figure that could not be measured comes back as null and must be reported as unknown, never as 0.",
      "The snapshot crons run every 6 hours, so paid figures for today are partial by design. `measured_through` and `refreshed_at` say how fresh a number is.",
    ],
  });
}
