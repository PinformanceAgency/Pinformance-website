/**
 * Brand Requirements — documents and assets needed from each brand
 * to create the most effective Pinterest creatives.
 *
 * These are organized by priority and used in:
 * 1. Onboarding (Brand Assets step)
 * 2. Brand profile enrichment
 * 3. Content pipeline prompt generation
 */

export const BRAND_ASSET_CATEGORIES = [
  {
    id: "brand-identity",
    title: "Brand Identity",
    description: "Core visual and verbal identity elements",
    priority: "required",
    items: [
      {
        id: "logo",
        label: "Logo (PNG/SVG, transparent background)",
        type: "file",
        required: true,
        acceptedFormats: [".png", ".svg", ".ai"],
        usage: "Watermark on pins, board covers",
      },
      {
        id: "color-palette",
        label: "Brand Colors (primary + secondary hex codes)",
        type: "colors",
        required: true,
        maxColors: 6,
        usage: "Pin backgrounds, text overlays, accent colors",
      },
      {
        id: "fonts",
        label: "Brand Fonts (names or files)",
        type: "text",
        required: false,
        usage: "Text overlay styling consistency",
      },
      {
        id: "brand-voice",
        label: "Brand Voice & Tone Description",
        type: "textarea",
        required: true,
        placeholder: "e.g., Empowering, educational, approachable. We speak directly to women who...",
        usage: "Pin titles, descriptions, text overlays",
      },
      {
        id: "tagline",
        label: "Brand Tagline / Slogan",
        type: "text",
        required: false,
        usage: "Pin text overlays, board descriptions",
      },
    ],
  },
  {
    id: "product-assets",
    title: "Product Assets",
    description: "Product imagery and information for pin creation",
    priority: "required",
    items: [
      {
        id: "hero-images",
        label: "Hero Product Images (high-res, white/lifestyle background)",
        type: "files",
        required: true,
        acceptedFormats: [".jpg", ".jpeg", ".png", ".webp"],
        minCount: 5,
        usage: "Primary pin imagery, product showcases",
      },
      {
        id: "lifestyle-images",
        label: "Lifestyle / In-Use Images",
        type: "files",
        required: false,
        acceptedFormats: [".jpg", ".jpeg", ".png", ".webp"],
        usage: "Lifestyle pins (highest engagement on Pinterest)",
      },
      {
        id: "product-catalog",
        label: "Product Catalog Link (Shopify, website, or spreadsheet)",
        type: "url",
        required: true,
        usage: "Product data for pin content, link destinations",
      },
      {
        id: "product-descriptions",
        label: "Product Descriptions & Key Benefits",
        type: "textarea",
        required: true,
        placeholder: "Per product: name, description, key benefits, target audience, price range...",
        usage: "Pin descriptions, SEO keywords, text overlays",
      },
      {
        id: "best-sellers",
        label: "Top 5 Best-Selling Products",
        type: "textarea",
        required: true,
        placeholder: "List your top 5 products by revenue. These get priority in pin creation.",
        usage: "Content prioritization — best sellers get more pins",
      },
    ],
  },
  {
    id: "design-references",
    title: "Design References & Inspiration",
    description: "Visual direction for AI-generated pin designs",
    priority: "recommended",
    items: [
      {
        id: "pinterest-inspiration",
        label: "Pinterest Boards You Like (URLs)",
        type: "urls",
        required: false,
        maxCount: 5,
        placeholder: "https://pinterest.com/username/board-name",
        usage: "Visual style analysis for image prompt tuning",
      },
      {
        id: "competitor-accounts",
        label: "Competitor Pinterest Accounts (URLs)",
        type: "urls",
        required: false,
        maxCount: 3,
        placeholder: "https://pinterest.com/competitor-name",
        usage: "Competitor analysis, keyword discovery, content gap analysis",
      },
      {
        id: "visual-style",
        label: "Preferred Visual Styles",
        type: "multiselect",
        required: true,
        options: [
          { value: "lifestyle", label: "Lifestyle Photography", description: "Products in real-life settings" },
          { value: "flat_lay", label: "Flat Lay", description: "Overhead product arrangements" },
          { value: "editorial", label: "Editorial / Fashion", description: "Magazine-style shoots" },
          { value: "minimalist", label: "Minimalist / Clean", description: "Simple, clean backgrounds" },
          { value: "bold", label: "Bold & Colorful", description: "Vibrant, eye-catching designs" },
          { value: "infographic", label: "Infographic / Tips", description: "Educational, text-heavy pins" },
          { value: "closeup", label: "Close-up / Detail", description: "Texture and detail focus" },
          { value: "model", label: "Model / Person", description: "People using/wearing products" },
        ],
        usage: "Image prompt style direction, content mix optimization",
      },
      {
        id: "avoid-styles",
        label: "Visual Styles to Avoid",
        type: "textarea",
        required: false,
        placeholder: "e.g., No clinical/medical imagery, avoid neon colors, no stock photo feel...",
        usage: "Negative prompt constraints for image generation",
      },
    ],
  },
  {
    id: "brand-research",
    title: "Brand Research & Strategy",
    description: "Market knowledge that shapes content strategy",
    priority: "recommended",
    items: [
      {
        id: "target-audience",
        label: "Target Audience Description",
        type: "textarea",
        required: true,
        placeholder: "Demographics, psychographics, pain points, desires. e.g., Women 25-45 who...",
        usage: "Persona-driven content, keyword targeting, tone alignment",
      },
      {
        id: "unique-selling-points",
        label: "Unique Selling Points (USPs)",
        type: "textarea",
        required: true,
        placeholder: "What makes your brand different? List 3-5 key USPs.\n• ...\n• ...\n• ...",
        usage: "Pin headlines, text overlays, description hooks",
      },
      {
        id: "target-keywords",
        label: "Keywords You Want to Rank For",
        type: "textarea",
        required: false,
        placeholder: "e.g., bras for small bust, wireless bra A cup, lingerie small chest...",
        usage: "Keyword strategy seeding, SEO optimization",
      },
      {
        id: "seasonal-calendar",
        label: "Seasonal Calendar / Promotion Schedule",
        type: "textarea",
        required: false,
        placeholder: "e.g., Valentine's Day sale (Feb 1-14), Summer collection launch (June 1), Black Friday...",
        usage: "Seasonal content planning (Pinterest requires 30-45 day lead time)",
      },
      {
        id: "content-restrictions",
        label: "Content Restrictions & Guidelines",
        type: "textarea",
        required: false,
        placeholder: "e.g., Never show nudity, always include size range, mention free shipping...",
        usage: "Guardrails for AI content generation",
      },
      {
        id: "additional-notes",
        label: "Anything Else We Should Know",
        type: "textarea",
        required: false,
        placeholder: "Any additional context, links to brand guidelines PDFs, previous campaigns...",
        usage: "Context enrichment for prompt optimization",
      },
    ],
  },
] as const;

