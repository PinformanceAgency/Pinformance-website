/**
 * Generate a Media Buying .docx report from a structured config the modal
 * sends in. Config has per-section + per-dimension toggles so the user can
 * fully customize what ends up in the doc.
 *
 * Data sources reused from the per-tab APIs:
 *  - Account Overview → same Pinterest calls as /api/pinterest/media-buying
 *  - Campaign / Ad Group / Ad level → same calls as their respective routes
 *
 * Chart-in-document rendering is deferred (see media-buying-report.ts).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/encryption";
import { PinterestClient } from "@/lib/pinterest/client";
import { selectAdAccount } from "@/lib/pinterest/select-ad-account";
import { getOrgIdFromProfile } from "@/lib/auth/effective-org";
import {
  parseCampaignName,
  parseAdGroupName,
  parseAdName,
  type CampaignParsed,
  type AdGroupParsed,
  type AdParsed,
} from "@/lib/pinterest/naming-conventions";
import {
  generateMediaBuyingReport,
  type ReportDimensionRow,
  type ReportDimensionSection,
  type ReportInput,
  type ReportLandingPage,
  type ViewMode,
} from "@/lib/reports/media-buying-report";

// ---- Dimension catalogs (kept in sync with the level pages) ----

type Level = "campaign" | "adGroup" | "ad";

interface DimensionMeta {
  key: string;
  title: string;
  description: string;
  order?: string[];
  label: (v: string) => string;
  hint?: (v: string) => string | null;
}

function titleCase(v: string): string {
  return v.charAt(0).toUpperCase() + v.slice(1).toLowerCase();
}

const CAMPAIGN_DIMENSIONS: DimensionMeta[] = [
  {
    key: "country",
    title: "Per Country",
    description: "Total performance per market (parsed from the campaign-name country token).",
    label: (v) => v,
  },
  {
    key: "catalog",
    title: "Catalog vs Non-catalog",
    description: "CAT = catalog campaigns (product feed). Non-catalog campaigns omit the CAT token.",
    order: ["CAT", "NON_CAT"],
    label: (v) => (v === "CAT" ? "Catalog" : "Non-catalog"),
    hint: (v) => (v === "CAT" ? "CAT" : null),
  },
  {
    key: "performancePlus",
    title: "Performance+ vs Non-Performance+",
    description: "P+ uses Pinterest's Performance+ automation; NP+ is manually structured.",
    order: ["P+", "NP+"],
    label: (v) => (v === "P+" ? "Performance+" : "Non-Performance+"),
    hint: (v) => v,
  },
  {
    key: "funnel",
    title: "Prospecting vs Retargeting",
    description: "PROSP = cold audiences; RET = warm audiences.",
    order: ["PROSP", "RET"],
    label: (v) => (v === "PROSP" ? "Prospecting" : "Retargeting"),
    hint: (v) => v,
  },
  {
    key: "strategy",
    title: "Test / Hero / Category",
    description: "TEST = testing. HERO = scaled winners. CATG = category-focused.",
    order: ["HERO", "TEST", "CATG"],
    label: (v) =>
      v === "HERO" ? "Hero" : v === "TEST" ? "Test" : v === "CATG" ? "Category" : v,
    hint: (v) => v,
  },
  {
    key: "objective",
    title: "Conversion vs ROAS",
    description: "CONV = conversion-count objective. ROAS = value-based.",
    order: ["CONV", "ROAS"],
    label: (v) => (v === "CONV" ? "Conversion" : "ROAS"),
    hint: (v) => v,
  },
];

const AD_GROUP_DIMENSIONS: DimensionMeta[] = [
  {
    key: "gender",
    title: "Per Gender",
    description: "Gender targeting parsed from each ad-group name.",
    order: ["F", "M", "ALL"],
    label: (v) => (v === "F" ? "Female" : v === "M" ? "Male" : "All genders"),
    hint: (v) => v,
  },
  {
    key: "age",
    title: "Per Age Bucket",
    description: "Age range parsed from the ad-group name (e.g. 18-24, 25-34).",
    label: (v) => v,
  },
  {
    key: "audience",
    title: "Per Audience",
    description: "Audience targeting: Broad, retention windows, ACL clusters, etc.",
    label: (v) => v,
  },
  {
    key: "funnel",
    title: "Prospecting vs Retargeting",
    description: "Funnel stage at the ad-group level.",
    order: ["PROSP", "RET"],
    label: (v) => (v === "PROSP" ? "Prospecting" : "Retargeting"),
    hint: (v) => v,
  },
  {
    key: "category",
    title: "Per Category / Product Scope",
    description: "Product scope (Swim, Bra, BestSellers, etc.).",
    label: (v) => v,
  },
];

const AD_DIMENSIONS: DimensionMeta[] = [
  {
    key: "format",
    title: "Per Format",
    description: "Creative format — Video / Static / Carousel / Collection.",
    order: ["VIDEO", "STATIC", "CAROUSEL", "COLLECTION"],
    label: titleCase,
    hint: (v) => v,
  },
  {
    key: "contentType",
    title: "Organic-style vs Ad-style",
    description: "ORGANIC = organic-style creative. AD = ad-first creative.",
    order: ["AD", "ORGANIC"],
    label: (v) => (v === "AD" ? "Ad-style" : "Organic-style"),
    hint: (v) => v,
  },
  {
    key: "creatorType",
    title: "Per Creator Type",
    description: "Who created the asset — UGC, Shoot, Graphic, Founder, Influencer, Brand.",
    order: ["UGC", "SHOOT", "GRAPHIC", "FOUNDER", "INFLUENCER", "BRAND"],
    label: titleCase,
    hint: (v) => v,
  },
  {
    key: "category",
    title: "Per Category",
    description: "Product category parsed from the ad name.",
    label: (v) => v,
  },
  {
    key: "offer",
    title: "Per Offer",
    description: "Offer tag (BAU / 2FOR1 / 20OFF / BOGO / Bundle).",
    label: (v) => v,
  },
  {
    key: "lpType",
    title: "Per Landing Page Type",
    description: "Destination — product / collection / page.",
    order: ["PRODUCT", "COLLECTION", "PAGE"],
    label: titleCase,
    hint: (v) => `/${v.toLowerCase()}`,
  },
];

function getDimensionMeta(level: Level, key: string): DimensionMeta | null {
  const catalog =
    level === "campaign"
      ? CAMPAIGN_DIMENSIONS
      : level === "adGroup"
        ? AD_GROUP_DIMENSIONS
        : AD_DIMENSIONS;
  return catalog.find((d) => d.key === key) || null;
}

// ---- Helpers ----

function num(v: unknown): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  const p = Number(v);
  return isNaN(p) ? 0 : p;
}

function previousRange(startISO: string, endISO: string): { start: string; end: string } {
  const start = new Date(startISO + "T00:00:00Z");
  const end = new Date(endISO + "T00:00:00Z");
  const days = Math.max(
    1,
    Math.round((end.getTime() - start.getTime()) / (24 * 3600 * 1000)) + 1
  );
  const prevEnd = new Date(start);
  prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setUTCDate(prevStart.getUTCDate() - (days - 1));
  return {
    start: prevStart.toISOString().split("T")[0],
    end: prevEnd.toISOString().split("T")[0],
  };
}

function normalizeUrl(rawUrl: string | null | undefined): string {
  if (!rawUrl) return "(no link)";
  try {
    const u = new URL(rawUrl);
    const hostname = u.hostname.replace(/^www\./, "");
    let path = u.pathname.replace(/\/+$/, "");
    if (!path) path = "/";
    return `${hostname}${path}`;
  } catch {
    return rawUrl;
  }
}

function fmtDateLabel(startISO: string, endISO: string): string {
  const start = new Date(startISO + "T00:00:00Z");
  const end = new Date(endISO + "T00:00:00Z");
  const fmt: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  };
  const fmtY: Intl.DateTimeFormatOptions = { ...fmt, year: "numeric" };
  return `${start.toLocaleDateString("en-US", fmt)} – ${end.toLocaleDateString("en-US", fmtY)}`;
}

function deltaPct(curr: number, prev: number): number | null {
  if (!isFinite(curr) || !isFinite(prev) || prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

// ---- Aggregation over a parsed-entity list ----

interface EntityForReport<P> {
  parsed: P;
  spend: number;
  revenue: number;
  conversions: number;
}

function aggregateByDimension<P extends object>(
  entities: EntityForReport<P>[],
  meta: DimensionMeta
): ReportDimensionRow[] {
  const byValue = new Map<string, EntityForReport<P>[]>();
  for (const e of entities) {
    const raw = (e.parsed as unknown as Record<string, unknown>)[meta.key];
    if (raw == null) continue;
    const v = String(raw);
    const arr = byValue.get(v) || [];
    arr.push(e);
    byValue.set(v, arr);
  }
  const rows: ReportDimensionRow[] = Array.from(byValue.entries()).map(
    ([value, group]) => {
      let spend = 0,
        revenue = 0,
        conversions = 0;
      for (const e of group) {
        spend += e.spend;
        revenue += e.revenue;
        conversions += e.conversions;
      }
      const roas = spend > 0 ? revenue / spend : 0;
      const cpa = conversions > 0 ? spend / conversions : null;
      return {
        label: meta.label(value),
        hint: meta.hint ? meta.hint(value) : null,
        count: group.length,
        spend,
        revenue,
        conversions,
        roas,
        cpa,
      };
    }
  );
  if (meta.order) {
    const idx = new Map(meta.order.map((v, i) => [v, i]));
    rows.sort((a, b) => {
      // Sort by order, falling back to spend desc.
      const ai = idx.get(a.label) ?? 999; // labels may differ from raw values; this fallback is best-effort
      const bi = idx.get(b.label) ?? 999;
      return ai - bi || b.spend - a.spend;
    });
  } else {
    rows.sort((a, b) => b.spend - a.spend);
  }
  return rows;
}

// ---- Request shape ----

interface RequestBody {
  start_date: string;
  end_date: string;
  click_window?: number;
  view_window?: number;
  report_name?: string;
  notes?: string;
  sections: {
    overview?: {
      kpis: boolean;
      landingPages: boolean;
    };
    campaignLevel?: {
      dimensions: Array<{ key: string; viewMode: ViewMode }>;
    };
    adGroupLevel?: {
      dimensions: Array<{ key: string; viewMode: ViewMode }>;
    };
    adLevel?: {
      dimensions: Array<{ key: string; viewMode: ViewMode }>;
      topAds?: { count: number; sortKey: "spend" | "roas" | "revenue" | "conversions" };
    };
  };
}

// ---- Route ----

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(body.start_date) || !dateRe.test(body.end_date)) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }
  const allowed = new Set([1, 7, 14, 30, 60]);
  const clickWindow = (allowed.has(body.click_window ?? 30) ? body.click_window ?? 30 : 30) as
    | 1
    | 7
    | 14
    | 30
    | 60;
  const viewWindow = (allowed.has(body.view_window ?? 1) ? body.view_window ?? 1 : 1) as
    | 1
    | 7
    | 14
    | 30
    | 60;

  try {
    const token = decrypt(org.pinterest_access_token_encrypted);
    const isTrial =
      ((org.settings as Record<string, unknown>)?.pinterest_access_tier as string) === "trial";
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
      return NextResponse.json({ error: "No ad account" }, { status: 400 });
    }

    const opts = {
      clickWindowDays: clickWindow,
      viewWindowDays: viewWindow,
      conversionReportTime: "TIME_OF_CONVERSION" as const,
    };
    const currency = adAccount.currency || "USD";

    const reportInput: ReportInput = {
      client_name: (org.name as string) || "Account",
      date_range_label: fmtDateLabel(body.start_date, body.end_date),
      currency,
      notes: body.notes || "",
    };

    // ----- Account Overview -----
    if (
      body.sections.overview &&
      (body.sections.overview.kpis || body.sections.overview.landingPages)
    ) {
      const overview: NonNullable<ReportInput["overview"]> = {};

      if (body.sections.overview.kpis) {
        const curResp = (await client.getAdAccountAnalytics(
          adAccount.id,
          body.start_date,
          body.end_date,
          opts
        )) as Array<Record<string, number | string>>;
        const c = curResp?.[0] || {};
        const prev = previousRange(body.start_date, body.end_date);
        const prevResp = (await client.getAdAccountAnalytics(
          adAccount.id,
          prev.start,
          prev.end,
          opts
        )) as Array<Record<string, number | string>>;
        const pRow = prevResp?.[0] || {};
        const curSpend = num(c["SPEND_IN_DOLLAR"]);
        const curRevenue = num(c["TOTAL_CHECKOUT_VALUE_IN_MICRO_DOLLAR"]) / 1_000_000;
        const curConv = num(c["TOTAL_CHECKOUT"]);
        let curRoas = num(c["CHECKOUT_ROAS"]);
        if (!curRoas && curSpend > 0) curRoas = curRevenue / curSpend;
        const curCpa = curConv > 0 ? curSpend / curConv : null;
        const prevSpend = num(pRow["SPEND_IN_DOLLAR"]);
        const prevRevenue = num(pRow["TOTAL_CHECKOUT_VALUE_IN_MICRO_DOLLAR"]) / 1_000_000;
        const prevConv = num(pRow["TOTAL_CHECKOUT"]);
        let prevRoas = num(pRow["CHECKOUT_ROAS"]);
        if (!prevRoas && prevSpend > 0) prevRoas = prevRevenue / prevSpend;
        const prevCpa = prevConv > 0 ? prevSpend / prevConv : null;
        overview.kpis = {
          spend: curSpend,
          revenue: curRevenue,
          conversions: curConv,
          roas: curRoas,
          cpa: curCpa,
          spend_delta_pct: deltaPct(curSpend, prevSpend),
          revenue_delta_pct: deltaPct(curRevenue, prevRevenue),
          conversions_delta_pct: deltaPct(curConv, prevConv),
          roas_delta_pct: deltaPct(curRoas, prevRoas),
          cpa_delta_pct:
            curCpa != null && prevCpa != null ? deltaPct(curCpa, prevCpa) : null,
        };
      }

      if (body.sections.overview.landingPages) {
        // Pull all ads + per-ad analytics + resolve pin URLs.
        const adList: Array<{ id: string; pin_id?: string }> = [];
        let bookmark: string | undefined;
        do {
          const page = await client.getAds(adAccount.id, {
            bookmark,
            pageSize: 250,
          });
          adList.push(...(page.items || []));
          bookmark = page.bookmark;
          if (adList.length >= 3000) break;
        } while (bookmark);
        const adAnalytics = new Map<string, Record<string, number | string>>();
        for (let i = 0; i < adList.length; i += 100) {
          const batch = adList.slice(i, i + 100).map((a) => a.id);
          const rows = await client.getAdAnalytics(
            adAccount.id,
            batch,
            body.start_date,
            body.end_date,
            opts
          );
          for (const r of rows || []) {
            const adId = String(r["AD_ID"] ?? "");
            if (adId) adAnalytics.set(adId, r);
          }
        }
        const adsWithSpend = adList.filter((a) => {
          const m = adAnalytics.get(a.id);
          return m && num(m["SPEND_IN_DOLLAR"]) > 0 && a.pin_id;
        });
        const pinLinkCache = new Map<string, string>();
        for (let i = 0; i < adsWithSpend.length; i += 10) {
          const batch = adsWithSpend.slice(i, i + 10);
          await Promise.all(
            batch.map(async (a) => {
              if (!a.pin_id || pinLinkCache.has(a.pin_id)) return;
              try {
                const pin = await client.getPin(a.pin_id, adAccount.id);
                if (pin.link) pinLinkCache.set(a.pin_id, pin.link);
              } catch {}
            })
          );
          if (i + 10 < adsWithSpend.length) {
            await new Promise((res) => setTimeout(res, 80));
          }
        }
        const byUrl = new Map<
          string,
          { adIds: Set<string>; spend: number; revenue: number; conversions: number }
        >();
        for (const a of adsWithSpend) {
          const link = a.pin_id ? pinLinkCache.get(a.pin_id) || null : null;
          const url = normalizeUrl(link);
          const m = adAnalytics.get(a.id)!;
          const cur = byUrl.get(url) || {
            adIds: new Set<string>(),
            spend: 0,
            revenue: 0,
            conversions: 0,
          };
          cur.adIds.add(a.id);
          cur.spend += num(m["SPEND_IN_DOLLAR"]);
          cur.revenue += num(m["TOTAL_CHECKOUT_VALUE_IN_MICRO_DOLLAR"]) / 1_000_000;
          cur.conversions += num(m["TOTAL_CHECKOUT"]);
          byUrl.set(url, cur);
        }
        const landingPages: ReportLandingPage[] = Array.from(byUrl.entries())
          .map(([url, agg]) => ({
            url,
            ad_count: agg.adIds.size,
            spend: agg.spend,
            conversions: agg.conversions,
            revenue: agg.revenue,
            roas: agg.spend > 0 ? agg.revenue / agg.spend : 0,
            cpa: agg.conversions > 0 ? agg.spend / agg.conversions : null,
          }))
          .sort((a, b) => b.spend - a.spend);
        overview.landingPages = landingPages;
      }

      reportInput.overview = overview;
    }

    // ----- Campaign Level -----
    if (
      body.sections.campaignLevel &&
      body.sections.campaignLevel.dimensions.length > 0
    ) {
      const reqDims = body.sections.campaignLevel.dimensions;
      const campaigns: Array<{ id: string; name?: string }> = [];
      let bookmark: string | undefined;
      do {
        const page = await client.getCampaigns(adAccount.id, {
          bookmark,
          pageSize: 250,
        });
        campaigns.push(...(page.items || []));
        bookmark = page.bookmark;
        if (campaigns.length >= 3000) break;
      } while (bookmark);

      const analyticsByCampaign = new Map<string, Record<string, number | string>>();
      for (let i = 0; i < campaigns.length; i += 100) {
        const batch = campaigns.slice(i, i + 100).map((c) => c.id);
        const rows = await client.getCampaignAnalytics(
          adAccount.id,
          batch,
          body.start_date,
          body.end_date,
          opts
        );
        for (const r of rows || []) {
          const cid = String(r["CAMPAIGN_ID"] ?? "");
          if (cid) analyticsByCampaign.set(cid, r);
        }
      }
      const entities: Array<EntityForReport<CampaignParsed>> = campaigns.map((c) => {
        const m = analyticsByCampaign.get(c.id) || {};
        const spend = num(m["SPEND_IN_DOLLAR"]);
        const revenue = num(m["TOTAL_CHECKOUT_VALUE_IN_MICRO_DOLLAR"]) / 1_000_000;
        const conversions = num(m["TOTAL_CHECKOUT"]);
        return {
          parsed: parseCampaignName(c.name || ""),
          spend,
          revenue,
          conversions,
        };
      });
      const dimensions: ReportDimensionSection[] = [];
      for (const req of reqDims) {
        const meta = getDimensionMeta("campaign", req.key);
        if (!meta) continue;
        const rows = aggregateByDimension(entities, meta);
        if (rows.length === 0) continue;
        dimensions.push({
          title: meta.title,
          description: meta.description,
          viewMode: req.viewMode,
          rows,
          valueColumnLabel: "Value",
          countColumnLabel: "Campaigns",
        });
      }
      if (dimensions.length > 0) reportInput.campaignLevel = { dimensions };
    }

    // ----- Ad Group Level -----
    if (
      body.sections.adGroupLevel &&
      body.sections.adGroupLevel.dimensions.length > 0
    ) {
      const reqDims = body.sections.adGroupLevel.dimensions;
      const adGroups: Array<{ id: string; name?: string }> = [];
      let bookmark: string | undefined;
      do {
        const page = await client.getAdGroups(adAccount.id, {
          bookmark,
          pageSize: 250,
        });
        adGroups.push(...(page.items || []));
        bookmark = page.bookmark;
        if (adGroups.length >= 5000) break;
      } while (bookmark);
      const analyticsByAdGroup = new Map<string, Record<string, number | string>>();
      for (let i = 0; i < adGroups.length; i += 100) {
        const batch = adGroups.slice(i, i + 100).map((g) => g.id);
        const rows = await client.getAdGroupAnalytics(
          adAccount.id,
          batch,
          body.start_date,
          body.end_date,
          opts
        );
        for (const r of rows || []) {
          const gid = String(r["AD_GROUP_ID"] ?? "");
          if (gid) analyticsByAdGroup.set(gid, r);
        }
      }
      const entities: Array<EntityForReport<AdGroupParsed>> = [];
      for (const g of adGroups) {
        const m = analyticsByAdGroup.get(g.id) || {};
        const spend = num(m["SPEND_IN_DOLLAR"]);
        if (spend === 0) continue;
        const revenue = num(m["TOTAL_CHECKOUT_VALUE_IN_MICRO_DOLLAR"]) / 1_000_000;
        const conversions = num(m["TOTAL_CHECKOUT"]);
        entities.push({
          parsed: parseAdGroupName(g.name || ""),
          spend,
          revenue,
          conversions,
        });
      }
      const dimensions: ReportDimensionSection[] = [];
      for (const req of reqDims) {
        const meta = getDimensionMeta("adGroup", req.key);
        if (!meta) continue;
        const rows = aggregateByDimension(entities, meta);
        if (rows.length === 0) continue;
        dimensions.push({
          title: meta.title,
          description: meta.description,
          viewMode: req.viewMode,
          rows,
          valueColumnLabel: "Value",
          countColumnLabel: "Ad groups",
        });
      }
      if (dimensions.length > 0) reportInput.adGroupLevel = { dimensions };
    }

    // ----- Ad Level -----
    if (
      body.sections.adLevel &&
      (body.sections.adLevel.dimensions.length > 0 || body.sections.adLevel.topAds)
    ) {
      const reqDims = body.sections.adLevel.dimensions;
      const topAdsReq = body.sections.adLevel.topAds;
      const ads: Array<{ id: string; name?: string; pin_id?: string; created_time?: number }> =
        [];
      let bookmark: string | undefined;
      do {
        const page = await client.getAds(adAccount.id, {
          bookmark,
          pageSize: 250,
        });
        ads.push(...(page.items || []));
        bookmark = page.bookmark;
        if (ads.length >= 5000) break;
      } while (bookmark);
      const analyticsByAd = new Map<string, Record<string, number | string>>();
      for (let i = 0; i < ads.length; i += 100) {
        const batch = ads.slice(i, i + 100).map((a) => a.id);
        const rows = await client.getAdAnalytics(
          adAccount.id,
          batch,
          body.start_date,
          body.end_date,
          opts
        );
        for (const r of rows || []) {
          const aid = String(r["AD_ID"] ?? "");
          if (aid) analyticsByAd.set(aid, r);
        }
      }
      interface AdEntity extends EntityForReport<AdParsed> {
        id: string;
        name: string;
        pin_id: string | null;
        created_time: number | null;
        roas: number;
        cpa: number | null;
      }
      const entities: AdEntity[] = [];
      for (const a of ads) {
        const m = analyticsByAd.get(a.id) || {};
        const spend = num(m["SPEND_IN_DOLLAR"]);
        if (spend === 0) continue;
        const revenue = num(m["TOTAL_CHECKOUT_VALUE_IN_MICRO_DOLLAR"]) / 1_000_000;
        const conversions = num(m["TOTAL_CHECKOUT"]);
        const roas = spend > 0 ? revenue / spend : 0;
        const cpa = conversions > 0 ? spend / conversions : null;
        entities.push({
          id: a.id,
          name: a.name || "(unnamed)",
          pin_id: a.pin_id ?? null,
          created_time: a.created_time ?? null,
          parsed: parseAdName(a.name || ""),
          spend,
          revenue,
          conversions,
          roas,
          cpa,
        });
      }
      const dimensions: ReportDimensionSection[] = [];
      for (const req of reqDims) {
        const meta = getDimensionMeta("ad", req.key);
        if (!meta) continue;
        const rows = aggregateByDimension(entities, meta);
        if (rows.length === 0) continue;
        dimensions.push({
          title: meta.title,
          description: meta.description,
          viewMode: req.viewMode,
          rows,
          valueColumnLabel: "Value",
          countColumnLabel: "Ads",
        });
      }
      const adLevel: NonNullable<ReportInput["adLevel"]> = { dimensions };
      if (topAdsReq && topAdsReq.count > 0) {
        const sorted = [...entities].sort((a, b) => {
          switch (topAdsReq.sortKey) {
            case "roas":
              return b.roas - a.roas;
            case "revenue":
              return b.revenue - a.revenue;
            case "conversions":
              return b.conversions - a.conversions;
            default:
              return b.spend - a.spend;
          }
        });
        adLevel.topAds = {
          title: `Top ${topAdsReq.count} ads by ${topAdsReq.sortKey.toUpperCase()}`,
          description: `The ${topAdsReq.count} highest-${topAdsReq.sortKey} ads in the selected period.`,
          ads: sorted.slice(0, topAdsReq.count).map((a) => ({
            name: a.name,
            pin_id: a.pin_id,
            created_time: a.created_time,
            spend: a.spend,
            revenue: a.revenue,
            conversions: a.conversions,
            roas: a.roas,
            cpa: a.cpa,
          })),
        };
      }
      if (adLevel.dimensions.length > 0 || adLevel.topAds) {
        reportInput.adLevel = adLevel;
      }
    }

    const docBuffer = generateMediaBuyingReport(reportInput);

    const baseName =
      (body.report_name || "").trim() ||
      `Media-Buying-Report-${body.start_date}-to-${body.end_date}`;
    const filename = baseName.endsWith(".docx") ? baseName : `${baseName}.docx`;

    return new NextResponse(new Uint8Array(docBuffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename.replace(/[^A-Za-z0-9 ._\-()]/g, "_")}"`,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
