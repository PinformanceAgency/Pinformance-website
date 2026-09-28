/**
 * The half of weekly.ts a client component may import: types and pure
 * helpers. weekly.ts reads the database through `pg`, and pg must never reach
 * a browser bundle — the production build fails on it (28-09-2026), the same
 * split automation.ts / queries.ts already make.
 */
import { attributionToDays } from "@/lib/media-buying/config";

export interface BrandWindow {
  click: number;
  view: number;
  /** "30-day click / 1-day view" */
  label: string;
  /** True when the store has no attribution setting and 30/1 is assumed. */
  is_default: boolean;
}

export interface WeekRow {
  week_start: string;
  impressions: number | null;
  pin_saves: number | null;
  pin_clicks: number | null;
  outbound_clicks: number | null;
  engagements: number | null;
  is_partial: boolean;
  measured_at: string | null;
  revenue_organic: number | null;
  checkouts: number | null;
  page_visits: number | null;
  add_to_cart: number | null;
  conversion_window_click: number | null;
  conversion_window_view: number | null;
  figures_entered_at: string | null;
  figures_note: string | null;
}

/** How to read the four hand-entered figures, in the order you click. */
export function conversionInsightsSteps(w: BrandWindow): string[] {
  return [
    "Ads Manager → Analytics → Conversion insights, on this store's ad account.",
    "Date range: the week below, Monday to Sunday.",
    `Conversion window: ${w.label} — the brand's own setting, so organic is measured the way paid is.`,
    "Content type: Organic. Source: Your Pins — never all pins.",
    "Pin format: Image and Video only. Never Product: catalogue pins run on paid and are not organic revenue.",
    "Copy the ORGANIC column only. Paid-assisted is already claimed by the paid report.",
  ];
}

export function brandWindowFrom(setting: string | null | undefined): BrandWindow {
  const { click, view } = attributionToDays(setting);
  return {
    click,
    view,
    label: `${click}-day click / ${view}-day view`,
    is_default: !setting,
  };
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Monday of the last full Mon–Sun week before today. */
export function lastFullWeekStart(now: Date = new Date()): string {
  const today = new Date(iso(now) + "T00:00:00Z");
  const dow = (today.getUTCDay() + 6) % 7;
  return iso(new Date(today.getTime() - (dow + 7) * 86_400_000));
}

export function addWeeks(weekStart: string, n: number): string {
  return iso(new Date(Date.parse(weekStart + "T00:00:00Z") + n * 7 * 86_400_000));
}

