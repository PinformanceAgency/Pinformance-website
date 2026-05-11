import type {
  PinterestBoard,
  PinterestPin,
  PinterestTokens,
  PinterestUserAccount,
} from "./types";

const PINTEREST_API_PROD = "https://api.pinterest.com/v5";
const PINTEREST_API_SANDBOX = "https://api-sandbox.pinterest.com/v5";

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
    return this.request<{
      id: string;
      title?: string;
      description?: string;
      link?: string;
      media?: {
        media_type?: string;
        images?: Record<string, { url: string; width: number; height: number }>;
      };
    }>(`/pins/${pinId}${qs}`);
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
      granularity: "TOTAL",
      conversion_report_time: opts.conversionReportTime ?? "TIME_OF_CONVERSION",
      click_window_days: String(opts.clickWindowDays ?? 30),
      view_window_days: String(opts.viewWindowDays ?? 1),
      engagement_window_days: String(opts.clickWindowDays ?? 30),
    });
    return this.request(`/ad_accounts/${adAccountId}/ads/analytics?${params}`);
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

  static getAuthUrl(state: string, appId?: string): string {
    const effectiveAppId = appId || process.env.PINTEREST_APP_ID!;
    const params = new URLSearchParams({
      client_id: effectiveAppId,
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/callback/pinterest`,
      response_type: "code",
      scope: "boards:read,boards:write,pins:read,pins:write,user_accounts:read,ads:read",
      state,
    });
    return `https://www.pinterest.com/oauth/?${params}`;
  }
}
