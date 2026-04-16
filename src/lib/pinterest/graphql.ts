/**
 * Pinterest GraphQL client for fetching organic conversion data.
 *
 * Pinterest's public API (v5) does not expose organic conversion metrics.
 * The Conversion Insights data visible in Pinterest's web dashboard is served
 * by an internal GraphQL API at www.pinterest.com/graphql/ which requires
 * browser session cookies (not OAuth Bearer tokens).
 *
 * This module replicates those GraphQL calls using a stored session cookie.
 */

// Known Pinterest GraphQL query hashes (from DevTools network inspection)
const QUERY_HASHES = {
  // Returns per-pin conversion data with paidList metadata for organic/paid filtering
  topConversionPins: "8f5b2a4aaff21d586877d949973d8cc468082d161d81bb337928c63e3274d27a",
};

// Metric types available in conversion insights
type ConversionMetricType =
  | "totalPurchases"     // checkouts
  | "totalRevenue"       // revenue in micro-dollars
  | "totalPageVisits"    // page visits
  | "totalAddToCarts"    // add to cart
  | "pageVisitQuantity"
  | "addToCartQuantity"
  | "checkoutQuantity"
  | "checkoutValue";

export interface OrganicConversionData {
  date: string;
  page_visits: number;
  add_to_cart: number;
  checkouts: number;
  revenue: number; // in the account's currency
}

interface GraphQLPinConversion {
  id: string;
  metrics: {
    totalPurchases?: number;
    totalRevenue?: number;
    totalPageVisits?: number;
    totalAddToCarts?: number;
    [key: string]: number | undefined;
  };
  metadata?: {
    paidList?: boolean[]; // [false] = organic, [true] = paid, [false,true] = both
  };
}

interface GraphQLResponse {
  resource_response?: {
    data?: {
      v3AnalyticsTopConversionPinsGraphqlQuery?: {
        data?: {
          [metricType: string]: GraphQLPinConversion[];
        };
      };
    };
  };
  data?: {
    v3AnalyticsTopConversionPinsGraphqlQuery?: {
      data?: {
        [metricType: string]: GraphQLPinConversion[];
      };
    };
  };
}

/**
 * Build the cookie header string from the raw session cookie value.
 * The user provides the full `_pinterest_sess` cookie value.
 */
function buildCookieHeader(sessionCookie: string): string {
  // If the user pasted the full cookie string (multiple cookies), use as-is
  if (sessionCookie.includes("_pinterest_sess=")) {
    return sessionCookie;
  }
  // Otherwise wrap it as the _pinterest_sess cookie
  return `_pinterest_sess=${sessionCookie}`;
}

/**
 * Fetch organic conversion data from Pinterest's internal GraphQL API.
 * Uses the same query the web dashboard uses for Conversion Insights.
 *
 * Strategy: fetch per-pin conversion data for each metric type,
 * filter to organic-only pins (paidList includes false), and aggregate.
 */
