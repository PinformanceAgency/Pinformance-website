"use client";

import { Users } from "lucide-react";
import { BreakdownView } from "@/components/media-buying/breakdown-view";
import type { Dimension, LegendItem } from "@/lib/media-buying/types";

const DIMENSIONS: Dimension[] = [
  {
    key: "gender",
    title: "Per Gender",
    description:
      "Gender targeting parsed from each ad-group name. P+ ad groups typically omit this slot.",
    order: ["F", "M", "ALL"],
    label: (v) => (v === "F" ? "Female" : v === "M" ? "Male" : "All genders"),
    hint: (v) => v,
  },
  {
    key: "age",
    title: "Per Age Bucket",
    description:
      "Age range parsed from the ad-group name (e.g. 18-24, 25-34, 18+). Omitted when all ages are targeted.",
    label: (v) => v,
  },
  {
    key: "audience",
    title: "Per Audience",
    description:
      "Audience targeting: Broad, retention windows (ATC_L180, View_L180, …), ACL clusters, or copied audience names.",
    label: (v) => v,
  },
  {
    key: "funnel",
    title: "Prospecting vs Retargeting",
    description:
      "Funnel stage at the ad-group level (when carried in the ad-group name).",
    order: ["PROSP", "RET"],
    label: (v) => (v === "PROSP" ? "Prospecting" : "Retargeting"),
    hint: (v) => v,
  },
  {
    key: "category",
    title: "Per Category / Product Scope",
    description:
      "Product scope parsed from the ad-group name — e.g. Swim, Bra, BestSellers, Mixed.",
    label: (v) => v,
  },
];

const LEGEND: LegendItem[] = [
  { abbr: "F / M / ALL", desc: "Gender targeting — Female / Male / All genders. Omitted on P+ ad groups." },
  { abbr: "18+ / 18-24 / 25-34 …", desc: "Age bucket. Omitted when all ages are targeted." },
  { abbr: "Broad", desc: "Broad audience targeting — no retention or interest filter." },
  { abbr: "ATC_L180", desc: "Add-to-cart retargeting, 180-day window. Similar: View_L180, Eng_L90, Purchase_L180." },
  { abbr: "ACL_1-5", desc: "ACL cluster — actalike (lookalike) audiences in numbered tiers." },
  { abbr: "PROSP / RET", desc: "Prospecting (cold) vs Retargeting (warm). Sometimes carried at ad-group level too." },
];

export default function AdGroupLevelPage() {
  return (
    <BreakdownView
      title="Ad Group Level"
      description="Aggregated performance per ad-group-naming dimension."
      icon={Users}
      endpoint="/api/pinterest/media-buying/ad-groups"
      dimensions={DIMENSIONS}
      legend={LEGEND}
      entityLabel="ad group"
    />
  );
}
