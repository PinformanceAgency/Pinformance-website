"use client";

import { LayoutGrid } from "lucide-react";
import { BreakdownView } from "@/components/media-buying/breakdown-view";
import type { Dimension, LegendItem } from "@/lib/media-buying/types";

const DIMENSIONS: Dimension[] = [
  {
    key: "country",
    title: "Per Country",
    description:
      "Total performance per market (parsed from the first token of each campaign name).",
    label: (v) => v,
  },
  {
    key: "catalog",
    title: "Catalog vs Non-catalog",
    description:
      "CAT = catalog campaigns (product feed). Non-catalog campaigns omit the CAT token.",
    order: ["CAT", "NON_CAT"],
    label: (v) => (v === "CAT" ? "Catalog" : "Non-catalog"),
    hint: (v) => (v === "CAT" ? "CAT" : "—"),
  },
  {
    key: "performancePlus",
    title: "Performance+ vs Non-Performance+",
    description:
      "P+ campaigns use Pinterest's Performance+ automation; NP+ are manually structured.",
    order: ["P+", "NP+"],
    label: (v) => (v === "P+" ? "Performance+" : "Non-Performance+"),
    hint: (v) => v,
  },
  {
    key: "funnel",
    title: "Prospecting vs Retargeting",
    description:
      "PROSP campaigns target cold audiences; RET campaigns target warm audiences.",
    order: ["PROSP", "RET"],
    label: (v) => (v === "PROSP" ? "Prospecting" : "Retargeting"),
    hint: (v) => v,
  },
  {
    key: "strategy",
    title: "Test / Hero / Category",
    description:
      "TEST = creative or structure testing. HERO = scaled winners / evergreen. CATG = category-focused.",
    order: ["HERO", "TEST", "CATG"],
    label: (v) =>
      v === "HERO" ? "Hero" : v === "TEST" ? "Test" : v === "CATG" ? "Category" : v,
    hint: (v) => v,
  },
  {
    key: "objective",
    title: "Conversion vs ROAS",
    description:
      "CONV = conversion-objective campaigns (count of checkouts). ROAS = value-based (revenue per spend).",
    order: ["CONV", "ROAS"],
    label: (v) => (v === "CONV" ? "Conversion" : "ROAS"),
    hint: (v) => v,
  },
];

const LEGEND: LegendItem[] = [
  { abbr: "Country", desc: "Market code — US, NL, BE, AU, AT, CA, DE, …" },
  { abbr: "CAT", desc: "Catalog campaign (product feed). Absence implies non-catalog." },
  { abbr: "P+ / NP+", desc: "Performance+ automation vs manually structured (Non-Perf+)." },
  { abbr: "PROSP / RET", desc: "Prospecting (cold audiences) vs Retargeting (warm audiences)." },
  { abbr: "TEST", desc: "Creative or campaign-structure testing." },
  { abbr: "HERO", desc: "Scaled winners / evergreen best performers." },
  {
    abbr: "CATG",
    desc: "Category-focused campaign (the strategy slot may carry a literal category like WATCHES).",
  },
  { abbr: "CONV / ROAS", desc: "Conversion-count objective vs ROAS / value-based objective." },
];

export default function CampaignLevelPage() {
  return (
    <BreakdownView
      title="Campaign Level"
      description="Aggregated performance per campaign-naming dimension."
      icon={LayoutGrid}
      endpoint="/api/pinterest/media-buying/campaigns"
      dimensions={DIMENSIONS}
      legend={LEGEND}
      entityLabel="campaign"
    />
  );
}
