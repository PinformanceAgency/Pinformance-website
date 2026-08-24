/**
 * What each task actually asks you, item by item.
 *
 * A checklist that says "Visual product" and gives you a tick box is not a
 * question, it is a label. Two people tick it for different reasons and
 * neither reason survives. Every field here therefore carries four things:
 *
 *   question  what is being asked, as a question
 *   why       why it decides anything — the reason the item exists
 *   how       where to look and what counts as a yes
 *   evidence  the prompt for the reasoning, which is stored alongside
 *             the answer in organic.task_answers
 *
 * The prose lives here rather than in the database because it is edited
 * far more often than the data model and belongs somewhere that shows up
 * in a diff.
 *
 * Tasks with no entry fall back to GENERIC_FIELDS, so all 116 get a
 * structured form rather than an empty box.
 */

export type FieldKind = "boolean" | "number" | "text" | "longtext" | "choice";

export interface TaskField {
  key: string;
  question: string;
  why: string;
  how: string;
  kind: FieldKind;
  /** For `choice`. */
  options?: string[];
  /** Placeholder for the evidence box. Always a real example, never
   *  "enter text here" — a blank prompt gets a blank answer. */
  evidence: string;
  /** Evidence is expected on every field, but on a few it is the entire
   *  point and the form says so. */
  evidenceRequired?: boolean;
  /** Units shown after a number input. */
  unit?: string;
}

export interface TaskFieldSet {
  /** One line above the fields: what finishing this task means. */
  intro: string;
  /** How the answers add up to a decision. */
  scoring?: string;
  fields: TaskField[];
}

/* ------------------------------------------------------------------ *
 * PHASE 1 · Viability gate
 * ------------------------------------------------------------------ */

const GOOD_FIT: TaskFieldSet = {
  intro:
    "Six signals that a store will work on Pinterest. Answer each one and say what you saw — " +
    "the answer is the score, the reasoning is what makes it checkable six months from now.",
  scoring:
    "Four or more yes is a strong fit. Two or three is workable if the red-flag check is clean. " +
    "Under two, Pinterest is the wrong channel and saying so now is cheaper than saying it in month four.",
  fields: [
    {
      key: "visual_first",
      question: "Is the product photogenic enough to stop a scroll?",
      why:
        "Pinterest is a visual search engine. A product nobody wants to look at cannot be pinned into " +
        "performing, no matter how good the keywords are.",
      how:
        "Open the shop's product photography and their Instagram. Ask whether a single image, with no " +
        "brand context, would make someone stop. Lifestyle and in-situ shots count for far more than " +
        "cut-outs on white.",
      kind: "boolean",
      evidence:
        "e.g. \"Studio shots on white only, but 40+ lifestyle images on Instagram we can reuse. Jewellery on models, good light.\"",
      evidenceRequired: true,
    },
    {
      key: "more_than_5_products",
      question: "Are there more than five distinct products or ideas to pin?",
      why:
        "The engine needs variety. One product becomes the same pin sixteen times, which Pinterest reads " +
        "as repetition and suppresses.",
      how:
        "Count genuinely distinct items or angles, not colourways of one thing. Collections, guides and " +
        "editorial pages count.",
      kind: "boolean",
      evidence: "e.g. \"Six collections, ~40 SKUs, plus a journal with 12 posts we can pin as ideas.\"",
      evidenceRequired: true,
    },
    {
      key: "url_volume",
      question: "Does the site have enough distinct URLs to keep a waterfall fed?",
      why:
        "Each cycle needs its own URL, and a URL rests for a cooldown period after it runs. Too few pages " +
        "and the same page comes back before its cooldown clears, competing with its own pins.",
      how:
        "Target is more than twenty usable URLs. P1.0.3 counts them from the sitemap automatically — " +
        "answer this on whether that count clears the bar for the planned frequency.",
      kind: "boolean",
      evidence: "e.g. \"Sitemap gives 34 usable URLs: 6 collections, 24 products, 4 guides. Comfortable at 2 URLs/month.\"",
      evidenceRequired: true,
    },
    {
      key: "high_aov",
      question: "Is the average order value high enough to be worth the work?",
      why:
        "Organic Pinterest is a months-long compounding play. On a €15 average order it takes volume we " +
        "will not reach; the same effort on a €90 order pays for the retainer.",
      how: "Ask the client, or estimate from the catalogue. Note the number, not just the judgement.",
      kind: "boolean",
      evidence: "e.g. \"Client says AOV is €85. Catalogue midpoint ~€70, so plausible.\"",
      evidenceRequired: true,
    },
    {
      key: "existing_assets",
      question: "Do usable visual assets already exist?",
      why:
        "If every pin needs shooting from scratch, the first cycle slips by weeks and the cost per cycle " +
        "changes the commercials entirely.",
      how:
        "Check their Instagram, existing campaign shoots, any brand asset drive. Enough for four designs " +
        "per URL is the practical bar.",
      kind: "boolean",
      evidence: "e.g. \"Drive folder with two 2025 shoots, ~200 images, model and flat-lay. Plenty for four designs.\"",
      evidenceRequired: true,
    },
    {
      key: "longterm_mindset",
      question: "Does the client understand this takes three to six months?",
      why:
        "The single strongest predictor of churn. A client expecting results in week three will cancel in " +
        "month two, right before the compounding starts — and this is the one signal you can only get by asking.",
      how:
        "Ask directly on the intake call: \"what would make you consider this a failure after two months?\" " +
        "The answer tells you more than the pitch did.",
      kind: "boolean",
      evidence: "e.g. \"Said they expect Pinterest to be slow, ran SEO before and understands compounding. Low risk.\"",
      evidenceRequired: true,
    },
  ],
};

