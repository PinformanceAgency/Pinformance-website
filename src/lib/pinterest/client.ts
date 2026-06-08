import type {
  PinterestBoard,
  PinterestPin,
  PinterestTokens,
  PinterestUserAccount,
} from "./types";

export interface PinterestImage {
  url: string;
  width?: number;
  height?: number;
}

export interface PinterestPinResponse {
  id: string;
  board_id?: string;
  title?: string;
  description?: string;
  link?: string;
  media?: {
    media_type?: string;
    images?: Record<string, PinterestImage>;
    videos?: Record<string, { url?: string; thumbnail?: string; cover_image_url?: string }>;
    items?: Array<{
      // Carousel/multi-image slot
      images?: Record<string, PinterestImage>;
      title?: string;
      description?: string;
    }>;
    cover_image_url?: string;
  };
  media_source?: {
    source_type?: string;
    url?: string;
    cover_image_url?: string;
    media_id?: string;
  };
  carousel_data?: {
    carousel_slots?: Array<{
      images?: Record<string, PinterestImage>;
      title?: string;
      description?: string;
    }>;
  };
  story_pin_data?: {
    pages?: Array<{
      image?: PinterestImage | { images?: Record<string, PinterestImage> };
      cover_image_url?: string;
    }>;
  };
  thumbnail?: string | { url?: string };
}

/** Best-effort image URL extraction across Pinterest pin types. */
export function extractPinImageUrl(pin: PinterestPinResponse | null | undefined): string | null {
  if (!pin) return null;

  function pickFromImageMap(imgs?: Record<string, PinterestImage>): string | null {
    if (!imgs) return null;
    const preferred = ["600x", "1200x", "400x300", "236x", "150x150", "original"];
    for (const key of preferred) {
      const found = imgs[key]?.url;
      if (found) return found;
    }
    const first = Object.values(imgs)[0];
    return first?.url || null;
  }

  // 1. Standard pin (incl. video pins where this is the cover frame).
  const std = pickFromImageMap(pin.media?.images);
  if (std) return std;

  // 2. Video pin — explicit cover_image_url on media OR on a video variant.
  if (pin.media?.cover_image_url) return pin.media.cover_image_url;
  if (pin.media?.videos) {
    for (const v of Object.values(pin.media.videos)) {
      if (v?.cover_image_url) return v.cover_image_url;
      if (v?.thumbnail) return v.thumbnail;
    }
  }

  // 3. media_source.cover_image_url (videos uploaded via Ads Manager).
  if (pin.media_source?.cover_image_url) return pin.media_source.cover_image_url;
  if (pin.media_source?.url && pin.media_source.source_type === "image_url") {
    return pin.media_source.url;
  }

  // 4. Carousel — items array on media.
  for (const item of pin.media?.items || []) {
    const u = pickFromImageMap(item.images);
    if (u) return u;
  }

  // 5. Carousel — alternative shape under carousel_data.carousel_slots.
  for (const slot of pin.carousel_data?.carousel_slots || []) {
    const u = pickFromImageMap(slot.images);
    if (u) return u;
  }

  // 6. Idea / story pin — first page's image / cover.
  for (const page of pin.story_pin_data?.pages || []) {
    if (page.cover_image_url) return page.cover_image_url;
    if (!page?.image) continue;
    if (typeof (page.image as PinterestImage).url === "string") {
      return (page.image as PinterestImage).url;
    }
    const nested = pickFromImageMap((page.image as { images?: Record<string, PinterestImage> }).images);
    if (nested) return nested;
  }

  // 7. Top-level thumbnail (rare).
  if (typeof pin.thumbnail === "string") return pin.thumbnail;
  if (pin.thumbnail && typeof pin.thumbnail === "object" && pin.thumbnail.url) return pin.thumbnail.url;

  return null;
}

/**
 * Fallback when the API doesn't surface a usable image: scrape Pinterest's
 * public pin page for its og:image meta tag. Works for any public pin (and
 * promoted pins are public). Returns null on failure — safe to call as a
 * last resort.
 */
