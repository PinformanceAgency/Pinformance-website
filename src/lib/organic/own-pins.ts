/**
 * Organic account figures, counted the way the agency reports them: the
 * store's OWN image and video pins, never product pins.
 *
 * Pinterest's organic totals include ORGANIC_PRODUCT, the catalogue pins.
 * Those run on paid (shopping ads) and are counted as organic anyway, which
 * is the same rule the agency applies in Conversion Insights: organic, your
 * pins, image + video, never product. Measured 25-09-2026 over thirty days,
 * the difference is not a rounding error: Celestia 902 outbound clicks in
 * the unfiltered total, 818 of them from product pins; Envoise 1,097
 * impressions, 989 from product pins. Every organic number that is not
 * filtered this way is mostly paid.
 *
 * `pin_format` takes one value per call, so this makes two calls (image,
 * video) with `source=YOUR_PINS` and adds them up per day. Counts are
 * summed; rates are recomputed from the summed counts, because averaging a
 * rate over two populations of different size is simply wrong.
 */
import type { PinterestClient } from "@/lib/pinterest/client";

export const OWN_PIN_FORMATS = ["ORGANIC_IMAGE", "ORGANIC_VIDEO"] as const;

/** Stated on screen next to the numbers, so a figure that looks low is not
 *  mistaken for a fault. */
export { OWN_PINS_FILTER_NOTE } from "./own-pins-note";

type Daily = { date: string; data_status: string; metrics: Record<string, number> };

/** rate metric -> [numerator, denominator] */
const RATES: Record<string, [string, string]> = {
  ENGAGEMENT_RATE: ["ENGAGEMENT", "IMPRESSION"],
  SAVE_RATE: ["SAVE", "IMPRESSION"],
  OUTBOUND_CLICK_RATE: ["OUTBOUND_CLICK", "IMPRESSION"],
  PIN_CLICK_RATE: ["PIN_CLICK", "IMPRESSION"],
};

export async function ownPinsAnalytics(
  client: PinterestClient,
  start: string,
  end: string,
  metrics: string[],
  fromClaimedContent?: "CLAIMED" | "OTHER" | "BOTH",
): Promise<{ all: { daily_metrics: Daily[] } }> {
  // A rate can only be recomputed if its parts were fetched.
  const wanted = new Set(metrics);
  for (const m of metrics) if (RATES[m]) RATES[m].forEach((x) => wanted.add(x));
  const request = [...wanted];

  const parts = await Promise.all(OWN_PIN_FORMATS.map((pinFormat) =>
    client.getUserAccountAnalytics(start, end, request, fromClaimedContent, { pinFormat, source: "YOUR_PINS" })));

  const byDate = new Map<string, Daily>();
  for (const part of parts) {
    for (const d of part?.all?.daily_metrics ?? []) {
      const cur = byDate.get(d.date) ?? { date: d.date, data_status: d.data_status, metrics: {} };
      // A day is only READY when every part of it is.
      if (d.data_status && d.data_status !== "READY") cur.data_status = d.data_status;
      for (const [k, v] of Object.entries(d.metrics ?? {})) {
        if (RATES[k]) continue;
        cur.metrics[k] = (cur.metrics[k] ?? 0) + Number(v ?? 0);
      }
      byDate.set(d.date, cur);
    }
  }
  for (const d of byDate.values()) {
    for (const [rate, [num, den]] of Object.entries(RATES)) {
      if (!metrics.includes(rate)) continue;
      const denom = d.metrics[den] ?? 0;
      d.metrics[rate] = denom > 0 ? (d.metrics[num] ?? 0) / denom : 0;
    }
  }
  const daily_metrics = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  return { all: { daily_metrics } };
}

/** Top pins among the store's own image and video pins. */
export async function ownTopPins(
  client: PinterestClient,
  start: string,
  end: string,
  sortBy: string,
  metrics: string[],
) {
  const parts = await Promise.all(OWN_PIN_FORMATS.map((pinFormat) =>
    client.getTopPins(start, end, sortBy, metrics, "ORGANIC", { pinFormat, source: "YOUR_PINS" })));
  const pins = parts.flatMap((p) => p?.pins ?? [])
    .sort((a, b) => Number(b.metrics?.[sortBy] ?? 0) - Number(a.metrics?.[sortBy] ?? 0));
  return { pins: pins.slice(0, 50) };
}