const RED_FLAGS: TaskFieldSet = {
  intro:
    "Six things that hold a store back regardless of how good the fit looked. Flag what is true and say " +
    "what you saw — one flag is survivable, several together is a no.",
  scoring:
    "Zero or one flag: proceed. Two: proceed only with the mitigation written down. Three or more: decline, " +
    "and the reasoning below is what you send the client.",
  fields: [
    {
      key: "rf_technical_b2b",
      question: "Is this technical B2B?",
      why:
        "Pinterest's audience is overwhelmingly consumer and discovery-led. Industrial components and " +
        "enterprise software do not get browsed for pleasure.",
      how: "Look at who actually buys. Selling to procurement is a flag; selling to a consumer who happens to be a professional is not.",
      kind: "boolean",
      evidence: "e.g. \"Consumer jewellery, not B2B. No flag.\"",
    },
    {
      key: "rf_local_only",
      question: "Is it local services only, with no shippable product?",
      why:
        "Pinterest reach is national at minimum. A salon serving one postcode gets impressions from people " +
        "who can never buy, which looks like performance and is not.",
      how: "Check whether they ship, or whether the service is location-bound. A local business with an online shop is not a flag.",
      kind: "boolean",
      evidence: "e.g. \"Ships EU-wide from Amsterdam. No flag.\"",
    },
    {
      key: "rf_single_landing",
      question: "Is the whole site a single landing page?",
      why:
        "One page means one URL, which means the waterfall has nothing to rotate through and every cycle " +
        "competes with the last.",
      how: "Count real, distinct destination pages. Anchors on one page do not count.",
      kind: "boolean",
      evidence: "e.g. \"Full Shopify store, 34 URLs. No flag.\"",
    },
    {
      key: "rf_needs_sales_now",
      question: "Do they need sales this month?",
      why:
        "This is the flag that ends engagements. Organic Pinterest cannot deliver inside a month, and taking " +
        "a client who needs it to is setting up a cancellation you can already see.",
      how:
        "Ask what happens if there is no revenue from this in eight weeks. If the answer involves runway, this " +
        "is a flag no matter how good the product is.",
      kind: "boolean",
      evidence: "e.g. \"Profitable, treating Pinterest as a 2027 channel. No flag.\"",
    },
    {
      key: "rf_low_effort_ds",
      question: "Is this low-effort dropshipping?",
      why:
        "Generic catalogue imagery is already on Pinterest a hundred times over. There is nothing to rank " +
        "with, and the account picks up spam signals from duplicate images.",
      how: "Reverse-image search two or three of their product photos. If the same shot is on twenty other shops, flag it.",
      kind: "boolean",
      evidence: "e.g. \"Own photography, reverse search returns only their domain. No flag.\"",
    },
    {
      key: "rf_restricted_niche",
      question: "Is the niche restricted or sensitive on Pinterest?",
      why:
        "Restricted categories get distribution capped or the account actioned. Finding out after building " +
        "the board architecture wastes the entire Strategy Core.",
      how:
        "Check Pinterest's advertising and community guidelines for the category — supplements, CBD, weapons, " +
        "adult, medical claims, financial advice.",
      kind: "boolean",
      evidence: "e.g. \"Jewellery, no restricted categories. No flag.\"",
    },
  ],
};

