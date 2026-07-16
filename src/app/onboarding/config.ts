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
    formResponseUrl: "" as string,     // e.g. "https://docs.google.com/forms/d/e/XXXXX/formResponse"
    questions: [
      // Placeholder questions — REPLACE with your real Google Form fields + entry IDs
      { id: "brand",   label: "Brand name",              type: "text",     entryId: "entry.0000000001", required: true, placeholder: "e.g. Celestia" },
      { id: "website", label: "Website URL",             type: "url",      entryId: "entry.0000000002", required: true, placeholder: "https://" },
      { id: "email",   label: "Contact email",           type: "email",    entryId: "entry.0000000003", required: true },
      { id: "revenue", label: "Current monthly revenue", type: "text",     entryId: "entry.0000000004", required: true, placeholder: "€ …" },
      { id: "adspend", label: "Current monthly ad spend",type: "text",     entryId: "entry.0000000005", required: true, placeholder: "€ …" },
      { id: "goal",    label: "What is your main goal?", type: "textarea", entryId: "entry.0000000006", required: true },
    ] as IntakeQuestion[],
  },

  // ---------- Slack notification ----------
  // Create an Incoming Webhook in Slack (api.slack.com/messaging/webhooks), point it at your internal channel,
  // and paste the full URL here. It stays on the server — never shipped to client.
  //
  // IMPORTANT: this env var must be set in Vercel (NOT public):
  //   SLACK_ONBOARDING_WEBHOOK_URL="https://hooks.slack.com/services/T.../B.../..."
  //
  // The webhook is read from process.env inside the /api/onboarding/intake route.

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
