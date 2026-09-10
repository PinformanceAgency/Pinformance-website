/**
 * Validation for the custom zone range — a period the user types in, so every
 * value in it arrives from outside.
 *
 * Deliberately a module of its own rather than a few `if`s inside the route:
 * a route handler cannot be called without a request scope (createClient()
 * reads cookies), so validation living there can only be exercised through a
 * logged-in browser. Here it is a pure function that scripts/check-zone-range.ts
 * asserts case by case — including the ones nobody reaches by accident, like
 * "2026-02-31", which is ISO-shaped, is not a date, and would silently become
 * the 3rd of March.
 */

/** Longest period computed in one request. A year of account-level rows for
 *  the whole book is already several pages of 1000; past that this stops being
 *  a page you wait for and starts being a report. */
export const MAX_RANGE_DAYS = 366;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** True when the string is a real calendar date, not merely ISO-shaped. */
export function isRealDate(iso: string): boolean {
  if (!ISO.test(iso)) return false;
  const d = new Date(iso + "T00:00:00Z");
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

/** Inclusive day count between two ISO dates. */
export function daysInclusive(from: string, to: string): number {
  const a = new Date(from + "T00:00:00Z").getTime();
  const b = new Date(to + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86400000) + 1;
}

export type ParsedRange =
  | {
      ok: true;
      from: string;
      to: string;
      days: number;
      /** The last day is today, which is still being filled in — the snapshot
       *  cron runs every six hours. The UI says so rather than quietly holding
       *  a part-day against a full day's share of the floor. */
      includes_today: boolean;
    }
  | { ok: false; error: string };

export function parseZoneRange(
  fromRaw: string | null,
  toRaw: string | null,
  today: string
): ParsedRange {
  const from = (fromRaw ?? "").trim();
  const to = (toRaw ?? "").trim();
  if (!isRealDate(from) || !isRealDate(to)) {
    return { ok: false, error: "from and to must both be dates in YYYY-MM-DD form" };
  }
  if (from > to) return { ok: false, error: "from must be on or before to" };
  if (to > today) {
    return { ok: false, error: `to cannot be in the future (today is ${today})` };
  }
  const days = daysInclusive(from, to);
  if (days > MAX_RANGE_DAYS) {
    return { ok: false, error: `range is ${days} days; the maximum is ${MAX_RANGE_DAYS}` };
  }
  return { ok: true, from, to, days, includes_today: to === today };
}
