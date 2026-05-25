import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/encryption";
import { PinterestClient, MAX_PINTEREST_FETCH, extractPinImageUrl, fetchPinOgImage } from "@/lib/pinterest/client";
import { selectAdAccount } from "@/lib/pinterest/select-ad-account";
import { getOrgIdFromProfile } from "@/lib/auth/effective-org";
import { generateWeeklyReport } from "@/lib/reports/weekly-report";
import { contentDisposition } from "@/lib/reports/content-disposition";

type KpiKey = "roas" | "cpa" | "revenue" | "spend" | "checkouts";

interface AdRow {
  ad_id: string;
  ad_name: string;
  pin_id: string | null;
  image_url: string | null;
  spend: number | null;
  revenue: number | null;
  purchases: number | null;
  impressions: number | null;
  clicks: number | null;
  roas: number | null;
  cpa: number | null;
  created_at: string | null;
}

interface RequestBody {
  start_date: string;
  end_date: string;
  click_window: number;
  view_window: number;
  top_n: number;
  top_kpi: KpiKey;
  recent_n: number;
  recent_kpi: KpiKey;
  recent_since: string;
  manual_notes: string;
  report_name?: string;
  // Minimum-KPI thresholds — drop ads below these before ranking.
  // CPA is a MAX (lower is better); the others are MINs. null = no
  // constraint.
  min_spend?: number | null;
  min_revenue?: number | null;
  min_checkouts?: number | null;
  min_roas?: number | null;
  max_cpa?: number | null;
}

function passesMinFilters(r: AdRow, body: RequestBody): boolean {
  if (body.min_spend != null && (r.spend ?? 0) < body.min_spend) return false;
  if (body.min_revenue != null && (r.revenue ?? 0) < body.min_revenue)
    return false;
  if (body.min_checkouts != null && (r.purchases ?? 0) < body.min_checkouts)
    return false;
  if (body.min_roas != null && (r.roas ?? 0) < body.min_roas) return false;
  if (body.max_cpa != null) {
    if (r.cpa == null || r.cpa <= 0 || r.cpa > body.max_cpa) return false;
  }
  return true;
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  const parsed = Number(v);
  return isNaN(parsed) ? null : parsed;
}

function sortByKpi(rows: AdRow[], kpi: KpiKey): AdRow[] {
  const directions: Record<KpiKey, "asc" | "desc"> = {
    roas: "desc",
    revenue: "desc",
    spend: "desc",
    checkouts: "desc",
    cpa: "asc",
  };
  const dir = directions[kpi];
  const getVal = (r: AdRow): number => {
    switch (kpi) {
      case "roas":
        return r.roas ?? -Infinity;
      case "cpa":
        return r.cpa != null && r.cpa > 0 ? r.cpa : Number.POSITIVE_INFINITY;
      case "revenue":
        return r.revenue ?? -Infinity;
      case "spend":
        return r.spend ?? -Infinity;
      case "checkouts":
        return r.purchases ?? -Infinity;
    }
  };
  return [...rows].sort((a, b) => {
    const av = getVal(a);
    const bv = getVal(b);
    return dir === "desc" ? bv - av : av - bv;
  });
}