/**
 * Minimum viable brand profile — what's needed to start generating pins
 */
export const MINIMUM_REQUIREMENTS = [
  "brand-identity.brand-voice",
  "brand-identity.color-palette",
  "product-assets.product-catalog",
  "product-assets.best-sellers",
  "design-references.visual-style",
  "brand-research.target-audience",
  "brand-research.unique-selling-points",
] as const;

/**
 * How brand assets are used in the pipeline
 */
export const ASSET_PIPELINE_MAPPING = {
  // Strategy Pipeline
  "brand-research.target-audience": ["keyword-strategy", "board-plan"],
  "brand-research.unique-selling-points": ["keyword-strategy", "pin-content"],
  "brand-research.target-keywords": ["keyword-strategy"],
  "design-references.competitor-accounts": ["competitor-analysis"],

  // Content Pipeline
  "brand-identity.brand-voice": ["pin-content", "pin-description"],
  "brand-identity.tagline": ["pin-text-overlay"],
  "product-assets.product-descriptions": ["pin-content", "pin-description"],
  "product-assets.best-sellers": ["content-prioritization"],
  "brand-research.seasonal-calendar": ["content-scheduling"],
  "brand-research.content-restrictions": ["content-filter"],

  // Image Pipeline
  "brand-identity.logo": ["pin-watermark"],
  "brand-identity.color-palette": ["image-prompt-colors"],
  "brand-identity.fonts": ["image-prompt-typography"],
  "design-references.visual-style": ["image-prompt-style"],
  "design-references.avoid-styles": ["image-prompt-negative"],
  "design-references.pinterest-inspiration": ["image-prompt-reference"],
  "product-assets.hero-images": ["image-prompt-product"],
  "product-assets.lifestyle-images": ["image-prompt-lifestyle"],
} as const;
