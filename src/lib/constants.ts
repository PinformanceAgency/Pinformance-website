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

export const POSTING_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes between posts

// Pinterest algorithm-friendly posting cadence
export const RECOMMENDED_PINS_PER_DAY = {
  new_account: 3, // < 1 month, < 500 followers
  growing: 8, // 1-6 months or 500-5000 followers
  established: 15, // 6+ months and 5000+ followers
  max_safe: 25, // absolute max to avoid spam detection
} as const;

export const ONBOARDING_STEPS = [
  { step: 1, title: "Intake Form", description: "Fill in your onboarding form to get started", icon: "clipboard-list", estimatedMinutes: 5 },
  { step: 2, title: "Pinterest Business Account", description: "Grant access, claim your domain, set up billing & profile", icon: "pin", estimatedMinutes: 15 },
  { step: 3, title: "Trello Board & Creative Assets", description: "Upload your product links, images, and campaign materials", icon: "layout", estimatedMinutes: 15 },
  { step: 4, title: "Connect Tracking Partner", description: "Link your tracking tool so we can measure performance", icon: "bar-chart-3", estimatedMinutes: 10 },
  { step: 5, title: "Test Sale & Campaign Setup", description: "Perform a test sale to finalise your setup and launch", icon: "rocket", estimatedMinutes: 5 },
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
