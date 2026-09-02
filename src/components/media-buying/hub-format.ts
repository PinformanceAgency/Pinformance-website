/** Shared number / currency / zone-color helpers for hub components. */
import type { Zone } from "@/lib/media-buying/config";

export const fmtCurrency = (n: number | null | undefined, currency = "USD"): string => {
  if (n == null || !isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: n >= 1000 ? 0 : 2,
  }).format(n);
};

export const fmtNum = (n: number | null | undefined): string =>
  n == null ? "—" : new Intl.NumberFormat("en-US").format(Math.round(n));

export const fmtRoas = (n: number | null | undefined): string =>
  n == null || !isFinite(n) ? "—" : `${n.toFixed(2)}x`;

export const fmtPct = (n: number | null | undefined, digits = 1): string =>
  n == null || !isFinite(n) ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;

/** "2026-08" → "Aug 2026". Month buckets are labelled with the calendar
 *  month they actually are: the zone window ends yesterday, so "last month"
 *  and "this month" are wrong for two days out of every month. */
export const fmtMonthKeyShort = (key: string): string => {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
};

export const fmtCtr = (n: number | null | undefined): string =>
  n == null || !isFinite(n) ? "—" : `${n.toFixed(2)}%`;

export const zoneBg: Record<Zone, string> = {
  red: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/40",
  orange: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/40",
  green: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/40",
};

export const zoneDot: Record<Zone, string> = {
  red: "bg-red-500",
  orange: "bg-amber-500",
  green: "bg-emerald-500",
};

export const zoneLabel: Record<Zone, string> = {
  red: "Red",
  orange: "Orange",
  green: "Green",
};