function formatDateRangeLabel(start: string, end: string): string {
  const fmt = (iso: string) =>
    new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  if (start === end) return fmt(start);
  return `${fmt(start)} – ${fmt(end)}`;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("users")
    .select("org_id, role, active_org_id")
    .eq("id", user.id)
    .single();
  const orgId = getOrgIdFromProfile(profile);
  if (!orgId) return NextResponse.json({ error: "No org" }, { status: 400 });

  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organizations")
    .select("name, pinterest_access_token_encrypted, settings")
    .eq("id", orgId)
    .single();
  if (!org?.pinterest_access_token_encrypted) {
    return NextResponse.json({ error: "Pinterest not connected" }, { status: 400 });
  }

  const body = (await request.json()) as RequestBody;
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(body.start_date) || !dateRe.test(body.end_date)) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }

  const allowedWindows = new Set([1, 7, 14, 30, 60]);
  const clickWindow = (allowedWindows.has(body.click_window) ? body.click_window : 30) as 1 | 7 | 14 | 30 | 60;
  const viewWindow = (allowedWindows.has(body.view_window) ? body.view_window : 1) as 1 | 7 | 14 | 30 | 60;

  try {
    const token = decrypt(org.pinterest_access_token_encrypted);
    const isTrial = ((org.settings as Record<string, unknown>)?.pinterest_access_tier as string) === "trial";
    const client = new PinterestClient(token, isTrial);

    const settings = (org.settings as Record<string, unknown>) || {};
    const preferredAdAccountId =
      typeof settings.pinterest_ad_account_id === "string"
        ? settings.pinterest_ad_account_id
        : null;
    const { chosen: adAccount } = await selectAdAccount(
      client,
      org.name as string | null,
      preferredAdAccountId
    );
    if (!adAccount) {
      return NextResponse.json({ error: "No ad account on Pinterest" }, { status: 400 });
    }

    // Fetch all ads (paginated). Pinterest returns ads newest-first, so
    // recent ads (often no spend yet) come back first. To find ads WITH
    // spend on accounts that have 1000+ ads (like Nordheim's 3000+),
    // we need a high cap — matches the dashboard's MAX_ADS_TO_FETCH=3000.
    const adList: Array<{
      id: string;
      name?: string;
      pin_id?: string;
      created_time?: number;
    }> = [];
    let bookmark: string | undefined;
    do {
      const page = await client.getAds(adAccount.id, {
        bookmark,
        pageSize: 250,
        entityStatuses: ["ACTIVE", "PAUSED", "ARCHIVED", "DRAFT"],
      });
      adList.push(...(page.items || []));
      bookmark = page.bookmark;
      if (adList.length >= MAX_PINTEREST_FETCH) break;
    } while (bookmark);

    // Fetch analytics in batches.
    const byAdId = new Map<string, Record<string, number | string>>();
    for (let i = 0; i < adList.length; i += 100) {
      const batch = adList.slice(i, i + 100).map((a) => a.id);
      const analytics = await client.getAdAnalytics(
        adAccount.id,
        batch,
        body.start_date,
        body.end_date,
        {
          clickWindowDays: clickWindow,
          viewWindowDays: viewWindow,
          conversionReportTime: "TIME_OF_CONVERSION",
        }
      );
      for (const row of analytics || []) {
        const adId = String(row["AD_ID"] ?? "");
        if (adId) byAdId.set(adId, row);
      }
    }

    const rows: AdRow[] = adList.map((a) => {
      const m = byAdId.get(a.id) || {};
      const spend = num(m["SPEND_IN_DOLLAR"]);
      const purchases = num(m["TOTAL_CHECKOUT"]);
      const revenueMicro = num(m["TOTAL_CHECKOUT_VALUE_IN_MICRO_DOLLAR"]);
      const revenue = revenueMicro != null ? revenueMicro / 1_000_000 : null;
      let roas = num(m["CHECKOUT_ROAS"]);
      if (roas == null && spend != null && spend > 0 && revenue != null) {
        roas = revenue / spend;
      }
      const cpa = purchases != null && purchases > 0 && spend != null ? spend / purchases : null;
      return {
        ad_id: a.id,
        ad_name: a.name || `Ad ${a.id.slice(-6)}`,
        pin_id: a.pin_id || null,
        image_url: null as string | null,
        spend,
        revenue,
        purchases,
        impressions: num(m["IMPRESSION_1"]),
        clicks: num(m["CLICKTHROUGH_1"]),
        roas,
        cpa,
        created_at: a.created_time ? new Date(a.created_time * 1000).toISOString() : null,
      };
    });

    // Top performers: rank ALL ads with spend by chosen KPI, take top N.
    const withSpend = rows.filter((r) => r.spend != null && r.spend > 0);
    // Apply the user-supplied min-KPI thresholds BEFORE ranking so the
    // top-N list reflects only ads that clear the noise floor (e.g. min
    // ROAS 1.5, min spend €50). Same filter is used for Recently launched.
    const filtered = withSpend.filter((r) => passesMinFilters(r, body));
    const topAds = sortByKpi(filtered, body.top_kpi).slice(0, body.top_n);

    // Recently launched: ads created on/after recent_since, rank by chosen KPI, take top N.
    // Min-KPI thresholds applied here too so recent-but-noisy outliers are hidden.
    let recentAds: AdRow[] = rows;
    if (dateRe.test(body.recent_since)) {
      const cutoff = body.recent_since + "T00:00:00Z";
      recentAds = rows.filter((r) => r.created_at && r.created_at >= cutoff);
    }
    recentAds = recentAds.filter((r) => passesMinFilters(r, body));
    recentAds = sortByKpi(recentAds, body.recent_kpi).slice(0, body.recent_n);

    // Resolve creative thumbnails for ads that will appear in the report.
    const selectedAds = Array.from(
      new Map(
        [...topAds, ...recentAds]
          .filter((a) => a.pin_id)
          .map((a) => [a.ad_id, a] as const)
      ).values()
    );
    const imageByAdId = new Map<string, string>();
    const adAccountIdForPins = adAccount.id;
    await Promise.all(
      selectedAds.map(async (ad) => {
        if (!ad.pin_id) return;
        try {
          const pin = await client.getPin(ad.pin_id, adAccountIdForPins);
          const url = extractPinImageUrl(pin);
          if (url) {
            imageByAdId.set(ad.ad_id, url);
            return;
          }
        } catch {
          // continue to og fallback
        }
        const og = await fetchPinOgImage(ad.pin_id);
        if (og) imageByAdId.set(ad.ad_id, og);
      })
    );
    for (const a of topAds) a.image_url = imageByAdId.get(a.ad_id) || null;
    for (const a of recentAds) a.image_url = imageByAdId.get(a.ad_id) || null;

    const buffer = await generateWeeklyReport({
      client_name: org.name || "",
      date_range_label: formatDateRangeLabel(body.start_date, body.end_date),
      currency: adAccount.currency || "USD",
      top_section: {
        n: body.top_n,
        kpi: body.top_kpi,
        ads: topAds,
      },
      recent_section: {
        n: body.recent_n,
        kpi: body.recent_kpi,
        since_date: body.recent_since || body.start_date,
        ads: recentAds,
      },
      manual_notes: body.manual_notes || "",
    });

    // Use the user-supplied report name when provided; sanitize for use as a
    // filename. Falls back to the original auto-generated name.
    const safeClient = (org.name || "client").replace(/[^a-z0-9-]+/gi, "-");
    const requested = (body.report_name || "").trim();
    let filename: string;
    if (requested) {
      // Strip filesystem-hostile characters; keep spaces, letters, digits,
      // common punctuation. Cap length.
      const sanitized = requested
        .replace(/[\\/:*?"<>|\r\n\t]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 120);
      filename = sanitized
        ? `${sanitized}.docx`
        : `Pinterest-Report-${safeClient}-${body.start_date}-to-${body.end_date}.docx`;
    } else {
      filename = `Pinterest-Report-${safeClient}-${body.start_date}-to-${body.end_date}.docx`;
    }

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": contentDisposition(filename),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
