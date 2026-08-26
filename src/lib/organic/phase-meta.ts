/**
 * Per-phase and per-step operator context: what this phase is for, who
 * normally does it, and what "done" looks like. Rendered above the task
 * list so a manager who opens a phase cold knows where they are without
 * reading the SOP.
 */

export type Owner = "MANAGER" | "AI_THEN_MANAGER" | "CLIENT" | "SYSTEM";

export interface StepMeta {
  title: string;
  what: string;      // what happens in this step
  where: string;     // where the work physically takes place
  owner: Owner;
  output: string;    // what should exist when the step is done
}

export interface PhaseMeta {
  title: string;
  subtitle: string;
  goal: string;
  gate: string | null;   // what blocks the next phase
  steps: Record<string, StepMeta>;
}

export const OWNER_LABEL: Record<Owner, string> = {
  MANAGER: "Media buyer",
  AI_THEN_MANAGER: "AI drafts → media buyer approves",
  CLIENT: "Client delivers",
  SYSTEM: "Automatic",
};

export const PHASE_META: Record<number, PhaseMeta> = {
  1: {
    title: "Phase 1 — Onboarding & audit",
    subtitle: "Size up what this account can carry, collect access, and audit what already exists.",
    goal: "End state: the account's potential assessed and written down, every access granted, and the existing Pinterest account fully audited so nothing is built on a broken foundation.",
    gate: "P1.0.4 (account potential) gates every other task in phase 1. Nothing else unblocks until it is recorded.",
    steps: {
      "0": {
        title: "Step 1.0 · Potential assessment",
        what: "Score the account against three good-fit signals and two red flags, count how many URLs their sitemap yields versus how many the frequency plan needs, then record how much potential it has.",
        where: "In this dashboard. The URL count is automatic — paste the domain and the system reads their sitemap.",
        owner: "MANAGER",
        output: "HIGH POTENTIAL / AVERAGE / CHALLENGING with written reasoning, in organic.client_viability.",
      },
      "1": {
        title: "Step 1.1 · Intake & access",
        what: "Send the onboarding questionnaire, then collect every access the work depends on: Pinterest, GA4, Search Console, CMS, brand book, content drive, product feed.",
        where: "Questionnaire goes to the client by email. Access requests happen inside each platform. Everything is recorded on the Intake form in this dashboard.",
        owner: "CLIENT",
        output: "Filled organic.client_intake + organic.client_access rows, and every collected document link stored under Assets.",
      },
      "2": {
        title: "Step 1.2 · Account audit",
        what: "Check whether the domain is blocked, whether pins are flagged, whether boards are structured correctly, whether Rich Pins fire, and capture the analytics baseline over the last three months.",
        where: "flaggedpins.com tools for the block and flag checks, Pinterest Analytics for the baseline, this dashboard for recording results.",
        owner: "MANAGER",
        output: "Every audit task closed with notes, and thirteen baseline KPIs captured for later comparison.",
      },
      "3": {
        title: "Step 1.3 · Technical setup",
        what: "Business account, claimed domain, Pinterest tag, catalogue connection, shopping recommendations off, site speed, image filenames, meta descriptions, save buttons, mobile experience, and the content bank audit.",
        where: "Pinterest settings, the client's CMS, and this dashboard for recording.",
        owner: "MANAGER",
        output: "A technically clean account with the content bank counted per funnel stage.",
      },
    },
  },
  2: {
    title: "Phase 2 — Research",
    subtitle: "Read the market before touching the account: what Pinterest rewards, who the competitors are, what the brand actually stands for.",
    goal: "End state: grid analysis per seed keyword, five to ten competitors mapped with their velocity, an AI market analysis reviewed, a taste graph distilled to three angles / three worlds / three moments, and a computed posting frequency.",
    gate: "Phase 2 needs P1.3.14 (content bank audit) done. Phase 3 needs P2.3.3 (three angles) done.",
    steps: {
      "1": {
        title: "Step 2.1 · Grid & competitors",
        what: "Pick five to ten seed keywords, search each one incognito, record what format dominates and how page one feels, extract the three dominant hex codes, then identify five to ten real competitors and export their pins.",
        where: "Pinterest search in an incognito window (or PinClicks to avoid personalisation). PinInspector for the competitor exports. Recording happens here.",
        owner: "MANAGER",
        output: "One grid record per keyword with format + CTA + overlay bucket + colours, plus competitor rows with their pin exports imported.",
      },
      "2": {
        title: "Step 2.2 · AI market analysis",
        what: "The system assembles a prompt from the intake, brand data, grid analyses and competitor exports, and returns a Steal List, a Board Gap list and content angles. You approve or reject each item individually.",
        where: "In this dashboard. Nothing to paste — the prompt builds itself from what is already stored.",
        owner: "AI_THEN_MANAGER",
        output: "Approved Steal List and Board Gap items mirrored into board opportunities for phase 3.",
      },
      "3": {
        title: "Step 2.3 · Taste graph",
        what: "Map seven fields (products, spaces, aesthetics, moments, functional outcome, aspirational outcome, related interests), read Audience Insights, then distil exactly three content angles, three visual worlds and three key moments.",
        where: "This dashboard, with Pinterest Audience Insights open alongside.",
        owner: "MANAGER",
        output: "A taste graph row and the three-by-three distillation that feeds board names and image prompts later.",
      },
      "4": {
        title: "Step 2.4 · Frequency",
        what: "Record how many pins per day the top competitors publish over four months, then let the system compute how many URLs per month the plan needs using the sixteen-pin math.",
        where: "Competitor velocity is counted manually from their profiles. The URL requirement is computed here.",
        owner: "MANAGER",
        output: "Competitor velocity per profile and a stored urls_per_month value on client settings.",
      },
    },
  },
  3: {
    title: "Phase 3 — Keywords & boards",
    subtitle: "Build the keyword bank against a shared volume cache, then design the board architecture the account will live in.",
    goal: "End state: a classified keyword bank with real volumes, an optimised profile, and twenty to thirty boards created with descriptions and coverage of at least five boards per topic.",
    gate: "Board coverage (five boards per topic) gates phase 4. A topic under five boards blocks URL selection for that topic.",
    steps: {
      "1": {
        title: "Step 3.1 · Keyword harvest & classification",
        what: "Collect candidates from four sources, deduplicate them against the shared volume cache, work the remaining misses through PinClicks, then classify: parent interests, generic keywords, topic clusters, seasonal type and publishing windows.",
        where: "Pinterest search bar and bubbles, the interest taxonomy in this dashboard, competitor annotations, and a PinClicks session for the volume lookups.",
        owner: "MANAGER",
        output: "A classified keyword bank where every term has a cached volume, a type and a seasonal classification.",
      },
      "2": {
        title: "Step 3.2 · Profile optimisation",
        what: "Write a display name under sixty-five characters containing a keyword with real volume, a bio under five hundred characters weaving in around five keywords with a CTA, and check the profile photo and cover on both desktop and mobile.",
        where: "AI drafts here, you edit and approve, then apply in Pinterest settings.",
        owner: "AI_THEN_MANAGER",
        output: "An approved display name and bio stored here and applied on Pinterest.",
      },
      "3": {
        title: "Step 3.3 · Board architecture",
        what: "Finalise twenty to thirty boards mapped to parent-interest topics, check coverage, write four-hundred-to-four-eighty character descriptions, schedule creation at maximum three boards per day, create them as protected, seed ten to fifteen pins each, and flip to public at ten pins.",
        where: "Planning here. Board creation and seeding run through the Pinterest API from this dashboard.",
        owner: "AI_THEN_MANAGER",
        output: "Twenty to thirty live boards with descriptions, every topic covered by at least five boards.",
      },
    },
  },
  4: {
    title: "Phase 4 — Production cycles",
    subtitle: "The recurring engine. One URL becomes sixteen pins across four designs and four boards, running as a rolling chain.",
    goal: "End state per cycle: a URL selected with a reason, keywords and boards assigned, four designs with four fresh copies each, validated copy, and a sixteen-pin waterfall scheduled and pushed.",
    gate: "Every cycle needs topic coverage from phase 3. The grid analysis for the cycle must be recorded before the design brief unlocks.",
    steps: {
      "1": {
        title: "Step 4.1 · URL selection",
        what: "Pick a URL from the candidates the system surfaces (cooldown and coverage already filtered), record why it matters from the fixed list, assign at most five keywords and at least five semantically relevant boards.",
        where: "The Cycles tab in this dashboard.",
        owner: "MANAGER",
        output: "A URL with a reason, keywords and boards attached, ready for design.",
      },
      "2": {
        title: "Step 4.2 · Design & copy",
        what: "Record the grid analysis for this cycle, generate the design brief, create four visually distinct designs plus three micro-crops each, run design QC, generate copy per design, and pass the hard validators.",
        where: "Design work happens in Canva or your design tool. Brief, QC and copy validation happen here.",
        owner: "AI_THEN_MANAGER",
        output: "Sixteen approved assets and four validated copy sets, one per design.",
      },
      "3": {
        title: "Step 4.3 · Waterfall",
        what: "Generate the sixteen-pin waterfall with board rotation and interval, then review the calendar before anything is scheduled.",
        where: "The Cycles tab. The system computes rotation and dates; you approve the calendar.",
        owner: "SYSTEM",
        output: "Sixteen pins scheduled with the correct rotation, spacing and board spread.",
      },
      "4": {
        title: "Step 4.4 · Publishing",
        what: "Push the schedule to Pinterest and monitor publication for failures, rate limits and expired tokens.",
        where: "Automatic through the Pinterest API. Failures surface on the Overview leak panel.",
        owner: "SYSTEM",
        output: "Pins live on Pinterest with no silent failures.",
      },
    },
  },
  5: {
    title: "Phase 5 — Analytics & feedback loop",
    subtitle: "Attribute performance back to the decisions that produced it, so the next cycle is better than the last.",
    goal: "End state each month: KPIs pulled and compared to baseline, winners identified and traced back to reason, keyword and board type, and the design brief updated with what actually worked.",
    gate: null,
    steps: {
      "1": {
        title: "Step 5.1 · Data collection",
        what: "Pull Pinterest analytics and GA4, explain the attribution gap between them, and update the reporting dashboard.",
        where: "Pinterest Analytics, GA4, Looker Studio. Recorded here.",
        owner: "MANAGER",
        output: "A reconciled monthly dataset with the attribution gap explained in writing.",
      },
      "2": {
        title: "Step 5.2 · Winner analysis",
        what: "Identify the winning pins, analyse which combination of design, copy, keyword and board produced them, and feed the pattern back into the design brief.",
        where: "The Analytics tab in this dashboard.",
        owner: "MANAGER",
        output: "An updated design brief and a list of winners flagged for the paid team.",
      },
      "3": {
        title: "Step 5.3 · Trends & roadmap",
        what: "Check Pinterest Trends and Shopping Trends for the niche, translate them into forward-looking insights, and write next month's roadmap.",
        where: "Pinterest Trends, then this dashboard.",
        owner: "MANAGER",
        output: "A written roadmap the client receives with the monthly report.",
      },
      "4": {
        title: "Step 5.4 · Organic to paid handover",
        what: "Export engagement and site-visitor audiences over thirty, sixty and ninety day windows and hand them to the paid team as retargeting seeds.",
        where: "Pinterest Audience Insights, then shared with the paid team.",
        owner: "MANAGER",
        output: "Six audiences handed over. Winners are recreated as new assets in Ads Manager, never boosted.",
      },
      "5": {
        title: "Step 5.5 · Strategy review",
        what: "Every six months, review the entire keyword bank, board architecture and competitor set, and write a strategy delta.",
        where: "This dashboard, across the Keywords, Boards and URLs tabs.",
        owner: "MANAGER",
        output: "A written strategy delta sent to the client.",
      },
    },
  },
};

export function phaseMeta(phase: number): PhaseMeta | null {
  return PHASE_META[phase] ?? null;
}
export function stepMeta(phase: number, step: string): StepMeta | null {
  return PHASE_META[phase]?.steps[step] ?? null;
}
