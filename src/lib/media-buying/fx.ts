/**
 * FX rates for the zone thresholds.
 *
 * The zone thresholds are euro amounts (€20,000 monthly revenue, €7,500
 * monthly spend). Store metrics are in the currency of the Pinterest ad
 * account and stay that way everywhere — dashboard, Monday board, exports.
 * So the THRESHOLD is what gets converted, never the amounts.
 *
 * Rates come from the ECB daily reference rates via frankfurter.dev (a thin
 * wrapper around the ECB feed: free, no API key, no rate limit worth worrying
 * about). They're cached in the `fx_rates` table by /api/cron/fx-rates.
 *
 * `per_eur` is units of the foreign currency for one EUR, exactly how the ECB
 * publishes it: 1 EUR = 1.1567 USD. Converting a threshold is therefore a
 * multiplication: €20,000 * 0.939 = CHF 18,780.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** Currencies we actually bill in. Extend when a new market shows up. */
export const FX_CURRENCIES = ["USD", "CHF", "GBP", "CAD", "AUD", "SEK", "DKK", "NOK", "PLN"] as const;

/**
 * Last-resort rates, used only when the fx_rates table can't be read at all.
 * The migration seeds the same numbers, so in practice this never fires — it
 * exists so a zone computation can never blow up on a missing rate, and so
 * that when it does fall back it falls back to something sane rather than to
 * 1.0 (which would silently reinstate the bug this module fixes).
 *
 * ECB reference rates of 2026-08-14.
 */
export const FALLBACK_RATES_PER_EUR: Record<string, number> = {
  EUR: 1,
  USD: 1.1567,
  CHF: 0.939,
  GBP: 0.8545,
};

const ECB_URL = `https://api.frankfurter.dev/v1/latest?base=EUR&symbols=${FX_CURRENCIES.join(",")}`;

export interface FxSnapshot {
  /** The date the ECB published these rates for. */
  date: string;
  /** currency → units per EUR. Always contains EUR = 1. */
  rates: Record<string, number>;
}

/** Fetch today's reference rates. Throws on network / shape problems. */
export async function fetchEcbRates(): Promise<FxSnapshot> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const resp = await fetch(ECB_URL, { signal: controller.signal });
    if (!resp.ok) {
      throw new Error(`ECB feed HTTP ${resp.status} ${resp.statusText}`);
    }
    const body = (await resp.json()) as { date?: string; rates?: Record<string, number> };
    if (!body?.date || !body.rates || Object.keys(body.rates).length === 0) {
      throw new Error(`ECB feed returned no rates: ${JSON.stringify(body).slice(0, 200)}`);
    }
    const rates: Record<string, number> = { EUR: 1 };
    for (const [cur, val] of Object.entries(body.rates)) {
      if (typeof val === "number" && isFinite(val) && val > 0) {
        rates[cur] = val;
      }
    }
    return { date: body.date, rates };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetch and store today's rates. Returns how many rows were written.
 * Uses an upsert so re-running on the same day (or a cron retry) is a no-op
 * rather than a duplicate-key error.
 */
export async function refreshFxRates(supabase: SupabaseClient): Promise<{ date: string; written: number }> {
  const snap = await fetchEcbRates();
  const rows = Object.entries(snap.rates).map(([currency, per_eur]) => ({
    rate_date: snap.date,
    currency,
    per_eur,
    source: "ecb",
  }));
  const { error } = await supabase
    .from("fx_rates")
    .upsert(rows, { onConflict: "rate_date,currency" });
  if (error) throw new Error(error.message);
  return { date: snap.date, written: rows.length };
}

/**
 * Newest known rate per currency.
 *
 * Deliberately forgiving: a stale rate is harmless (reference rates move
 * fractions of a percent day to day) but a zone page that fails to render
 * because the ECB had an outage is not. Any read problem falls through to
 * FALLBACK_RATES_PER_EUR.
 */
export async function loadFxRates(supabase: SupabaseClient): Promise<Record<string, number>> {
  const rates: Record<string, number> = { ...FALLBACK_RATES_PER_EUR };
  try {
    // Newest first, then keep the first row seen per currency — one small
    // query beats a DISTINCT ON that PostgREST can't express directly.
    const { data, error } = await supabase
      .from("fx_rates")
      .select("currency, per_eur, rate_date")
      .order("rate_date", { ascending: false })
      .limit(500);
    if (error || !data) return rates;
    const seen = new Set<string>();
    for (const r of data as Array<{ currency: string; per_eur: number | string }>) {
      if (seen.has(r.currency)) continue;
      const v = Number(r.per_eur);
      if (isFinite(v) && v > 0) {
        rates[r.currency] = v;
        seen.add(r.currency);
      }
    }
    return rates;
  } catch {
    return rates;
  }
}

/**
 * Units of `currency` for one EUR. Unknown currencies fall back to 1, which
 * leaves the threshold at its euro value — the old behaviour, and the only
 * sensible guess when we've never seen the currency before.
 */
export function ratePerEur(rates: Record<string, number>, currency: string | null | undefined): number {
  if (!currency) return 1;
  const v = rates[currency.trim().toUpperCase()];
  return typeof v === "number" && isFinite(v) && v > 0 ? v : 1;
}