const URL_COUNT: TaskFieldSet = {
  intro:
    "The system reads the sitemap and counts what is there. Record the breakdown so the number can be " +
    "argued with later, because the frequency plan is built on it.",
  scoring:
    "Under 10 usable URLs is a red flag — too few to build a waterfall on. 20 or more is comfortable at " +
    "two cycles a month.",
  fields: [
    {
      key: "total_urls_found",
      question: "How many usable URLs does the sitemap yield?",
      why:
        "This number sets the maximum sustainable cycle frequency. Everything downstream — the daily pin " +
        "target, the cooldown, whether the retainer is deliverable — comes off it.",
      how:
        "The count runs automatically from the domain. Exclude cart, account, policy and tag pages: usable " +
        "means a page a pin can sensibly point at.",
      kind: "number",
      unit: "URLs",
      evidence: "e.g. \"34 total: 6 collections, 24 products, 4 guides. Excluded 11 policy/account pages.\"",
      evidenceRequired: true,
    },
    {
      key: "url_breakdown_note",
      question: "What is the split, and which pages are the strongest candidates?",
      why:
        "Phase 4 selects URLs from this pool every month. Knowing now which pages are seasonal, which are " +
        "evergreen and which are thin saves that decision being made blind later.",
      how: "List the categories and call out anything obviously seasonal or obviously weak.",
      kind: "longtext",
      evidence: "e.g. \"Collections are strongest — bridal and gold hoops evergreen. Christmas gifting is seasonal, hold for Sept. Four product pages are thin, skip.\"",
    },
  ],
};

const VERDICT: TaskFieldSet = {
  intro:
    "The gate. Everything in phase 1 onwards is blocked until this is recorded, because taking on a store " +
    "that should have been declined costs more than the retainer it earns.",
  fields: [
    {
      key: "verdict",
      question: "What is the verdict?",
      why:
        "This is the decision the rest of the engagement rests on, and it is the one thing a future manager " +
        "will want to see reasoned.",
      how:
        "STRONG: four or more good-fit signals, at most one red flag. MODERATE: workable but with a named " +
        "risk. WEAK: decline, or proceed only with the client's expectations reset in writing.",
      kind: "choice",
      options: ["STRONG", "MODERATE", "WEAK"],
      evidence: "e.g. \"5/6 good-fit, 0 red flags, 34 URLs. Only gap is AOV at €85 which is acceptable.\"",
      evidenceRequired: true,
    },
    {
      key: "verdict_risk",
      question: "If this goes wrong, what will have caused it?",
      why:
        "Written now, before anyone is invested, this is the most honest risk assessment the engagement will " +
        "ever get. It is also what the risk screen checks against in month three.",
      how: "One sentence. The most likely failure, not every possible one.",
      kind: "longtext",
      evidence: "e.g. \"Most likely failure is the client losing patience in month two — they said the right things but have never run a slow channel.\"",
      evidenceRequired: true,
    },
  ],
};

/* ------------------------------------------------------------------ *
 * Fallback — every other task still gets a structured form
 * ------------------------------------------------------------------ */

export const GENERIC_FIELDS: TaskFieldSet = {
  intro:
    "Record what you did and what came out of it, so the next person does not have to redo the work to " +
    "find out what happened.",
  fields: [
    {
      key: "what_done",
      question: "What did you do?",
      why: "The step description says what should happen; this says what actually did.",
      how: "One or two sentences. Include the tool you used and anything you had to work around.",
      kind: "longtext",
      evidence: "e.g. \"Ran the export in PinInspector for the top 3 competitors, 1,400 pins total.\"",
    },
    {
      key: "what_found",
      question: "What did you find?",
      why:
        "The finding is the deliverable. A task marked done with no finding is indistinguishable from a task " +
        "nobody did.",
      how: "The numbers, names or observations that came out. Paste links — they are captured into the library automatically.",
      kind: "longtext",
      evidence: "e.g. \"Three angles repeat across all competitors: styling, gifting, care. Gifting is under-served.\"",
    },
    {
      key: "decision",
      question: "What did you decide, or what should happen next?",
      why: "Half of these tasks exist to produce a decision. Leaving it in someone's head is how it gets remade differently later.",
      how: "The call you made, or the open question you are handing on.",
      kind: "longtext",
      evidence: "e.g. \"Building the board architecture around gifting first — it is the widest gap.\"",
    },
  ],
};

/* ------------------------------------------------------------------ */

const BY_TASK: Record<string, TaskFieldSet> = {
  "P1.0.1": GOOD_FIT,
  "P1.0.2": RED_FLAGS,
  "P1.0.3": URL_COUNT,
  "P1.0.4": VERDICT,
};

/** Bespoke fields where they exist, a structured fallback everywhere else. */
export function fieldsFor(taskId: string): TaskFieldSet {
  return BY_TASK[taskId] ?? GENERIC_FIELDS;
}

/** True when the task has hand-written questions rather than the fallback. */
export function hasBespokeFields(taskId: string): boolean {
  return taskId in BY_TASK;
}
