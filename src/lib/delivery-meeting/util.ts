/** Dates, number formatting and name matching for the delivery meeting. */

const DAY = 86_400_000;

export const isoDate = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (iso: string, n: number) =>
  isoDate(new Date(Date.parse(iso + "T00:00:00Z") + n * DAY));
/** Mon = 0 … Sun = 6 */
export const weekday = (iso: string) => (new Date(iso + "T00:00:00Z").getUTCDay() + 6) % 7;

/** ISO 8601 week number. */
export function isoWeek(iso: string): number {
  const d = new Date(iso + "T00:00:00Z");
  const thursday = new Date(d.getTime() + (3 - ((d.getUTCDay() + 6) % 7)) * DAY);
  const jan1 = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  return 1 + Math.floor((thursday.getTime() - jan1) / DAY / 7);
}

/** The Tuesday of the week `now` is in (the meeting date). */
export function meetingTuesday(now: Date = new Date()): string {
  const today = isoDate(now);
  return addDays(today, 1 - weekday(today));
}

export interface MeetingDates {
  meeting_date: string;
  meeting_week: number;
  /** Mon–Sun of the week the numbers are about */
  data_start: string;
  data_end: string;
  data_week: number;
  /** Friday of the data week: the archived log's deadline */
  data_friday: string;
  /** Friday of the meeting week: the live log's deadline */
  meeting_friday: string;
  /** Sunday before the data week: to-dos created from here count */
  todo_from: string;
  data_period: string;
}

const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export function meetingDates(meetingDate: string): MeetingDates {
  if (weekday(meetingDate) !== 1) throw new Error(`${meetingDate} is not a Tuesday`);
  const data_start = addDays(meetingDate, -8);
  const data_end = addDays(data_start, 6);
  const m = (iso: string) => MON[Number(iso.slice(5, 7)) - 1];
  const dd = (iso: string) => String(Number(iso.slice(8, 10)));
  const data_period =
    m(data_start) === m(data_end)
      ? `${dd(data_start)}–${dd(data_end)} ${m(data_end)}`
      : `${dd(data_start)} ${m(data_start)}–${dd(data_end)} ${m(data_end)}`;
  return {
    meeting_date: meetingDate,
    meeting_week: isoWeek(meetingDate),
    data_start,
    data_end,
    data_week: isoWeek(data_start),
    data_friday: addDays(data_start, 4),
    meeting_friday: addDays(meetingDate, 3),
    todo_from: addDays(data_start, -1),
    data_period,
  };
}

/** Currency code → the prefix the slides print (compute_delivery.py's `cur`). */
export function currencyPrefix(code: string | null | undefined): string {
  const c = (code ?? "").trim().toUpperCase();
  if (c === "EUR" || c === "€") return "€";
  if (c === "USD" || c === "$") return "$";
  if (c === "GBP" || c === "£") return "£";
  if (c === "CHF") return "CHF ";
  return c ? c + " " : "€";
}

/** The deck's number format: thousands with a dot, no decimals ("€61.989"). */
export function fmtDeck(cur: string, v: number): string {
  return cur + Math.round(v).toLocaleString("en-US").replace(/,/g, ".");
}
export const fmtInt = (v: number) => Math.round(v).toLocaleString("en-US").replace(/,/g, ".");

/** The prep's number format: thousands with a comma ("$5,730"). */
export function fmtPrep(cur: string, v: number): string {
  return cur + Math.round(v).toLocaleString("en-US");
}

/**
 * A name as monday may spell it, reduced to letters and digits: protocol, www
 * and the TLD gone, "&" and "and" dropped, typographic apostrophes ignored.
 * "https://anderssonbutik.se/" → "anderssonbutik", "Nova’s Jewelry" →
 * "novasjewelry", "Sarah & kate haarlem" → "sarahkatehaarlem".
 */
export function nameKey(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .trim()
    .replace(/\.(com|nl|de|se|co|uk|eu|be|fr|ch|ca|store|shop)$/g, "")
    .replace(/^the\s+/, "")
    .replace(/&|\band\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Does a monday name belong to a store? Exact key, or one key being the start
 * of the other when the shorter has at least 6 characters ("nordheim" ↔
 * "nordheimmode", "sarahkate" ↔ "sarahkatehaarlem"). Never a substring in the
 * middle: that is how "rose" would match "oliviarose" and "rosenfield".
 */
export function nameMatches(mondayName: string, keys: string[]): boolean {
  const k = nameKey(mondayName);
  if (!k) return false;
  return keys.some((c) => {
    if (!c) return false;
    if (c === k) return true;
    const [short, long] = c.length < k.length ? [c, k] : [k, c];
    return short.length >= 6 && long.startsWith(short);
  });
}

export const pct = (now: number, prev: number) => (prev ? (now - prev) / prev : null);
