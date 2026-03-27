export const APP_NAME = "Pinformance";

export const PINTEREST_LIMITS = {
  MAX_PINS_PER_DAY: 250,
  MAX_PINS_PER_MINUTE: 10,
  MAX_TITLE_LENGTH: 100,
  MAX_DESCRIPTION_LENGTH: 500,
  OPTIMAL_IMAGE_WIDTH: 1000,
  OPTIMAL_IMAGE_HEIGHT: 1500,
  ASPECT_RATIO: "2:3",
  TOKEN_EXPIRY_DAYS: 30,
  REFRESH_TOKEN_EXPIRY_DAYS: 365,
} as const;

export const PINTEREST_SCOPES = [
  "boards:read",
  "boards:write",
  "pins:read",
  "pins:write",
  "user_accounts:read",
] as const;

export const POSTING_INTERVAL_MS = 30 * 1000; // 30 seconds minimum between API calls (Pinterest recommendation)

// Pinterest algorithm-friendly posting cadence (based on Pinterest's official guidance)
export const RECOMMENDED_PINS_PER_DAY = {
  new_account: 3, // < 1 month, < 500 followers — start slow
  growing: 5, // 1-6 months or 500-5000 followers
  established: 7, // 6+ months and 5000+ followers — ideal: 1 pin/day
  max_safe: 25, // absolute max to avoid spam detection
} as const;

// Content pillar distribution (Pinterest recommended)
export const DEFAULT_CONTENT_PILLARS = [
  { name: "Education & Value", percentage: 40, description: "Educational content, tips, how-tos about the niche" },
  { name: "Proof & Results", percentage: 30, description: "Before/after, testimonials, case studies, results" },
  { name: "Savings & Benefits", percentage: 20, description: "Cost savings, ROI, deals, value propositions" },
  { name: "Tips & Inspiration", percentage: 10, description: "Quick tips, inspiration boards, seasonal content" },
] as const;

// Board architecture rules
export const BOARD_RULES = {
  MIN_BOARDS_PER_BRAND: 5,
  MAX_BOARDS_PER_BRAND: 10,
  SEED_PINS_PER_BOARD: 8, // Minimum pins to seed a new board
  TARGET_PINS_PER_BOARD: 40, // Long-term target per board
  NAME_FORMAT: "[Primary Keyword] — [Benefit] | [Brand Name]",
} as const;

// Pin content rules (Pinterest guidelines)
export const PIN_CONTENT_RULES = {
  MAX_TITLE_LENGTH: 100,
  MAX_DESCRIPTION_LENGTH: 500,
  TEXT_OVERLAY_MAX_WORDS: 8, // Headline max words
  IMAGE_WIDTH: 1000,
  IMAGE_HEIGHT: 1500,
  ASPECT_RATIO: "2:3",
  NO_HASHTAGS: true, // Pinterest explicitly recommends no hashtags
  BRAND_NAME_IN_DESCRIPTION: true, // Brand name must be in first sentence
  SEASONAL_LEAD_DAYS: 40, // Post seasonal content 30-45 days early
  REPIN_COOLDOWN_DAYS: 90, // Evergreen content can be re-pinned after 90 days
} as const;

// Pin image templates
export const PIN_TEMPLATES = [
  { id: "educational", name: "Educational", layout: "headline-image-logo", pillar: "Education & Value" },
  { id: "before-after", name: "Before/After", layout: "split-comparison", pillar: "Proof & Results" },
  { id: "stat-data", name: "Stat/Data", layout: "large-number-context", pillar: "Savings & Benefits" },
  { id: "tips-howto", name: "Tips/How-To", layout: "numbered-tips", pillar: "Tips & Inspiration" },
  { id: "product-feature", name: "Product Feature", layout: "lifestyle-benefit-cta", pillar: "Proof & Results" },
] as const;

export const ONBOARDING_STEPS = [
  { step: 1, title: "Intake Form", description: "Fill in your onboarding form to get started", icon: "clipboard-list", estimatedMinutes: 5 },
  { step: 2, title: "Pinterest Business Account", description: "Claim domain, billing, profile, catalog & give us access", icon: "pin", estimatedMinutes: 15 },
  { step: 3, title: "Trello Board & Creative Assets", description: "Upload your product links, images, and campaign materials", icon: "layout", estimatedMinutes: 15 },
  { step: 4, title: "Connect Tracking Partner", description: "Link your tracking tool so we can measure performance", icon: "bar-chart-3", estimatedMinutes: 10 },
  { step: 5, title: "Brand Assets", description: "Upload your brand guidelines, product assets, and design references", icon: "palette", estimatedMinutes: 10 },
] as const;

export const INDUSTRIES = [
  { value: "fashion", label: "Fashion & Apparel" },
  { value: "beauty", label: "Beauty & Skincare" },
  { value: "home", label: "Home & Decor" },
  { value: "food", label: "Food & Beverage" },
  { value: "health", label: "Health & Wellness" },
  { value: "jewelry", label: "Jewelry & Accessories" },
  { value: "fitness", label: "Fitness & Sports" },
  { value: "pets", label: "Pets" },
  { value: "kids", label: "Kids & Baby" },
  { value: "electronics", label: "Electronics & Gadgets" },
  { value: "outdoor", label: "Outdoor & Garden" },
  { value: "art", label: "Art & Crafts" },
  { value: "travel", label: "Travel & Experiences" },
  { value: "automotive", label: "Automotive" },
  { value: "other", label: "Other" },
] as const;

export const BRAND_VOICE_OPTIONS = [
  "Professional",
  "Playful",
  "Luxurious",
  "Casual",
  "Bold",
  "Minimalist",
  "Earthy",
  "Edgy",
  "Warm",
  "Sophisticated",
  "Youthful",
  "Classic",
] as const;

export const REVENUE_RANGES = [
  { value: "sub-10k", label: "< \u20AC10K / month" },
  { value: "10k-50k", label: "\u20AC10K \u2013 \u20AC50K / month" },
  { value: "50k-100k", label: "\u20AC50K \u2013 \u20AC100K / month" },
  { value: "100k-500k", label: "\u20AC100K \u2013 \u20AC500K / month" },
  { value: "500k-1m", label: "\u20AC500K \u2013 \u20AC1M / month" },
  { value: "1m-plus", label: "> \u20AC1M / month" },
] as const;
