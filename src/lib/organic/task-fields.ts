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
   *  "enter text here" — a blank prompt gets a blank answer.
   *
   *  Omit it entirely and no reasoning box is drawn. That is the whole
   *  difference between a judgement call and a conformance check: "is the
   *  domain claimed" has one right answer and asking for reasoning behind
   *  a yes is busywork that trains people to type "yes" in a box. */
  evidence?: string;
  /** Evidence is expected on every field, but on a few it is the entire
   *  point and the form says so. */
  evidenceRequired?: boolean;
  /** Units shown after a number input. */
  unit?: string;
  /**
   * Show this field only once another answer has gone a certain way.
   *
   * Used for the "so what is wrong, then" box on a conformance checklist:
   * it stays out of the way while everything passes and appears the moment
   * something does not. A field nobody needs to fill in should not be on
   * screen asking to be filled in.
   */
  onlyWhen?: { anyOf: string[]; is: boolean };
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
    "Three signals that a store will work on Pinterest. Answer each one and say what you saw — " +
    "the answer is the score, the reasoning is what makes it checkable six months from now.",
  scoring:
    "All three yes is a strong fit. Two is workable if the red-flag check is clean. " +
    "One or none, Pinterest is the wrong channel and saying so now is cheaper than saying it in month four.",
  fields: [
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
  ],
};

