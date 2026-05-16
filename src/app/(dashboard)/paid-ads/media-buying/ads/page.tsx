"use client";

import { Image as ImageIcon } from "lucide-react";
import { BreakdownView } from "@/components/media-buying/breakdown-view";
import { AdPerformanceTable } from "@/components/media-buying/ad-performance-table";
import type { Dimension, LegendItem } from "@/lib/media-buying/types";

function titleCase(v: string): string {
  return v.charAt(0).toUpperCase() + v.slice(1).toLowerCase();
}

const DIMENSIONS: Dimension[] = [
  {
    key: "format",
    title: "Per Format",
    description:
      "Creative format — VIDEO, STATIC, CAROUSEL, COLLECTION. Parsed from each ad name.",
    order: ["VIDEO", "STATIC", "CAROUSEL", "COLLECTION"],
    label: titleCase,
    hint: (v) => v,
  },
  {
    key: "contentType",
    title: "Organic-style vs Ad-style",
    description:
      "ORGANIC = creative shot in organic style. AD = ad-first creative (production-ready ad).",
    order: ["AD", "ORGANIC"],
    label: (v) => (v === "AD" ? "Ad-style" : "Organic-style"),
    hint: (v) => v,
  },
  {
    key: "creatorType",
    title: "Per Creator Type",
    description:
      "Who created the asset — UGC, Shoot, Graphic, Founder, Influencer, or Brand.",
    order: ["UGC", "SHOOT", "GRAPHIC", "FOUNDER", "INFLUENCER", "BRAND"],
    label: titleCase,
    hint: (v) => v,
  },
  {
    key: "category",
    title: "Per Category",
    description:
      "Product category parsed from the ad name (e.g. Swim, PushUpBra, Shapewear).",
    label: (v) => v,
  },
  {
    key: "offer",
    title: "Per Offer",
    description:
      "Offer / promo carried by the creative — BAU (default), 2FOR1, 20OFF, BOGO, Bundle, …",
    label: (v) => v,
  },
  {
    key: "lpType",
    title: "Per Landing Page Type",
    description:
      "Destination type — product page, collection page, or generic landing page.",
    order: ["PRODUCT", "COLLECTION", "PAGE"],
    label: titleCase,
    hint: (v) => `/${v.toLowerCase()}`,
  },
];

const LEGEND: LegendItem[] = [
  { abbr: "VIDEO / STATIC / CAROUSEL / COLLECTION", desc: "Creative format." },
  { abbr: "ORGANIC / AD", desc: "Organic-style vs ad-first creative." },
  { abbr: "UGC", desc: "User-generated content — creator-shot, native-feeling asset." },
  { abbr: "Shoot", desc: "Studio / set shoot — produced brand visuals." },
  { abbr: "Graphic", desc: "Designed graphic — typography, layouts, motion graphics." },
  { abbr: "Founder / Influencer / Brand", desc: "Who fronts or owns the creative." },
  { abbr: "BAU / 2FOR1 / 20OFF / BOGO / Bundle", desc: "Offer tag — BAU = business-as-usual (no promo)." },
  { abbr: "/product /collection /page", desc: "Landing-page type." },
];

export default function AdLevelPage() {
  return (
    <BreakdownView
      title="Ad Level"
      description="Aggregated performance per ad-naming dimension. Ads with no spend in the period are filtered out."
      icon={ImageIcon}
      endpoint="/api/pinterest/media-buying/ads"
      dimensions={DIMENSIONS}
      legend={LEGEND}
      entityLabel="ad"
      renderTop={({ items, currency, loading }) => (
        <AdPerformanceTable
          ads={items}
          currency={currency}
          loading={loading}
          title="All ads in the selected period"
          description="Each row is one ad. Click a thumbnail or name to open the pin on Pinterest. Use the search bar to find specific naming-convention tokens (e.g. UGC, BOGO, /collection)."
        />
      )}
    />
  );
}
