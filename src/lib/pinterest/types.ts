export interface PinterestTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

export interface PinterestPin {
  id: string;
  title: string;
  description: string | null;
  link: string | null;
  board_id: string;
  board_section_id: string | null;
  media_source: {
    source_type: "image_url" | "video_id";
    url?: string;
    cover_image_url?: string;
  };
  created_at: string;
}

export interface PinterestBoard {
  id: string;
  name: string;
  description: string | null;
  privacy: "PUBLIC" | "SECRET";
  pin_count: number;
}

export interface PinterestAnalytics {
  pin_id: string;
  date: string;
  metrics: {
    IMPRESSION: number;
    SAVE: number;
    PIN_CLICK: number;
    OUTBOUND_CLICK: number;
    VIDEO_V50_WATCH_TIME?: number;
  };
}

export interface PinterestUserAccount {
  username: string;
  profile_image: string;
  website_url: string | null;
  account_type: "BUSINESS" | "PINNER";
}