const RED_FLAGS: TaskFieldSet = {
  intro:
    "Two things that hold a store back regardless of how good the fit looked. Flag what is true and say " +
    "what you saw.",
  scoring:
    "Neither flag: proceed. One: proceed only with the mitigation written down. Both: decline, " +
    "and the reasoning below is what you send the client.",
  fields: [
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
        "STRONG: all three good-fit signals and neither red flag. MODERATE: workable but with a named " +
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
 * PHASE 1 · STEP 3 — Technical setup
 *
 * These seventeen tasks are not judgement calls. "Is the domain claimed"
 * has one right answer, and the generic what-did-you-do / what-did-you-find
 * form was making people write three paragraphs to report that a checkmark
 * was where it should be. Nobody does that twice; they mark it done and
 * type nothing, and the audit is worth exactly as much as no audit.
 *
 * So the whole step is a conformance checklist: each condition is yes or
 * no, no reasoning asked while everything passes, and one box that appears
 * the moment something fails — naming what is wrong and what has to
 * happen. The writing is then about the one thing that needs fixing, which
 * is the only part anybody reads later.
 * ------------------------------------------------------------------ */

interface Check {
  key: string;
  question: string;
  why: string;
  how: string;
}

/**
 * A yes/no checklist plus a single conditional "what is wrong" box.
 *
 * The box is `onlyWhen` any check is answered no, so a clean setup is
 * seventeen taps and nothing typed, and a broken one asks for exactly the
 * detail that a fix needs.
 */
function conformance(intro: string, checks: Check[], example: string): TaskFieldSet {
  return {
    intro,
    scoring:
      "Every yes and this is settled — nothing to write. One no and the box at the bottom opens: " +
      "say what is wrong and what has to happen, because that is what the next person needs.",
    fields: [
      ...checks.map((c): TaskField => ({ ...c, kind: "boolean" })),
      {
        key: "not_right",
        question: "What is not right, and what has to happen?",
        why:
          "A failed check on its own is a dead end — the next person sees a red mark and has to redo the " +
          "whole investigation to find out what it meant.",
        how:
          "Name the specific thing that is wrong, who has to fix it (us, the client, their developer), and " +
          "whether anything downstream is blocked until it is.",
        kind: "longtext",
        evidence: example,
        onlyWhen: { anyOf: checks.map((c) => c.key), is: false },
      },
    ],
  };
}

const TECHNICAL_SETUP: Record<string, TaskFieldSet> = {
  "P1.3.1": conformance(
    "Without a business account there is no analytics, no claimed domain and no catalogue. Everything else in this step assumes it.",
    [{
      key: "is_business_account",
      question: "Is this a Pinterest business account?",
      why: "A personal account has no analytics and cannot claim a domain, so the whole of phase 1 step 3 is unavailable on one.",
      how: "A business account shows an Analytics tab and a Business hub. Convert from Settings → Account management → Convert to business.",
    }],
    "e.g. \"Still a personal account. Client has the login; asked them to convert, they said Friday. Blocks the domain claim and the catalogue.\""
  ),

  "P1.3.2": conformance(
    "The domain claim is what ties pins back to the site. Without it analytics are partial and rich pins never work.",
    [
      {
        key: "domain_claimed",
        question: "Does the domain show as claimed, with the checkmark visible?",
        why: "Unclaimed means no attribution on pins others save from the site, and no rich pin data.",
        how: "Settings → Claimed accounts. The domain should show a checkmark, not 'pending'.",
      },
      {
        key: "claim_is_permanent",
        question: "Is the verification tag somewhere a redeploy will not remove it?",
        why: "A tag pasted into a preview theme or a trial app disappears at the next deploy and the claim silently lapses.",
        how: "Check it is in the live theme's head or a permanent CMS setting, not in an app that could be uninstalled.",
      },
    ],
    "e.g. \"Claim shows pending — meta tag went into the preview theme, not the live one. Their developer has to move it before we can continue.\""
  ),

  "P1.3.3": conformance(
    "The tag is what makes organic Pinterest measurable and what feeds the retargeting audiences later.",
    [
      {
        key: "tag_base_present",
        question: "Is the base code present on every page?",
        why: "A tag on the homepage only measures nothing that matters — the conversions all happen deeper in the funnel.",
        how: "Pinterest Tag Helper, or view source on a product and a checkout page.",
      },
      {
        key: "tag_events_fire",
        question: "Do PageVisit, AddToCart and Checkout all fire?",
        why: "Checkout is the event every downstream number is built on. A tag that only fires PageVisit reports traffic and no revenue.",
        how: "Run a test purchase with Tag Helper open and watch all three fire in order.",
      },
    ],
    "e.g. \"Base code is on every page but Checkout does not fire — their theme uses a custom thank-you page. Their developer has to add it.\""
  ),

  "P1.3.4": conformance(
    "The catalogue is what turns URLs into product pins that carry price and stock automatically.",
    [
      {
        key: "catalog_connected",
        question: "Is the product feed connected and ingesting?",
        why: "Without it every product pin has to be built by hand and none of them carry price.",
        how: "Ads → Catalogues, or the Shopify app. Status should be 'active', not 'processing' or 'failed'.",
      },
      {
        key: "catalog_clean",
        question: "Does the ingested product count match the shop, with no feed errors?",
        why: "A feed that ingests 40 of 300 products looks connected and quietly excludes most of the catalogue.",
        how: "Compare the ingested count against the shop's product count and read the error report.",
      },
    ],
    "e.g. \"Feed connected but 120 of 300 products rejected — missing GTIN. Client's ops person is filling them in.\""
  ),

  "P1.3.5": conformance(
    "A private profile is invisible to Pinterest search, which is the entire channel.",
    [{
      key: "profile_public",
      question: "Is the profile public and visible to search engines?",
      why: "'Hide from search engines' is on by default on some accounts and silently caps distribution to nothing.",
      how: "Settings → Privacy and data → the search-engine visibility toggle must be off.",
    }],
    "e.g. \"'Hide from search engines' was on. Turned it off ourselves — client had never seen the setting.\""
  ),

  "P1.3.6": conformance(
    "Shopping recommendations put competitors next to your pin and take the click you paid to earn.",
    [{
      key: "shopping_recs_off",
      question: "Are shopping recommendations turned off?",
      why: "Left on, Pinterest shows similar products from other shops directly under the pin.",
      how: "Settings → Social permissions → shopping recommendations.",
    }],
    "e.g. \"Setting is not available on their account type yet — revisit after the business conversion.\""
  ),

  "P1.3.7": conformance(
    "An inbox nobody reads is worse than no inbox: it is a visible unanswered message on a brand profile.",
    [{
      key: "messages_setting_right",
      question: "Does the messages setting match whether the client actually monitors it?",
      why: "Unanswered messages sit publicly on the profile and read as an abandoned account.",
      how: "Ask who reads the Pinterest inbox. If the honest answer is nobody, turn messages off.",
    }],
    "e.g. \"Client wants messages on and says their service desk will cover it. Left on, noted to check in month two.\""
  ),

  "P1.3.8": conformance(
    "Pinterest judges the destination, not just the pin. A slow page suppresses outbound clicks on everything pointing at it.",
    [
      {
        key: "speed_acceptable",
        question: "Is mobile load time acceptable on the pages we will be pinning?",
        why: "Outbound clicks are the ranking signal, and they are lost while a page is still loading.",
        how: "PageSpeed Insights on two or three of the URLs from the pool, mobile tab. Under three seconds to largest paint.",
      },
      {
        key: "no_obvious_blocker",
        question: "Is there no single obvious blocker?",
        why: "Most slow shops are slow for one fixable reason, and naming it is worth more than the score.",
        how: "Look for uncompressed hero images, render-blocking app scripts, a bloated theme.",
      },
    ],
    "e.g. \"LCP 6.1s on mobile — a 4MB uncompressed hero on every collection page. One fix, big win. Flagged to their developer.\""
  ),

  "P1.3.9": conformance(
    "Pinterest reads the URL itself. Existing slugs stay as they are — changing them breaks Google — but new pages can be better.",
    [
      {
        key: "slugs_readable",
        question: "Are the existing slugs readable and keyword-bearing?",
        why: "A slug like /products/12345 tells Pinterest nothing about what the page is.",
        how: "Look at the URL pool from P1.0.3. Words, not IDs.",
      },
      {
        key: "slug_advice_recorded",
        question: "Has the convention for new pages been agreed with the client?",
        why: "This is advice, not a change we make. Unrecorded advice is advice nobody follows.",
        how: "Write the rule down and confirm it with whoever creates new pages.",
      },
    ],
    "e.g. \"Product slugs are numeric IDs. Not changing them — Google would break. Agreed a words-based convention for new pages from September.\""
  ),

  "P1.3.10": conformance(
    "Pinterest runs OCR and reads file names. IMG_8492.jpg says nothing; modern-vanity-lighting.jpg says what the picture is.",
    [
      {
        key: "filenames_descriptive",
        question: "Are the image file names descriptive rather than camera defaults?",
        why: "File names are one of the few text signals on an image-first platform.",
        how: "Inspect a handful of product images on the live site and read the src.",
      },
      {
        key: "filename_convention_agreed",
        question: "Is a naming convention agreed for everything uploaded from now on?",
        why: "Renaming the back catalogue is rarely worth it; getting new uploads right always is.",
        how: "Agree the pattern with whoever uploads images and record it here.",
      },
    ],
    "e.g. \"All uploads are IMG_xxxx. Not renaming 600 existing images. Agreed product-material-colour.jpg for new ones with their content person.\""
  ),

  "P1.3.11": conformance(
    "Pinterest scans the landing page's summary text. Keywords there help the pin that points at it.",
    [
      {
        key: "meta_present",
        question: "Does every URL in the pool have a meta description?",
        why: "A missing description leaves Pinterest to guess the page's subject from the body copy.",
        how: "Crawl the URL pool, or spot-check the collections and top products.",
      },
      {
        key: "meta_keyworded",
        question: "Do those descriptions carry the keywords we will be targeting?",
        why: "A generic brand boilerplate on every page gives Pinterest the same signal for every URL.",
        how: "Compare the descriptions against the keyword direction from phase 2.",
      },
    ],
    "e.g. \"Collections have them, 18 product pages do not. Client's copywriter is filling those in, keyword list handed over.\""
  ),

  "P1.3.12": conformance(
    "A pin a visitor saves themselves ranks faster than one we publish. The save button is what makes that possible.",
    [{
      key: "save_button_present",
      question: "Is there a working Pinterest save button on product and content pages?",
      why: "Saves from real visitors are the strongest early distribution signal an account can get.",
      how: "Hover a product image on the live site. If there is no button, recommend a plugin or the widget builder.",
    }],
    "e.g. \"No button anywhere. Recommended the official widget; their developer has it scheduled for next sprint.\""
  ),

  "P1.3.13": conformance(
    "More than eight in ten Pinterest sessions are mobile. The desktop site is not the one that matters.",
    [
      {
        key: "mobile_browse_ok",
        question: "Do loading and scrolling hold up on a real phone?",
        why: "Emulators hide the things that actually lose the click — janky scroll, popups that cannot be dismissed.",
        how: "Open the site on your own phone on mobile data, not office wifi.",
      },
      {
        key: "mobile_checkout_ok",
        question: "Can you complete a purchase end to end on mobile?",
        why: "If checkout breaks on a phone, every click we send is wasted and nothing in the reporting will show why.",
        how: "Go all the way to the payment step on your phone.",
      },
    ],
    "e.g. \"Browsing is fine, but the cookie banner cannot be dismissed on iOS Safari and covers the buy button. Blocker — reported to the client.\""
  ),

  "P1.3.14": conformance(
    "The content bank sets the achievable frequency. Two URLs per funnel stage is the floor a waterfall can run on.",
    [
      {
        key: "stage_top_ok",
        question: "Are there at least two URLs for inspiration (top of funnel)?",
        why: "Top-of-funnel pages are what earn reach. Without them the account only ever talks to people already looking to buy.",
        how: "Count guides, editorial, lookbooks and inspiration collections in the URL pool.",
      },
      {
        key: "stage_middle_ok",
        question: "At least two for consideration (middle)?",
        why: "The middle is where saves turn into visits. Skipping it makes the funnel a cliff.",
        how: "Count comparison pages, collections, category pages with real copy.",
      },
      {
        key: "stage_bottom_ok",
        question: "At least two for conversion (bottom)?",
        why: "Without bottom-of-funnel URLs the cycles produce traffic that never has anywhere to convert.",
        how: "Count product pages strong enough to be a pin destination on their own.",
      },
    ],
    "e.g. \"Top and bottom are fine. Nothing in the middle — no category copy at all. Caps us at one cycle a month until they write some.\""
  ),

  "P1.3.15": conformance(
    "Claimed social accounts unlock the catalogue and rich pins. One of these settings actively causes harm if left wrong.",
    [
      {
        key: "shopify_claimed",
        question: "Is the shop connected under claimed accounts?",
        why: "The Shopify claim is what unlocks the catalogue and rich pins. Without it product pins never carry a price.",
        how: "Settings → Claimed accounts.",
      },
      {
        key: "instagram_claimed",
        question: "Is Instagram connected?",
        why: "It attributes saves of their Instagram content back to the Pinterest profile.",
        how: "Settings → Claimed accounts.",
      },
      {
        key: "ig_autopublish_off",
        question: "Is Instagram auto-publish switched OFF?",
        why: "This one matters more than the other two. Auto-reposted Instagram content gets flagged as spam and the whole account carries the penalty.",
        how: "On the Instagram claim, the auto-publish toggle must be off. Check it even if someone says it already is.",
      },
    ],
    "e.g. \"Instagram claimed with auto-publish ON — turned it off immediately. Shopify not claimed yet, waiting on the client's admin access.\""
  ),

  "P1.3.16": conformance(
    "Pins that already have impressions are the highest-return edits available — the distribution exists, only the destination is missing.",
    [
      {
        key: "impression_pins_linked",
        question: "Do the pins with impressions but no destination URL now have the correct link?",
        why: "These are impressions already being earned and thrown away. Nothing else in phase 1 pays back this fast.",
        how: "Filter existing pins by impressions with an empty link, and add the right URL to each.",
      },
      {
        key: "generic_copy_fixed",
        question: "Has generic copy on the high-impression pins been rewritten?",
        why: "A pin titled with the file name ranks for nothing, however many impressions it happens to have.",
        how: "Work down the boards by impressions and rewrite titles and descriptions with real keywords.",
      },
      {
        key: "edit_cap_respected",
        question: "Did you stay under the daily edit cap?",
        why: "Above 150 pin edits in a day Pinterest rate-limits the whole account, which costs more than the edits gained.",
        how: "Ten to twenty a day is the working pace. 150 is the hard platform limit — do not go near it.",
      },
    ],
    "e.g. \"41 pins had impressions and no link, fixed 18 today and the rest tomorrow to stay under the cap.\""
  ),

  "P1.3.17": conformance(
    "Verified Merchant unlocks product tagging, catalogue boosts and the shop tab. It is a review, so it is applied for once the prerequisites are actually met.",
    [
      {
        key: "vm_requirements_met",
        question: "Are all the prerequisites met — business account, claimed domain, active catalogue, no policy violations?",
        why: "Applying before these are in place gets a rejection, and a rejected account waits before it can reapply.",
        how: "Walk back through P1.3.1, P1.3.2 and P1.3.4. All three have to be green first.",
      },
      {
        key: "vm_applied",
        question: "Has the application been submitted, or is the badge already granted?",
        why: "This is the only task in the step whose outcome we do not control, so the date it went in is what gets tracked.",
        how: "Settings → Verified Merchant. Note the submission date; some verticals get an extra review round.",
      },
    ],
    "e.g. \"Catalogue is still rejecting products so we have not applied — applying now would burn the attempt. Revisit once the feed is clean.\""
  ),
};

/* ------------------------------------------------------------------ */

const BY_TASK: Record<string, TaskFieldSet> = {
  "P1.0.1": GOOD_FIT,
  "P1.0.2": RED_FLAGS,
  "P1.0.3": URL_COUNT,
  "P1.0.4": VERDICT,
  ...TECHNICAL_SETUP,
};

/**
 * The written questions for a task, or null when it has none.
 *
 * Null is the common case and it is deliberate. What used to stand here
 * was a three-question fallback — what did you do, what did you find,
 * what did you decide — rendered on all ninety-odd tasks that had no
 * hand-written set. It was the wrong shape twice over.
 *
 * It asked about the process when the task has an output. "Send
 * onboarding questionnaire" wants the returned questionnaire. "Collect
 * brand book" wants the brand book. Splitting that into three narrative
 * boxes turns a two-minute job into an essay, and an essay nobody writes
 * is worse than a blank: it makes a completed task look abandoned.
 *
 * And it duplicated the work panel that already sits under every task —
 * free text plus attachments, always on screen. Two places to type, one
 * of which fed nothing downstream.
 *
 * So questions are written where they earn their place (the viability
 * gate, the technical-setup checks) and everywhere else the task states
 * what it expects back and the work panel takes it.
 */
export function fieldsFor(taskId: string): TaskFieldSet | null {
  return BY_TASK[taskId] ?? null;
}

/**
 * The fields actually on screen, given what has been answered so far.
 *
 * Conditional fields are filtered out until their trigger fires. The
 * progress count has to run off this rather than off `set.fields`, or a
 * clean conformance check reads 3 of 4 forever and looks unfinished when
 * it is finished.
 */
export function visibleFields(
  set: TaskFieldSet,
  answerOf: (key: string) => boolean | null | undefined
): TaskField[] {
  return set.fields.filter((f) =>
    !f.onlyWhen || f.onlyWhen.anyOf.some((k) => answerOf(k) === f.onlyWhen!.is)
  );
}

/** True when the task has hand-written questions rather than the fallback. */
export function hasBespokeFields(taskId: string): boolean {
  return taskId in BY_TASK;
}
