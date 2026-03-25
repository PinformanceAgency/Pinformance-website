export type UserRole = "agency_admin" | "client_admin" | "client_viewer";

export type PinType = "static" | "video" | "idea" | "carousel";

export type PinStatus =
  | "generating"
  | "generated"
  | "scheduled"
  | "approved"
  | "posting"
  | "posted"
  | "failed"
  | "rejected";

export type BoardStatus = "draft" | "created" | "active" | "archived";

export type OnboardingStep =
  | 0 // not started
  | 1 // intake form
  | 2 // pinterest business account
  | 3 // trello board & assets
  | 4 // tracking setup
  | 5; // test sale & launch

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  shopify_domain: string | null;
  pinterest_user_id: string | null;
  pinterest_token_expires_at: string | null;
  pinterest_app_id: string | null;
  pinterest_app_secret_encrypted: string | null;
  onboarding_step: OnboardingStep;
  onboarding_completed_at: string | null;
  onboarding_video_watched: boolean;
  anthropic_api_key_encrypted: string | null;
  krea_api_key_encrypted: string | null;
  settings: OrgSettings;
  created_at: string;
  updated_at: string;
}

export interface OrgSettings {
  pins_per_day: number;
  auto_approve: boolean;
  timezone: string;
  posting_hours: number[];
  content_mix: {
    static: number;
    video: number;
    carousel: number;
  };
}

export const DEFAULT_ORG_SETTINGS: OrgSettings = {
  pins_per_day: 7, // Pinterest ideal: 1 pin/day
  auto_approve: false,
  timezone: "Europe/Amsterdam",
  posting_hours: [17, 18, 19, 20, 21], // Pinterest optimal: evenings (peak engagement)
  content_mix: { static: 70, video: 20, carousel: 10 },
};

export interface User {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  org_id: string;
  role: UserRole;
  onboarding_step: OnboardingStep;
  onboarding_completed_at: string | null;
  onboarding_video_watched: boolean;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  org_id: string;
  shopify_product_id: string | null;
  title: string;
  description: string | null;
  product_type: string | null;
  vendor: string | null;
  tags: string[];
  images: { url: string; alt: string; position: number }[];
  variants: { title: string; price: string; sku: string; image_url: string | null }[];
  collections: string[];
  status: "active" | "draft" | "archived";
  created_at: string;
  updated_at: string;
}

export interface Board {
  id: string;
  org_id: string;
  pinterest_board_id: string | null;
  name: string;
  description: string | null;
  category: string | null;
  keywords: string[];
  privacy: "public" | "secret";
  status: BoardStatus;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Pin {
  id: string;
  org_id: string;
  board_id: string;
  board_section_id: string | null;
  product_id: string | null;
  pinterest_pin_id: string | null;
  title: string;
  description: string | null;
  link_url: string | null;
  alt_text: string | null;
  pin_type: PinType;
  image_url: string | null;
  video_url: string | null;
  keywords: string[];
  status: PinStatus;
  generation_prompt: string | null;
  krea_job_id: string | null;
  scheduled_at: string | null;
  posted_at: string | null;
  rejected_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface PinAnalytics {
  id: string;
  pin_id: string;
  org_id: string;
  date: string;
  impressions: number;
  saves: number;
  pin_clicks: number;
  outbound_clicks: number;
  video_views: number;
  save_rate: number | null;
  engagement_rate: number | null;
}

export interface Keyword {
  id: string;
  org_id: string;
  keyword: string;
  search_volume: number | null;
  competition_score: number | null;
  relevance_score: number | null;
  performance_score: number | null;
  category: string | null;
  source: "ai_generated" | "competitor" | "manual" | "analytics";
  created_at: string;
  updated_at: string;
}

export interface Competitor {
  id: string;
  org_id: string;
  pinterest_username: string;
  pinterest_url: string | null;
  display_name: string | null;
  last_scraped_at: string | null;
  scrape_status: "pending" | "scraping" | "completed" | "failed";
  board_count: number | null;
  pin_count: number | null;
  follower_count: number | null;
  avg_posting_frequency: number | null;
  top_keywords: string[];
  created_at: string;
  updated_at: string;
}

export interface FeedbackRule {
  id: string;
  org_id: string | null;
  rule_type: "prompt_modifier" | "content_filter" | "style_guide" | "keyword_boost" | "keyword_block";
  rule_text: string;
  priority: number;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CalendarEntry {
  id: string;
  org_id: string;
  pin_id: string;
  scheduled_date: string;
  scheduled_time: string;
  slot_index: number;
  pin?: Pin;
}

export interface SalesData {
  id: string;
  org_id: string;
  date: string;
  sales_count: number;
  sales_revenue: number;
  add_to_cart_count: number;
  source: "shopify" | "pinterest" | "manual";
  created_at: string;
  updated_at: string;
}

export interface ClientDocument {
  id: string;
  org_id: string;
  title: string;
  description: string | null;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface AffiliatePartner {
  id: string;
  org_id: string;
  name: string;
  email: string | null;
  code: string;
  commission_rate: number;
  total_clicks: number;
  total_conversions: number;
  total_earnings: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AffiliatePinLink {
  id: string;
  org_id: string;
  pin_id: string | null;
  product_url: string;
  affiliate_tag: string | null;
  clicks: number;
  sales: number;
  revenue: number;
  created_at: string;
}
