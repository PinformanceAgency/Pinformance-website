"use client";

import { useMemo, useState } from "react";
import {
  BRACKETS,
  BASE_FEE,
  INVOICE_CAP,
  KPI_DEFAULTS,
  MIN_ADSPEND_FOR_FEE,
  SETUP_FEE,
  bracketLabel,
  eur,
  pct,
  quote,
  targetImplies,
  type KpiKind,
} from "./pricing";

const PRESETS = [10_000, 25_000, 50_000, 100_000, 200_000];

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
    // een ROAS van 30 leest als een typefout die wij hebben gemaakt.
    setMinInput(String(KPI_DEFAULTS[next]));
  }

  return (
    <div className="calc">
      {/* Invoer ------------------------------------------------------- */}
      <div className="calc-inputs">
        <label className="calc-field">
          <span className="cf-k">Ad spend per maand</span>
          <span className="cf-in">
            <i>€</i>
            <input
              inputMode="numeric"
              value={adspendInput}
              onChange={(e) => setAdspendInput(e.target.value)}
              onPointerDown={(e) => e.stopPropagation()}
            />
          </span>
          <span className="cf-presets">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                className={adspend === p ? "on" : ""}
                onClick={() => setAdspendInput(String(p))}
              >
                € {p / 1000}k
              </button>
            ))}
          </span>
        </label>

        <label className="calc-field">
          <span className="cf-k">Waarop sturen we</span>
          <span className="cf-toggle">
            <button
              type="button"
              className={kpi === "roas" ? "on" : ""}
              onClick={() => switchKpi("roas")}
            >
              ROAS
            </button>
            <button
              type="button"
              className={kpi === "cpa" ? "on" : ""}
              onClick={() => switchKpi("cpa")}
            >
              CPA
            </button>
          </span>
          <span className="cf-h">
            {kpi === "roas"
              ? "Omzet gedeeld door spend. Voor de meeste merken."
              : "Kosten per order. Bij abonnementen en hoge LTV."}
          </span>
        </label>

        <label className="calc-field">
          <span className="cf-k">
            {kpi === "roas" ? "Minimale ROAS" : "Maximale CPA"}
          </span>
          <span className="cf-in">
            {kpi === "cpa" && <i>€</i>}
            <input
              inputMode="decimal"
              value={minInput}
              onChange={(e) => setMinInput(e.target.value)}
              onPointerDown={(e) => e.stopPropagation()}
            />
          </span>
          <span className="cf-h">
            {implies
              ? `${implies.label} ${implies.value} per maand`
              : "Vul een getal in"}
          </span>
        </label>
      </div>

      {/* De twee scenario's ------------------------------------------- */}
      <div className="calc-scenarios">
        <div className="cs on">
          <span className="cs-k">
            {kpi === "roas" ? "ROAS gehaald" : "CPA gehaald"}
          </span>
          <span className="cs-v">{eur(q.totalOnTarget)}</span>
          <span className="cs-s">per maand</span>
          <span className="cs-rows">
            <span>
              <i>Base fee</i>
              {eur(BASE_FEE)}
            </span>
            <span>
              <i>
                Spend fee
                {!q.belowThreshold && ` · ${q.bracketPct}%`}
              </i>
              {eur(q.spendFee)}
            </span>
          </span>
        </div>

        <div className="cs off">
          <span className="cs-k">Niet gehaald</span>
          <span className="cs-v">{eur(q.totalOffTarget)}</span>
          <span className="cs-s">per maand</span>
          <span className="cs-rows">
            <span>
              <i>Base fee</i>
              {eur(BASE_FEE)}
            </span>
            <span>
              <i>Spend fee</i>
              vervalt
            </span>
          </span>
        </div>
      </div>

      {(q.belowThreshold || q.capped) && (
        <p className="calc-note">
          {q.belowThreshold
            ? `Onder ${eur(MIN_ADSPEND_FOR_FEE)} ad spend rekenen we geen spend fee, dus betaal je hoe dan ook alleen de base fee.`
            : `Het maximum is bereikt. De factuur blijft op ${eur(INVOICE_CAP)} per maand staan, hoe hard we ook schalen.`}
        </p>
      )}

      {/* De staffel ---------------------------------------------------- */}
      <div className="calc-brackets">
        <span className="cb-k">De staffel over je ad spend</span>
        <div className="cb-row">
          {BRACKETS.map((b, i) => (
            <div
              key={b.min}
              className={`cb${i === q.bracketIndex && !q.belowThreshold ? " on" : ""}`}
            >
              <span className="r">{bracketLabel(b)}</span>
              <span className="p">{b.pct}%</span>
            </div>
          ))}
        </div>
      </div>

      <div className="calc-foot">
        <span>
          <i>Eenmalige setup</i>
          {eur(SETUP_FEE)}
        </span>
        <span>
          <i>Effectief op je spend</i>
          {q.effectivePct > 0 ? pct(q.effectivePct) : "—"}
        </span>
        <span>
          <i>Maximum per maand</i>
          {eur(INVOICE_CAP)}
        </span>
        <span>
          <i>Facturatie</i>
          Achteraf
        </span>
      </div>
    </div>
  );
}
