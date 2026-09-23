// ============================================================
//  ONBOARDING CONFIG — Fill these in as you get each asset.
//  Placeholders (empty string / "TODO") are safe: the UI will
//  show a friendly "not set up yet" state instead of breaking.
// ============================================================

export interface IntakeQuestion {
  id: string;                          // internal id, used as React key
  label: string;                       // question shown to user
  helper?: string;                     // small helper text below label
  type: "text" | "textarea" | "email" | "url" | "number" | "select";
  entryId: string;                     // Google Form field id, e.g. "entry.1234567890"
  required?: boolean;                  // defaults to true
  placeholder?: string;
  options?: string[];                  // only for type: "select"
  allowOther?: boolean;                // select: add "Other" option that reveals a text input.
                                       // Requires "Other" to be enabled on the actual Google Form field.
  otherPlaceholder?: string;           // placeholder for the "Other" text input
}

export const ONBOARDING_CONFIG = {
  // ---------- Team ----------
  team: {
    pm: {
      name: "Tristan",
      role: "Project Manager",
      // photo optional; drop file in /public/onboarding/ if you want
      photoUrl: "" as string,
    },
    // Media buyer is shown generically since onboarding is anonymous (no per-client data)
    mediaBuyerNote: "Your personal media buyer will be assigned during the kickoff call.",
  },

  // ---------- Videos ----------
  // Two kinds of URL work here, and VideoEmbed tells them apart by extension:
  //
  //   a file we host  → https://<project>.supabase.co/storage/v1/object/public/uploads/onboarding/<name>.mp4
  //                     rendered as a real <video> player
  //   an embed        → https://www.loom.com/embed/XXXXXXXXXXXX
  //                     rendered as an <iframe>
  //
  // The edited videos are ours, so they are files. Upload them with
  // `scripts/upload-onboarding-videos.ts`, which compresses first — the master
  // of the welcome video is 4K at 30 Mbps, 318 MB for 88 seconds, and a client
  // on a phone would be made to download all of it.
  videos: {
    welcome: "https://epcbwgkfdtmtohbomzxt.supabase.co/storage/v1/object/public/uploads/onboarding/welcome.mp4",
    // Eén Loom over de hele Pinterest-setup, dus de vier stappen eronder hebben
    // geen eigen video — die sleutels stonden er wel en zijn weg (23-09-2026).
    // Deze is als Loom opgenomen en niet opnieuw gemonteerd, dus hij blijft een
    // embed. Let op de URL: Loom geeft je een /share/-link om te delen, en een
    // /embed/-link om in te sluiten. De share-variant in een iframe levert een
    // Loom-pagina op met kop en knoppen eromheen, geen speler.
    pinterestSetup: "https://www.loom.com/embed/8ca567ab3678406c9e948e3a960f6383",
    // Eén video over contracten én facturatie, dus ook één kaart in StepAdmin.
    // Er was hier een aparte `billing`-sleutel; die is weg omdat er geen tweede
    // video is en een sleutel die nergens meer landt de volgende persoon laat
    // zoeken naar een video die niet bestaat.
    contracts: "https://epcbwgkfdtmtohbomzxt.supabase.co/storage/v1/object/public/uploads/onboarding/contracts.mp4",
    kickoff: "https://epcbwgkfdtmtohbomzxt.supabase.co/storage/v1/object/public/uploads/onboarding/kickoff.mp4",
    thanks: "https://epcbwgkfdtmtohbomzxt.supabase.co/storage/v1/object/public/uploads/onboarding/thanks.mp4",
  },

  // ---------- Intake form (Google Form mirror) ----------
  // 1) Get the public "fill" URL of your form (looks like docs.google.com/forms/d/e/<E_ID>/viewform)
  // 2) formResponseUrl = same URL but ending in /formResponse instead of /viewform
  // 3) For each question, use the browser inspector on the fill page to find <input name="entry.NNN">
  //    and paste that into `entryId` below.
  intake: {
    // Mirror of "🚀 Pinformance Onboarding Form" (Google Form).
    // Responses POST here → the linked Google Sheet auto-populates.
    formResponseUrl: "https://docs.google.com/forms/d/e/1FAIpQLScikiDgy9ZEsi56TiR8qi-Bqrk_YPyScbHHwC8AzzU3Ygscqw/formResponse",
    questions: [
      { id: "name",     label: "What is your name?",                                              type: "text",  entryId: "entry.1695730296", required: true },
      { id: "email",    label: "What is your email address where we can send invoices & agreements?", type: "email", entryId: "entry.1076078538", required: true },
      { id: "company",  label: "What is your company name?",                                      type: "text",  entryId: "entry.1044323071", required: true },
      { id: "street",   label: "What is your company's street name + number?",                    type: "text",  entryId: "entry.327172809",  required: true },
      { id: "postal",   label: "What is your company's postal code + city?",                      type: "text",  entryId: "entry.1074038984", required: true },
      { id: "country",  label: "In what country is your company based?",                          type: "text",  entryId: "entry.1373366830", required: true },
      { id: "shopify",  label: "What is your Shopify Domain + Collab Code?",                      type: "text",  entryId: "entry.1256718213", required: true, placeholder: "e.g. brand.myshopify.com + 1234" },
      { id: "roas",     label: "What is your Target ROAS + Break Even ROAS?",                     type: "text",  entryId: "entry.908320573",  required: true, placeholder: "Target / Break-even" },
      { id: "tracking", label: "What Tracking Provider are you using?",                           type: "select", entryId: "entry.1587285175", required: true,
        options: ["Wetracked", "Trackbee", "Elevar", "Triplewhale", "Its a new store, its not installed yet"],
        allowOther: true, otherPlaceholder: "Which tracking provider?" },
    ] as IntakeQuestion[],
  },

  // ---------- Slack ----------
  // Handled by an existing Zapier zap that watches the Google Sheet for new rows
  // and posts them into the internal Slack channel. Nothing to configure here.

  // ---------- External links ----------
  links: {
    calendlyKickoff: "https://calendly.com/d/cysr-qwj-w5f/pinformance-kick-off-call",
    pinterestBusinessSignup: "https://business.pinterest.com/",
    trelloCreativesBoard: "" as string, // Optional: Trello board URL for creative uploads
  },
};

export type OnboardingConfig = typeof ONBOARDING_CONFIG;