export async function fetchPinOgImage(pinId: string): Promise<string | null> {
  const url = `https://www.pinterest.com/pin/${pinId}/`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; PinformanceBot/1.0; +https://pinformance.com)",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const match = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
    return match?.[1] || null;
  } catch {
    return null;
  }
}

const PINTEREST_API_PROD = "https://api.pinterest.com/v5";
const PINTEREST_API_SANDBOX = "https://api-sandbox.pinterest.com/v5";

/**
 * Safety cap on how many ads / ad groups / campaigns we'll page through
 * from Pinterest's API in a single request. Pinterest paginates these
 * newest-first; the with-spend records on big accounts (Nordheim has
 * 3000+ total ads with 683 with spend) can be spread out, so caps below
 * this caused the Creative Weekly Report to silently return 0 ads.
 *
 * If a client ever exceeds 5000 ads with spend in a single date range,
 * bump this in ONE place rather than chasing the constant across every
 * Pinterest route.
 */
export const MAX_PINTEREST_FETCH = 5000;

export class PinterestClient {
  private baseUrl: string;

  constructor(private accessToken: string, sandbox = false) {
    this.baseUrl = sandbox ? PINTEREST_API_SANDBOX : PINTEREST_API_PROD;
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });
    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Pinterest API error ${res.status}: ${error}`);
    }
    return res.json();
  }

  async getUser(): Promise<PinterestUserAccount> {
    return this.request("/user_account");
  }

  async createBoard(data: {
    name: string;
    description?: string;
    privacy?: "PUBLIC" | "SECRET";
  }): Promise<PinterestBoard> {
    return this.request("/boards", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getBoards(): Promise<{ items: PinterestBoard[] }> {
    return this.request("/boards");
  }

  async createPin(data: {
    board_id: string;
    board_section_id?: string;
    title: string;
    description?: string;
    link?: string;
    alt_text?: string;
    media_source: {
      source_type: "image_url";
      url: string;
    };
  }): Promise<PinterestPin> {
    return this.request("/pins", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /**
   * Create a video pin. 3-step process:
   * 1. Register media upload → get media_id + upload_url
   * 2. Upload video binary to S3
   * 3. Create pin with media_id
   */
  async registerMediaUpload(): Promise<{
    media_id: string;
    upload_url: string;
    upload_parameters: Record<string, string>;
  }> {
    return this.request("/media", {
      method: "POST",
      body: JSON.stringify({ media_type: "video" }),
    });
  }

  async uploadVideoToS3(
    uploadUrl: string,
    uploadParams: Record<string, string>,
    videoBuffer: Buffer,
    contentType = "video/mp4"
  ): Promise<void> {
    const formData = new FormData();
    for (const [key, value] of Object.entries(uploadParams)) {
      formData.append(key, value);
    }
    // Preserve original content type so audio track is retained
    const ext = contentType.includes("quicktime") ? "mov" : "mp4";
    formData.append("file", new Blob([new Uint8Array(videoBuffer)], { type: contentType }), `video.${ext}`);

    const res = await fetch(uploadUrl, {
      method: "POST",
      body: formData,
    });

    if (!res.ok && res.status !== 204) {
      const error = await res.text();
      throw new Error(`S3 upload failed ${res.status}: ${error.substring(0, 200)}`);
    }
  }

  async getMediaStatus(mediaId: string): Promise<{ status: string }> {
    return this.request(`/media/${mediaId}`);
  }

  async createVideoPin(data: {
    board_id: string;
    title: string;
    description?: string;
    link?: string;
    alt_text?: string;
    media_id: string;
    cover_image_url?: string;
    cover_image_key_frame_time?: number;
  }): Promise<PinterestPin> {
    const mediaSource: Record<string, unknown> = {
      source_type: "video_id",
      media_id: data.media_id,
    };
    if (data.cover_image_url) {
      mediaSource.cover_image_url = data.cover_image_url;
    }
    if (data.cover_image_key_frame_time !== undefined) {
      mediaSource.cover_image_key_frame_time = data.cover_image_key_frame_time;
    }

    return this.request("/pins", {
      method: "POST",
      body: JSON.stringify({
        board_id: data.board_id,
        title: data.title,
        description: data.description,
        link: data.link,
        alt_text: data.alt_text,
        media_source: mediaSource,
      }),
    });
  }

  async deletePin(pinId: string): Promise<void> {
    await fetch(`${this.baseUrl}/pins/${pinId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
  }

  async getAccountPins(bookmark?: string): Promise<{ items: { id: string }[]; bookmark?: string }> {
    const params = bookmark ? `?bookmark=${bookmark}` : "";
    return this.request(`/user_account/pins${params}`);
  }

  /**
   * List a board's pins (newest first). Used by the boards sync to read the
   * most-recent pin's `created_at` so the health overview has real pin
   * velocity even for boards whose pins were created outside Pinformance.
   */
  async getBoardPins(
    boardId: string,
    pageSize = 25,
    bookmark?: string
  ): Promise<{ items: Array<{ id: string; created_at?: string }>; bookmark?: string }> {
    const params = new URLSearchParams({ page_size: String(pageSize) });
    if (bookmark) params.set("bookmark", bookmark);
    return this.request(`/boards/${boardId}/pins?${params}`);
  }

  async getUserAccountAnalytics(
    startDate: string,
    endDate: string,
    metricTypes: string[] = [
      "IMPRESSION",
      "SAVE",
      "PIN_CLICK",
      "OUTBOUND_CLICK",
      "ENGAGEMENT",
      "ENGAGEMENT_RATE",
      "SAVE_RATE",
    ]
  ) {
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
      metric_types: metricTypes.join(","),
      content_type: "ORGANIC",
    });
    return this.request<{
      all: {
        daily_metrics: Array<{
          date: string;
          data_status: string;
          metrics: Record<string, number>;
        }>;
      };
    }>(`/user_account/analytics?${params}`);
  }

  async getPin(pinId: string, adAccountId?: string) {
    const qs = adAccountId
      ? `?ad_account_id=${encodeURIComponent(adAccountId)}&pin_metrics=false`
      : "";
    return this.request<PinterestPinResponse>(`/pins/${pinId}${qs}`);
  }

  async getTopPins(
    startDate: string,
    endDate: string,
    sortBy: string = "IMPRESSION",
    metricTypes: string[] = ["IMPRESSION", "SAVE", "PIN_CLICK", "OUTBOUND_CLICK"],
    contentType?: string
  ) {
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
      sort_by: sortBy,
      metric_types: metricTypes.join(","),
    });
    if (contentType) {
      params.set("content_type", contentType);
    }
    return this.request<{
      pins: Array<{
        pin_id: string;
        metrics: Record<string, number>;
        data_status: Record<string, string>;
      }>;
    }>(`/user_account/analytics/top_pins?${params}`);
  }

  async getPinAnalytics(
    pinId: string,
    startDate: string,
    endDate: string,
    metricTypes: string[] = ["IMPRESSION", "SAVE", "PIN_CLICK", "OUTBOUND_CLICK"]
  ) {
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
      metric_types: metricTypes.join(","),
    });
    return this.request(`/pins/${pinId}/analytics?${params}`);
  }

  async getAdAccounts(): Promise<{ items: Array<{ id: string; name: string; currency?: string }> }> {
    return this.request("/ad_accounts");
  }

  /**
   * Account-level paid analytics. Returns one row of totals for the whole
   * ad account over the date range — this is what Pinterest Campaign
   * Manager shows in the headline numbers. Use this for top-line KPIs.
   * Summing ad-level analytics rows does NOT always equal this because
   * Pinterest sometimes attributes conversions at campaign/ad-group level
   * rather than down to a specific ad.
   */
  async getAdAccountAnalytics(
    adAccountId: string,
    startDate: string,
    endDate: string,
    opts: {
      columns?: string[];
      granularity?: "TOTAL" | "DAY" | "HOUR" | "WEEK" | "MONTH";
      clickWindowDays?: 1 | 7 | 14 | 30 | 60;
      viewWindowDays?: 1 | 7 | 14 | 30 | 60;
      conversionReportTime?: "TIME_OF_AD_ACTION" | "TIME_OF_CONVERSION";
    } = {}
  ): Promise<{
    all?: {
      daily_metrics?: Array<{
        date: string;
        data_status: string;
        metrics: Record<string, number>;
      }>;
    };
    [k: string]: unknown;
  } | Array<Record<string, number | string>>> {
    const columns = opts.columns ?? [
      "SPEND_IN_DOLLAR",
      "IMPRESSION_1",
      "CLICKTHROUGH_1",
      "TOTAL_CHECKOUT",
      "TOTAL_CHECKOUT_VALUE_IN_MICRO_DOLLAR",
      "CHECKOUT_ROAS",
    ];
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
      columns: columns.join(","),
      granularity: opts.granularity ?? "TOTAL",
      conversion_report_time: opts.conversionReportTime ?? "TIME_OF_CONVERSION",
      click_window_days: String(opts.clickWindowDays ?? 30),
      view_window_days: String(opts.viewWindowDays ?? 1),
    });
    return this.request(`/ad_accounts/${adAccountId}/analytics?${params}`);
  }

  /**
   * List ads in an ad account. Paginate via bookmark.
   */
  async getAds(
    adAccountId: string,
    opts: { bookmark?: string; pageSize?: number; entityStatuses?: string[] } = {}
  ): Promise<{
    items: Array<{
      id: string;
      name?: string;
      pin_id?: string;
      ad_group_id?: string;
      campaign_id?: string;
      status?: string;
      creative_type?: string;
      created_time?: number;
    }>;
    bookmark?: string;
  }> {
    const params = new URLSearchParams({
      page_size: String(opts.pageSize ?? 100),
    });
    if (opts.bookmark) params.set("bookmark", opts.bookmark);
    if (opts.entityStatuses?.length) {
      params.set("entity_statuses", opts.entityStatuses.join(","));
    }
    return this.request(`/ad_accounts/${adAccountId}/ads?${params}`);
  }

  /**
   * Ad-level paid analytics. Max 100 ad_ids per call.
   * Pinterest returns one entry per ad with the requested columns + AD_ID.
   */
  async getAdAnalytics(
    adAccountId: string,
    adIds: string[],
    startDate: string,
    endDate: string,
    opts: {
      columns?: string[];
      granularity?: "TOTAL" | "DAY" | "HOUR" | "WEEK" | "MONTH";
      clickWindowDays?: 1 | 7 | 14 | 30 | 60;
      viewWindowDays?: 1 | 7 | 14 | 30 | 60;
      conversionReportTime?: "TIME_OF_AD_ACTION" | "TIME_OF_CONVERSION";
    } = {}
  ): Promise<Array<Record<string, number | string>>> {
    if (adIds.length === 0) return [];
    const columns = opts.columns ?? [
      "SPEND_IN_DOLLAR",
      "IMPRESSION_1",
      "CLICKTHROUGH_1",
      "CTR",
      "CPM_IN_DOLLAR",
      "ECPC_IN_DOLLAR",
      "TOTAL_CHECKOUT",
      "TOTAL_CHECKOUT_VALUE_IN_MICRO_DOLLAR",
      "CHECKOUT_ROAS",
    ];
    const params = new URLSearchParams({
      ad_ids: adIds.slice(0, 100).join(","),
      start_date: startDate,
      end_date: endDate,
      columns: columns.join(","),
      granularity: opts.granularity ?? "TOTAL",
      conversion_report_time: opts.conversionReportTime ?? "TIME_OF_CONVERSION",
      click_window_days: String(opts.clickWindowDays ?? 30),
      view_window_days: String(opts.viewWindowDays ?? 1),
    });
    // engagement_window_days is intentionally NOT sent — Pinterest Campaign
    // Manager doesn't expose it in the 30/1-style settings, so leaving it
    // unset matches CM's defaulting behavior.
    return this.request(`/ad_accounts/${adAccountId}/ads/analytics?${params}`);
  }

  /**
   * List campaigns in an ad account. Paginate via bookmark.
   */
  async getCampaigns(
    adAccountId: string,
    opts: { bookmark?: string; pageSize?: number; entityStatuses?: string[] } = {}
  ): Promise<{
    items: Array<{
      id: string;
      name?: string;
      status?: string;
      objective_type?: string;
      created_time?: number;
      ad_account_id?: string;
    }>;
    bookmark?: string;
  }> {
    const params = new URLSearchParams({
      page_size: String(opts.pageSize ?? 100),
    });
    if (opts.bookmark) params.set("bookmark", opts.bookmark);
    if (opts.entityStatuses?.length) {
      params.set("entity_statuses", opts.entityStatuses.join(","));
    }
    return this.request(`/ad_accounts/${adAccountId}/campaigns?${params}`);
  }

  /**
   * Campaign-level paid analytics. Max 100 campaign_ids per call.
   * Pinterest returns one entry per campaign with the requested columns +
   * CAMPAIGN_ID. Conversion numbers here include attribution that can't be
   * attributed down to a specific ad, so summing ad-level analytics will
   * sometimes under-count vs this.
   */
  async getCampaignAnalytics(
    adAccountId: string,
    campaignIds: string[],
    startDate: string,
    endDate: string,
    opts: {
      columns?: string[];
      granularity?: "TOTAL" | "DAY" | "HOUR" | "WEEK" | "MONTH";
      clickWindowDays?: 1 | 7 | 14 | 30 | 60;
      viewWindowDays?: 1 | 7 | 14 | 30 | 60;
      conversionReportTime?: "TIME_OF_AD_ACTION" | "TIME_OF_CONVERSION";
    } = {}
  ): Promise<Array<Record<string, number | string>>> {
    if (campaignIds.length === 0) return [];
    const columns = opts.columns ?? [
      "SPEND_IN_DOLLAR",
      "IMPRESSION_1",
      "CLICKTHROUGH_1",
      "CTR",
      "CPM_IN_DOLLAR",
      "ECPC_IN_DOLLAR",
      "TOTAL_CHECKOUT",
      "TOTAL_CHECKOUT_VALUE_IN_MICRO_DOLLAR",
      "CHECKOUT_ROAS",
    ];
    const params = new URLSearchParams({
      campaign_ids: campaignIds.slice(0, 100).join(","),
      start_date: startDate,
      end_date: endDate,
      columns: columns.join(","),
      granularity: opts.granularity ?? "TOTAL",
      conversion_report_time: opts.conversionReportTime ?? "TIME_OF_CONVERSION",
      click_window_days: String(opts.clickWindowDays ?? 30),
      view_window_days: String(opts.viewWindowDays ?? 1),
    });
    return this.request(`/ad_accounts/${adAccountId}/campaigns/analytics?${params}`);
  }

  /**
   * List ad groups in an ad account. Paginate via bookmark.
   */
  async getAdGroups(
    adAccountId: string,
    opts: { bookmark?: string; pageSize?: number; entityStatuses?: string[] } = {}
  ): Promise<{
    items: Array<{
      id: string;
      name?: string;
      campaign_id?: string;
      status?: string;
      created_time?: number;
    }>;
    bookmark?: string;
  }> {
    const params = new URLSearchParams({
      page_size: String(opts.pageSize ?? 100),
    });
    if (opts.bookmark) params.set("bookmark", opts.bookmark);
    if (opts.entityStatuses?.length) {
      params.set("entity_statuses", opts.entityStatuses.join(","));
    }
    return this.request(`/ad_accounts/${adAccountId}/ad_groups?${params}`);
  }

  /**
   * Ad-group-level paid analytics. Max 100 ad_group_ids per call.
   * Pinterest returns one entry per ad group with the requested columns +
   * AD_GROUP_ID.
   */
  async getAdGroupAnalytics(
    adAccountId: string,
    adGroupIds: string[],
    startDate: string,
    endDate: string,
    opts: {
      columns?: string[];
      granularity?: "TOTAL" | "DAY" | "HOUR" | "WEEK" | "MONTH";
      clickWindowDays?: 1 | 7 | 14 | 30 | 60;
      viewWindowDays?: 1 | 7 | 14 | 30 | 60;
      conversionReportTime?: "TIME_OF_AD_ACTION" | "TIME_OF_CONVERSION";
    } = {}
  ): Promise<Array<Record<string, number | string>>> {
    if (adGroupIds.length === 0) return [];
    const columns = opts.columns ?? [
      "SPEND_IN_DOLLAR",
      "IMPRESSION_1",
      "CLICKTHROUGH_1",
      "CTR",
      "CPM_IN_DOLLAR",
      "ECPC_IN_DOLLAR",
      "TOTAL_CHECKOUT",
      "TOTAL_CHECKOUT_VALUE_IN_MICRO_DOLLAR",
      "CHECKOUT_ROAS",
    ];
    const params = new URLSearchParams({
      ad_group_ids: adGroupIds.slice(0, 100).join(","),
      start_date: startDate,
      end_date: endDate,
      columns: columns.join(","),
      granularity: opts.granularity ?? "TOTAL",
      conversion_report_time: opts.conversionReportTime ?? "TIME_OF_CONVERSION",
      click_window_days: String(opts.clickWindowDays ?? 30),
      view_window_days: String(opts.viewWindowDays ?? 1),
    });
    return this.request(`/ad_accounts/${adAccountId}/ad_groups/analytics?${params}`);
  }

  static async exchangeCode(
    code: string,
    redirectUri: string,
    appId?: string,
    appSecret?: string,
    useSandbox = false
  ): Promise<PinterestTokens> {
    const effectiveAppId = appId || process.env.PINTEREST_APP_ID;
    const effectiveAppSecret = appSecret || process.env.PINTEREST_APP_SECRET;
    const credentials = Buffer.from(
      `${effectiveAppId}:${effectiveAppSecret}`
    ).toString("base64");

    // Trial access apps must use sandbox API for token exchange
    const tokenUrl = useSandbox ? PINTEREST_API_SANDBOX : PINTEREST_API_PROD;
    const res = await fetch(`${tokenUrl}/oauth/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Pinterest token exchange failed: ${error}`);
    }
    return res.json();
  }

  static async refreshToken(
    refreshToken: string,
    appId?: string,
    appSecret?: string
  ): Promise<PinterestTokens> {
    const effectiveAppId = appId || process.env.PINTEREST_APP_ID;
    const effectiveAppSecret = appSecret || process.env.PINTEREST_APP_SECRET;
    const credentials = Buffer.from(
      `${effectiveAppId}:${effectiveAppSecret}`
    ).toString("base64");

    const res = await fetch(`${PINTEREST_API_PROD}/oauth/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Pinterest token refresh failed: ${error}`);
    }
    return res.json();
  }

  /**
   * Full set of scopes a Pinformance org needs to drive the dashboard +
   * media-buying flow end-to-end:
   *  - boards:read/write  → list and create boards
   *  - pins:read/write    → list and post pins
   *  - user_accounts:read → identify the connected Pinterest user
   *  - ads:read/write     → read/edit campaigns, ad groups, ads,
   *                          analytics (needed by Media Buying dashboard)
   *  - catalogs:read      → read product feeds for catalog campaigns
   *  - audiences:read     → read retargeting / actalike audiences
   *
   * Pinterest only returns the subset the dev app + connected account
   * are actually approved for; the Integrations page surfaces which
   * scopes were granted vs. missing so the user can fix on Pinterest's
   * side without guessing.
   */
  static readonly REQUIRED_SCOPES = [
    "boards:read",
    "boards:write",
    "pins:read",
    "pins:write",
    "user_accounts:read",
    "ads:read",
    "ads:write",
    "catalogs:read",
    "audiences:read",
  ];

  static getAuthUrl(state: string, appId?: string): string {
    const effectiveAppId = appId || process.env.PINTEREST_APP_ID!;
    const params = new URLSearchParams({
      client_id: effectiveAppId,
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/callback/pinterest`,
      response_type: "code",
      scope: PinterestClient.REQUIRED_SCOPES.join(","),
      state,
    });
    return `https://www.pinterest.com/oauth/?${params}`;
  }
}
