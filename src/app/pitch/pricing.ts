// Het prijsmodel, op één plek.
//
// Er is nog maar één model: een lage vaste vergoeding plus een performance fee
// over de ad spend, met een resultaatgarantie eronder. Haalt de afgesproken KPI
// het niet, dan vervalt de performance fee volledig en betaal je alleen de base
// fee.
//
// Dit model heette intern de "subscription"-variant, maar die naam sloeg op het
// soort merk en niet op de rekenwijze. Het geldt nu voor iedereen, dus de naam
// is weg.
//
// Deze module is bewust los van de UI: de pitch en de losse calculator moeten
// nooit een ander percentage op het scherm kunnen zetten.

export const BASE_FEE = 1_500;
export const SETUP_FEE = 1_000;
/** De hele maandfactuur is hierop gemaximeerd, base fee inbegrepen. */
export const INVOICE_CAP = 10_000;

export interface Bracket {
  min: number;
  max: number;
  pct: number;
}

/**
 * Het percentage van de staffel waarin de spend valt geldt over de HELE spend,
 * niet progressief per schijf. Dat is een bewuste keuze: progressief rekenen
 * levert een effectief percentage op dat niemand kan narekenen tijdens een call.
 */
export const BRACKETS: Bracket[] = [
  // Geen ondergrens meer (ronde 5): de drempel is uit het hele deck.
  { min: 0, max: 25_000, pct: 8 },
  { min: 25_000, max: 50_000, pct: 7 },
  { min: 50_000, max: 100_000, pct: 6 },
  { min: 100_000, max: Number.POSITIVE_INFINITY, pct: 5 },
];

export type KpiKind = "roas" | "cpa";

export const KPI_DEFAULTS: Record<KpiKind, number> = {
  roas: 2,
  cpa: 30,
};

export interface Quote {
  /** In welke staffel de spend valt, of -1 als er geen spend is ingevuld. */
  bracketIndex: number;
  bracketPct: number;
  /** De performance fee als de KPI gehaald wordt. */
  spendFee: number;
  /** Base fee plus performance fee, na aftopping. */
  totalOnTarget: number;
  /** Wat je betaalt als de KPI niet gehaald wordt: alleen de base fee. */
  totalOffTarget: number;
  /** De maandfactuur raakt het maximum. */
  capped: boolean;
  /** De totale factuur als percentage van de spend, als de KPI gehaald wordt. */
  effectivePct: number;
}

export function quote(adspend: number): Quote {
  const base: Quote = {
    bracketIndex: -1,
    bracketPct: 0,
    spendFee: 0,
    totalOnTarget: BASE_FEE,
    totalOffTarget: BASE_FEE,
    capped: false,
    effectivePct: 0,
  };

  if (!Number.isFinite(adspend) || adspend <= 0) return base;

  const bracketIndex = BRACKETS.findIndex(
    (b) => adspend >= b.min && adspend < b.max
  );
  const bracket = BRACKETS[bracketIndex];

  const maxSpendFee = INVOICE_CAP - BASE_FEE;
  const raw = Math.round(adspend * (bracket.pct / 100));
  const capped = raw > maxSpendFee;
  const spendFee = capped ? maxSpendFee : raw;
  const totalOnTarget = BASE_FEE + spendFee;

  return {
    bracketIndex,
    bracketPct: bracket.pct,
    spendFee,
    totalOnTarget,
    totalOffTarget: BASE_FEE,
    capped,
    effectivePct: (totalOnTarget / adspend) * 100,
  };
}

/**
 * Wat de afgesproken KPI bij deze spend betekent in omzet of in orders. Dat
 * maakt een minimum van "ROAS 2,0" concreet: bij €25.000 spend is dat €50.000
 * omzet, en daar kan iemand iets van vinden.
 */
export function targetImplies(
  adspend: number,
  kind: KpiKind,
  value: number
): { label: string; value: string } | null {
  if (!Number.isFinite(adspend) || adspend <= 0) return null;
  if (!Number.isFinite(value) || value <= 0) return null;
  if (kind === "roas") {
    return {
      label: "Dat is minimaal",
      value: eur(adspend * value) + " omzet",
    };
  }
  return {
    label: "Dat is minimaal",
    value: Math.floor(adspend / value).toLocaleString("nl-NL") + " orders",
  };
}

export function bracketLabel(b: Bracket): string {
  const k = (n: number) => (n / 1000).toLocaleString("nl-NL");
  if (b.max === Number.POSITIVE_INFINITY) return `€ ${k(b.min)}k+`;
  if (b.min === 0) return `tot € ${k(b.max)}k`;
  return `€ ${k(b.min)}k – ${k(b.max)}k`;
}

/**
 * Altijd met expliciete locale, en altijd nl-NL: het deck is Nederlands, en
 * "€ 2,750" leest hier als twee euro vijftig. Expliciet meegeven houdt server
 * en browser bovendien op hetzelfde antwoord.
 */
export function eur(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return "€ " + Math.round(n).toLocaleString("nl-NL");
}

export function pct(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("nl-NL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + " %";
}
