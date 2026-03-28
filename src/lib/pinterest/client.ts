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
      scope: "boards:read,boards:write,pins:read,pins:write,user_accounts:read",
      state,
    });
    return `https://www.pinterest.com/oauth/?${params}`;
  }
}
