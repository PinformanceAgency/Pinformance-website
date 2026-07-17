// ============================================================
//  ONBOARDING CONFIG — Fill these in as you get each asset.
//  Placeholders (empty string / "TODO") are safe: the UI will
//  show a friendly "nog niet ingesteld" state instead of breaking.
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

  // ---------- Videos (Loom embed URLs) ----------
  // Get the Loom embed URL: in Loom → Share → Embed → copy the URL from the src="..." of the iframe.
  // Looks like: https://www.loom.com/embed/XXXXXXXXXXXXXXXXX
  videos: {
    welcome: "",            // Tristan welcome video
    pinterestSetup: "",     // Overview of the Pinterest setup steps
    pinterestBusiness: "",  // Sub-loom: create Pinterest Business account
    pinterestAccess: "",    // Sub-loom: grant us access
    pinterestTracking: "",  // Sub-loom: connect tracking
    admin: "",              // Contract + billing explanation
    thanks: "",             // Final thanks video
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
        options: ["Wetracked", "Trackbee", "Elevar", "Triplewhale", "Its a new store, its not installed yet"] },
    ] as IntakeQuestion[],
  },

  // ---------- Slack ----------
  // Handled by an existing Zapier zap that watches the Google Sheet for new rows
  // and posts them into the internal Slack channel. Nothing to configure here.

  // ---------- External links ----------
  links: {
    calendlyKickoff: "" as string,      // Full Calendly URL for the kickoff call
    docusignContract: "" as string,     // DocuSign PowerForm URL — client signs directly there
    contractPdfUrl: "" as string,       // Optional: link to a PDF preview if you want them to read first
    pinterestBusinessSignup: "https://business.pinterest.com/",
    trelloCreativesBoard: "" as string, // Optional: Trello board URL for creative uploads
  },
};

export type OnboardingConfig = typeof ONBOARDING_CONFIG;
