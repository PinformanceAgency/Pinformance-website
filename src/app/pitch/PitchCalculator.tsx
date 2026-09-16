"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BRACKETS,
  BASE_FEE,
  INVOICE_CAP,
  KPI_DEFAULTS,
  MIN_ADSPEND_FOR_FEE,
  bracketLabel,
  eur,
  quote,
  targetImplies,
  type KpiKind,
} from "./pricing";

// De opmaak is die van de losse calculator (src/app/calculator/page.tsx),
// sectie voor sectie overgenomen: de garantiekaarten met de rode accentlijn,
// het invoerpaneel, de staffelkaart met de breakdown eronder, en de grafiek
// ernaast. Alleen de taal volgt het deck, en de bedragen komen uit pricing.ts.
//
// Dat betekent dat dit blok bewust LICHT is binnen een verder zwart deck: het
// leest als de tool die het is, en niet als weer een sectie.

const PRESETS = [
  { label: "€ 10k", value: "10000" },
  { label: "€ 25k", value: "25000" },
  { label: "€ 50k", value: "50000" },
  { label: "€ 100k", value: "100000" },
  { label: "€ 200k", value: "200000" },
];

function parseAmount(s: string): number {
  // "25.000", "25,000" en "25000" moeten alle drie werken: tijdens een call
  // typt niemand netjes.
  const cleaned = s.replace(/[^\d.,]/g, "").replace(/[.,](?=\d{3}\b)/g, "");
  const n = parseFloat(cleaned.replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

export default function PitchCalculator() {
  const [adspendInput, setAdspendInput] = useState("25000");
  const [kpi, setKpi] = useState<KpiKind>("roas");
  const [minInput, setMinInput] = useState(String(KPI_DEFAULTS.roas));

  const adspend = parseAmount(adspendInput);
  const minimum = parseFloat(minInput.replace(",", "."));
  const q = useMemo(() => quote(adspend), [adspend]);
  const implies = useMemo(
    () => targetImplies(adspend, kpi, minimum),
    [adspend, kpi, minimum]
  );

  function switchKpi(next: KpiKind) {
    if (next === kpi) return;
    setKpi(next);
    // Het minimum van de ene KPI is onzin bij de andere: een CPA van 2 euro of
    // een ROAS van 30 leest als een fout die wij hebben gemaakt.
    setMinInput(String(KPI_DEFAULTS[next]));
  }

  const kpiLabel = Number.isFinite(minimum)
    ? kpi === "roas"
      ? `Minimale ROAS ${minimum.toFixed(1).replace(".", ",")}`
      : `Maximale CPA ${eur(minimum)}`
    : "Nog in te vullen";

  const chartData = useMemo(
    () =>
      BRACKETS.map((b, i) => ({
        adspend:
          b.max === Number.POSITIVE_INFINITY
            ? `€ ${b.min / 1000}k+`
            : `€ ${(b.min / 1000).toLocaleString("nl-NL")}k`,
        pct: b.pct,
        isCurrent: i === q.bracketIndex && !q.belowThreshold,
      })),
    [q.bracketIndex, q.belowThreshold]
  );

  const note = q.belowThreshold
    ? `Onder ${eur(MIN_ADSPEND_FOR_FEE)} ad spend. Alleen de base fee.`
    : q.capped
      ? `Maximum bereikt. Onze fee blijft op ${eur(INVOICE_CAP)} per maand staan.`
      : null;

  return (
    <div className="pitch-calc mt-6 rounded-2xl bg-[#f8f9fb] dot-grid-bg p-6 sm:p-8">
      <div className="space-y-12">
        {/* Garanties -------------------------------------------------- */}
        <section>
          <div className="mb-6">
            <h3 className="text-2xl font-semibold tracking-tight text-[#0a0a0a] sm:text-3xl">
              Garanties en voorwaarden
            </h3>
            <p className="mt-1 text-sm text-[#6b7280]">
              Vastgelegd in de overeenkomst.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Garantie", headline: kpiLabel },
              {
                label: "Drempel",
                headline: `Pas vanaf ${eur(MIN_ADSPEND_FOR_FEE)} ad spend`,
              },
              {
                label: "Maximum",
                headline: `Gemaximeerd op ${eur(INVOICE_CAP)} per maand`,
              },
              { label: "Facturatie", headline: "Achteraf, nooit vooraf" },
            ].map((it) => (
              <div
                key={it.label}
                className="group relative overflow-hidden rounded-2xl border border-[#e2e4ea] bg-white p-7 shadow-[0_4px_16px_rgba(10,10,10,0.03)] transition-all hover:border-[#E30613]/30 hover:shadow-[0_12px_32px_rgba(227,6,19,0.08)]"
              >
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#E30613] via-[#E30613]/60 to-transparent" />
                <div
                  aria-hidden
                  className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-[#E30613]/[0.04] blur-2xl transition-opacity group-hover:bg-[#E30613]/[0.08]"
                />
                <div className="relative">
                  <div className="inline-flex items-center rounded-full bg-[#fef2f2] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-[#E30613]">
                    {it.label}
                  </div>
                  <div className="mt-5 text-lg font-semibold leading-snug text-[#0a0a0a]">
                    {it.headline}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Investering ------------------------------------------------ */}
        <section>
          <div className="mb-6">
            <h3 className="text-xl font-semibold tracking-tight text-[#0a0a0a]">
              Jouw investering
            </h3>
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-[#E30613]/25 bg-white p-6 shadow-[0_8px_32px_rgba(227,6,19,0.06)] sm:p-7">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {/* Ad spend */}
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[#6b7280]">
                    Ad spend per maand
                  </div>
                </div>
                <div className="flex items-baseline gap-2 rounded-xl border border-[#e2e4ea] bg-[#fafbfc] px-4 py-3 transition-colors focus-within:border-[#E30613] focus-within:bg-white">
                  <span className="text-lg font-semibold text-[#9ca3af]">€</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={adspendInput}
                    onChange={(e) => setAdspendInput(e.target.value)}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="w-full bg-transparent text-2xl font-bold tabular-nums text-[#0a0a0a] outline-none placeholder:text-[#d1d5db] sm:text-3xl"
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#9ca3af]">
                    Probeer:
                  </span>
                  {PRESETS.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setAdspendInput(p.value)}
                      className={
                        "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors " +
                        (adspendInput === p.value
                          ? "border-[#E30613] bg-[#fef2f2] text-[#E30613]"
                          : "border-[#e2e4ea] bg-white text-[#6b7280] hover:border-[#d1d5db] hover:text-[#0a0a0a]")
                      }
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* KPI */}
              <div>
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-[#6b7280]">
                  Waarop sturen we
                </div>
                <div className="flex gap-1.5 rounded-xl border border-[#e2e4ea] bg-[#fafbfc] p-1.5">
                  {(["roas", "cpa"] as KpiKind[]).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => switchKpi(k)}
                      className={
                        "flex-1 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors " +
                        (kpi === k
                          ? "bg-[#E30613] text-white"
                          : "text-[#6b7280] hover:text-[#0a0a0a]")
                      }
                    >
                      {k === "roas" ? "ROAS" : "CPA"}
                    </button>
                  ))}
                </div>
                <div className="mt-3 text-[11px] leading-relaxed text-[#9ca3af]">
                  {kpi === "roas"
                    ? "Omzet gedeeld door spend. Voor de meeste merken."
                    : "Kosten per order. Bij abonnementen en hoge LTV."}
                </div>
              </div>

              {/* Minimum */}
              <div>
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-[#6b7280]">
                  {kpi === "roas" ? "Minimale ROAS" : "Maximale CPA"}
                </div>
                <div className="flex items-baseline gap-2 rounded-xl border border-[#e2e4ea] bg-[#fafbfc] px-4 py-3 transition-colors focus-within:border-[#E30613] focus-within:bg-white">
                  {kpi === "cpa" && (
                    <span className="text-lg font-semibold text-[#9ca3af]">
                      €
                    </span>
                  )}
                  <input
                    type="text"
                    inputMode="decimal"
                    value={minInput}
                    onChange={(e) => setMinInput(e.target.value)}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="w-full bg-transparent text-2xl font-bold tabular-nums text-[#0a0a0a] outline-none placeholder:text-[#d1d5db] sm:text-3xl"
                  />
                </div>
                <div className="mt-3 text-[11px] leading-relaxed text-[#9ca3af]">
                  {implies
                    ? `${implies.label} ${implies.value} per maand`
                    : "Vul een getal in"}
                </div>
              </div>
            </div>
          </div>

          {note && (
            <div className="mt-5 rounded-xl border border-[#fce4e4] bg-[#fef2f2] px-4 py-3 text-xs text-[#E30613]">
              {note}
            </div>
          )}

          {/* Gehaald versus niet gehaald ---------------------------- */}
          <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="rounded-xl border border-[#E30613]/25 bg-white px-5 py-4 shadow-[0_8px_32px_rgba(227,6,19,0.06)]">
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#E30613]">
                {kpi === "roas" ? "ROAS gehaald" : "CPA gehaald"}
              </div>
              <div className="mt-1.5 text-xl font-semibold tabular-nums text-[#0a0a0a] sm:text-2xl">
                {eur(q.totalOnTarget)}
              </div>
              <div className="mt-0.5 min-h-[14px] text-[10px] font-medium text-[#9ca3af]">
                per maand, base fee plus spend fee
              </div>
            </div>
            <div className="rounded-xl border border-[#e2e4ea] bg-white px-5 py-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9ca3af]">
                Niet gehaald
              </div>
              <div className="mt-1.5 text-xl font-semibold tabular-nums text-[#0a0a0a] sm:text-2xl">
                {eur(q.totalOffTarget)}
              </div>
              <div className="mt-0.5 min-h-[14px] text-[10px] font-medium text-[#9ca3af]">
                per maand, de spend fee vervalt volledig
              </div>
            </div>
          </div>

          {/* Staffel en grafiek ------------------------------------- */}
          <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-5">
            <div className="space-y-4 lg:col-span-2">
              <div className="rounded-2xl border border-[#e2e4ea] bg-white p-5 shadow-sm">
                <div className="mb-3 text-[10px] font-medium uppercase tracking-widest text-[#9ca3af]">
                  Staffel over de ad spend
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {BRACKETS.map((b, i) => {
                    const active = q.bracketIndex === i && !q.belowThreshold;
                    return (
                      <div
                        key={b.min}
                        className={
                          "rounded-lg border px-3 py-3 text-center transition-all " +
                          (active
                            ? "border-[#E30613] bg-[#fef2f2]"
                            : "border-[#e2e4ea] bg-white")
                        }
                      >
                        <div className="text-[9px] uppercase tracking-[0.2em] text-[#9ca3af]">
                          {bracketLabel(b)}
                        </div>
                        <div
                          className={
                            "mt-1 text-lg font-semibold " +
                            (active ? "text-[#E30613]" : "text-[#0a0a0a]")
                          }
                        >
                          {b.pct}%
                        </div>
                      </div>
                    );
                  })}
                </div>

                {!q.belowThreshold && (
                  <div className="mt-6 border-t border-[#e2e4ea] pt-6">
                    <div className="mb-6 text-center text-sm font-bold uppercase tracking-[0.15em] text-[#0a0a0a] sm:text-base">
                      <span>
                        Bij{" "}
                        <span className="text-[#E30613]">{eur(adspend)}</span> ad
                        spend
                      </span>
                    </div>
                    <div className="space-y-3.5 text-sm">
                      <div className="flex justify-between">
                        <span className="text-[#6b7280]">Base fee</span>
                        <span className="font-medium tabular-nums text-[#0a0a0a]">
                          {eur(BASE_FEE)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#6b7280]">
                          {eur(adspend)} × {q.bracketPct}%
                        </span>
                        <span className="font-medium tabular-nums text-[#0a0a0a]">
                          {eur(q.spendFee)}
                        </span>
                      </div>
                      <div className="mt-5 flex items-baseline justify-between border-t border-[#e2e4ea] pt-5">
                        <span className="font-semibold text-[#0a0a0a]">
                          Totaal{q.capped ? " (maximum)" : ""}
                        </span>
                        <span className="font-semibold tabular-nums text-[#E30613]">
                          {eur(q.totalOnTarget)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="lg:col-span-3">
              <div className="rounded-2xl border border-[#e2e4ea] bg-white p-6">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9ca3af]">
                  Spend fee per staffel
                </div>
                <div className="text-base font-semibold text-[#0a0a0a]">
                  Bij een ad spend van{" "}
                  <span className="text-[#E30613]">{eur(adspend)}</span>
                </div>
                <div className="mt-5 h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={chartData}
                      margin={{ top: 8, right: 24, left: 8, bottom: 18 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#e2e4ea"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="adspend"
                        tick={{ fontSize: 11, fill: "#6b7280" }}
                        axisLine={{ stroke: "#e2e4ea" }}
                        tickLine={false}
                        label={{
                          value: "AD SPEND",
                          position: "insideBottom",
                          offset: -12,
                          fontSize: 10,
                          fill: "#9ca3af",
                          letterSpacing: "0.2em",
                        }}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: "#6b7280" }}
                        axisLine={false}
                        tickLine={false}
                        // Vier procentpunten marge om de staffel heen, zodat
                        // de lijn niet tegen de randen van het vlak plakt.
                        domain={[4, 9]}
                        tickFormatter={(v) => Number(v).toFixed(0) + " %"}
                        label={{
                          value: "SPEND FEE",
                          angle: -90,
                          position: "insideLeft",
                          offset: 12,
                          fontSize: 10,
                          fill: "#9ca3af",
                          letterSpacing: "0.2em",
                          style: { textAnchor: "middle" },
                        }}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 8,
                          border: "1px solid #e2e4ea",
                          fontSize: 12,
                        }}
                        formatter={(value) => [
                          Number(value).toFixed(1) + " %",
                          "Spend fee",
                        ]}
                        labelFormatter={(l) => "Ad spend " + l}
                      />
                      <Line
                        type="monotone"
                        dataKey="pct"
                        stroke="#E30613"
                        strokeWidth={2.5}
                        dot={(props) => {
                          const { cx, cy, payload, index } = props as {
                            cx?: number;
                            cy?: number;
                            payload?: { isCurrent?: boolean };
                            index?: number;
                          };
                          const isCurrent = !!payload?.isCurrent;
                          return (
                            <circle
                              key={`pitch-dot-${index ?? 0}`}
                              cx={cx}
                              cy={cy}
                              r={isCurrent ? 8 : 4}
                              fill={isCurrent ? "#E30613" : "#fff"}
                              stroke="#E30613"
                              strokeWidth={isCurrent ? 0 : 2}
                            />
                          );
                        }}
                        activeDot={{
                          r: 8,
                          fill: "#E30613",
                          stroke: "#fff",
                          strokeWidth: 2,
                        }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