export async function fetchOrganicConversions(
  sessionCookie: string,
  pinterestUserId: string,
  startDate: string,
  endDate: string
): Promise<{
  totals: {
    page_visits: number;
    add_to_cart: number;
    checkouts: number;
    revenue: number;
  };
  raw_responses: Record<string, unknown>;
  errors: string[];
}> {
  const errors: string[] = [];
  const rawResponses: Record<string, unknown> = {};

  const cookieHeader = buildCookieHeader(sessionCookie);

  // Common headers that Pinterest's web app sends
  const headers: Record<string, string> = {
    "Cookie": cookieHeader,
    "Accept": "application/json, text/javascript, */*, q=0.01",
    "Content-Type": "application/json",
    "X-Requested-With": "XMLHttpRequest",
    "X-Pinterest-PWS-Handler": "www/graphql.js",
    "X-Pinterest-Source": "www",
    "X-APP-VERSION": "default",
    "Referer": "https://www.pinterest.com/conversion-insights/",
    "Origin": "https://www.pinterest.com",
  };

  // We need to fetch multiple metric types and aggregate
  const metricTypes: ConversionMetricType[] = [
    "totalPageVisits",
    "totalAddToCarts",
    "totalPurchases",
  ];

  const metricTotals = {
    page_visits: 0,
    add_to_cart: 0,
    checkouts: 0,
    revenue: 0,
  };

  for (const metricType of metricTypes) {
    try {
      const variables = {
        user: pinterestUserId,
        paid: "2",              // 2 = organic only
        inProfile: "2",
        fromOwnedContent: "2",
        appTypes: "all",
        startDate,
        endDate,
        metricType,
        clickWindowDays: "30",
        viewWindowDays: "1",
      };

      // Try the Resource API pattern first (more reliable for server-side)
      const resourceData = {
        options: {
          source_url: "/conversion-insights/",
          data: {
            request: {
              name: "v3AnalyticsTopConversionPinsGraphqlQuery",
              options: variables,
            },
          },
        },
      };

      const resourceUrl = `https://www.pinterest.com/resource/v3AnalyticsTopConversionPinsGraphqlQuery/get/?data=${encodeURIComponent(JSON.stringify(resourceData))}`;

      let response: Response;
      let responseText: string;

      // Try Resource API first
      response = await fetch(resourceUrl, { headers });
      responseText = await response.text();

      // If Resource API fails, try GraphQL endpoint directly
      if (!response.ok || responseText.includes("Invalid Resource Request")) {
        const graphqlBody = {
          queryHash: QUERY_HASHES.topConversionPins,
          queryName: "v3AnalyticsTopConversionPinsGraphqlQuery",
          variables,
        };

        response = await fetch("https://www.pinterest.com/graphql/", {
          method: "POST",
          headers,
          body: JSON.stringify(graphqlBody),
        });
        responseText = await response.text();
      }

      rawResponses[metricType] = {
        status: response.status,
        contentType: response.headers.get("content-type"),
        body: responseText.slice(0, 1000),
      };

      if (!response.ok) {
        errors.push(`${metricType}: HTTP ${response.status}`);
        continue;
      }

      // Check if we got HTML instead of JSON (session expired or invalid)
      if (responseText.trim().startsWith("<!DOCTYPE") || responseText.trim().startsWith("<html")) {
        errors.push(`${metricType}: Got HTML instead of JSON — session cookie may be expired`);
        continue;
      }

      let data: GraphQLResponse;
      try {
        data = JSON.parse(responseText);
      } catch {
        errors.push(`${metricType}: Invalid JSON response`);
        continue;
      }

      // Extract pin conversion data from either response format
      const queryResult =
        data?.resource_response?.data?.v3AnalyticsTopConversionPinsGraphqlQuery?.data ||
        data?.data?.v3AnalyticsTopConversionPinsGraphqlQuery?.data;

      if (!queryResult) {
        errors.push(`${metricType}: No query result data found`);
        continue;
      }

      // The data is keyed by metric type
      const pins = queryResult[metricType] || [];

      // Sum up organic-only contributions
      for (const pin of pins) {
        const paidList = pin.metadata?.paidList || [];
        const isOrganic = paidList.includes(false);
        // Only count pins that have organic attribution
        if (!isOrganic) continue;

        const metricValue = pin.metrics?.[metricType] || 0;

        switch (metricType) {
          case "totalPageVisits":
            metricTotals.page_visits += metricValue;
            break;
          case "totalAddToCarts":
            metricTotals.add_to_cart += metricValue;
            break;
          case "totalPurchases":
            metricTotals.checkouts += metricValue;
            // Also extract revenue if available
            if (pin.metrics?.totalRevenue) {
              metricTotals.revenue += pin.metrics.totalRevenue;
            }
            break;
        }
      }
    } catch (e) {
      errors.push(`${metricType}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return {
    totals: metricTotals,
    raw_responses: rawResponses,
    errors,
  };
}

/**
 * Quick health check: verify that a Pinterest session cookie is still valid.
 * Returns true if the session works, false if expired/invalid.
 */
export async function validateSession(sessionCookie: string): Promise<boolean> {
  try {
    const cookieHeader = buildCookieHeader(sessionCookie);
    const response = await fetch("https://www.pinterest.com/resource/UserResource/get/", {
      headers: {
        "Cookie": cookieHeader,
        "Accept": "application/json",
        "X-Requested-With": "XMLHttpRequest",
        "X-Pinterest-Source": "www",
      },
    });

    if (!response.ok) return false;

    const text = await response.text();
    // If we get JSON back (not HTML), the session is valid
    if (text.trim().startsWith("{") || text.trim().startsWith("[")) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
