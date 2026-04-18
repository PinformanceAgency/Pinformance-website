"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// -----------------------------------------------------------------------------
// Constants — mirror the pricing logic from the agency HTML calculator
// -----------------------------------------------------------------------------
const CAP = 10_000; // Monthly cap on total Pinformance fee (EUR)
const BASE_FEE = 750; // Monthly base fee (EUR)
const STARTUP_FEE = 1_000; // One-time startup fee (EUR)
const MIN_REVENUE_FOR_PERF = 20_000; // Below this monthly revenue, no performance fee
const MIN_ADSPEND_FOR_FEE = 7_500; // Below this monthly adspend, no adspend fee

type ModelId = "high" | "low" | "sub";

type FpPoint = { roas: number; pct: number };

type FpModel = {
  id: "high" | "low";
  label: string;
  valueLabel: string;
  subLabel: string;
  guaranteeRoas: number;
  points: FpPoint[];
};

const FP_MODELS: Record<"high" | "low", FpModel> = {
  high: {
    id: "high",
    label: "First purchase",
    valueLabel: "BER 1.5 – 2.0",
    subLabel: "Garantie ROAS 2",
    guaranteeRoas: 2,
    points: [
      { roas: 2, pct: 2 },
      { roas: 2.5, pct: 3 },
      { roas: 3, pct: 4 },
    ],
  },
  low: {
    id: "low",
    label: "First purchase",
    valueLabel: "BER 1.2 – 1.4",
    subLabel: "Garantie ROAS 1.8",
    guaranteeRoas: 1.8,
    points: [
      { roas: 1.8, pct: 2 },
      { roas: 2.2, pct: 3 },
      { roas: 2.6, pct: 4 },
    ],
  },
};

type AdspendBracket = { min: number; max: number; pct: number };

const SUB_BRACKETS: AdspendBracket[] = [
  { min: 7_500, max: 25_000, pct: 10 },
  { min: 25_000, max: 50_000, pct: 9 },
  { min: 50_000, max: 100_000, pct: 8 },
  { min: 100_000, max: Number.POSITIVE_INFINITY, pct: 7 },
];

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
function formatEur(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return "€ " + Math.round(n).toLocaleString("nl-NL");
}

function formatPct(n: number): string {
  return n.toFixed(2).replace(".", ",") + " %";
}

function parseNumber(s: string): number {
  const cleaned = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

// Linear interpolation of performance fee % based on ROAS
function computePerfFeePct(roas: number, model: FpModel): number | null {
  if (roas < model.guaranteeRoas) return null;
  const points = model.points;
  if (roas <= points[0].roas) return points[0].pct;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (roas >= a.roas && roas <= b.roas) {
      const t = (roas - a.roas) / (b.roas - a.roas);
      return a.pct + t * (b.pct - a.pct);
    }
  }
  return points[points.length - 1].pct;
}

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------
export default function CalculatorPage() {
  const [model, setModel] = useState<ModelId>("high");

  return (
    <div className="min-h-screen bg-[#f8f9fb] dot-grid-bg py-10 px-4 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <Header />
        <ModelSelector model={model} onChange={setModel} />

        {model === "sub" ? (
          <SubscriptionPanel />
        ) : (
          <FirstPurchasePanel model={FP_MODELS[model]} />
        )}

        <Footer />
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Header
// -----------------------------------------------------------------------------
function Header() {
  return (
    <header className="mb-8 flex items-center justify-between border-b border-[#e2e4ea] pb-6">
      <div className="flex items-center gap-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#E30613] font-bold text-white shadow-[0_2px_8px_rgba(227,6,19,0.2)]">
          P
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0a0a0a]">
            Pinformance
          </h1>
          <p className="text-xs uppercase tracking-widest text-[#6b7280]">
            Pinterest Performance Calculator
          </p>
        </div>
      </div>
      <div className="hidden items-center gap-2 rounded-full border border-[#e2e4ea] bg-white px-3 py-1.5 text-xs text-[#6b7280] sm:flex">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#E30613] opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[#E30613]" />
        </span>
        Live pricing tool
      </div>
    </header>
  );
}

// -----------------------------------------------------------------------------
// Model selector (3 toggle cards)
// -----------------------------------------------------------------------------
function ModelSelector({
  model,
  onChange,
}: {
  model: ModelId;
  onChange: (m: ModelId) => void;
}) {
  const options: {
    id: ModelId;
    label: string;
    valueLabel: string;
    subLabel: string;
  }[] = [
    {
      id: "high",
      label: "First purchase",
      valueLabel: "BER 1.5 – 2.0",
      subLabel: "Garantie ROAS 2.0",
    },
    {
      id: "low",
      label: "First purchase",
      valueLabel: "BER 1.2 – 1.4",
      subLabel: "Garantie ROAS 1.8",
    },
    {
      id: "sub",
      label: "Subscription",
      valueLabel: "Adspend fee",
      subLabel: "Progressieve brackets",
    },
  ];

  return (
    <div className="mb-8">
      <div className="mb-2 text-xs font-medium uppercase tracking-widest text-[#6b7280]">
        Stap 1 — Klantmodel
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {options.map((o) => {
          const active = model === o.id;
          return (
            <button
              key={o.id}
              onClick={() => onChange(o.id)}
              className={
                "rounded-xl border px-4 py-4 text-left transition-all " +
                (active
                  ? "border-[#E30613] bg-[#fef2f2] shadow-[0_4px_20px_rgba(227,6,19,0.1)]"
                  : "border-[#e2e4ea] bg-white hover:border-[#d1d5db]")
              }
            >
              <div className="text-[10px] uppercase tracking-widest text-[#9ca3af]">
                {o.label}
              </div>
              <div
                className={
                  "mt-1 text-base font-semibold " +
                  (active ? "text-[#E30613]" : "text-[#0a0a0a]")
                }
              >
                {o.valueLabel}
              </div>
              <div className="mt-0.5 text-[11px] text-[#9ca3af]">
                {o.subLabel}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// First-purchase panel (High / Low ROAS)
// -----------------------------------------------------------------------------
function FirstPurchasePanel({ model }: { model: FpModel }) {
  const [roasInput, setRoasInput] = useState("2.5");
  const [revenueInput, setRevenueInput] = useState("100000");

  const roas = parseFloat(roasInput.replace(",", "."));
  const revenue = parseNumber(revenueInput);

  const perfPct = useMemo(() => computePerfFeePct(roas, model), [roas, model]);
  const belowGuarantee = perfPct === null;
  const belowMinRev = !Number.isNaN(revenue) && revenue < MIN_REVENUE_FOR_PERF;

  const { perfFee, capped, total, effectivePct, netExtra } = useMemo(() => {
    if (Number.isNaN(roas) || roas <= 0 || Number.isNaN(revenue) || revenue <= 0) {
      return {
        perfFee: 0,
        capped: false,
        total: BASE_FEE,
        effectivePct: 0,
        netExtra: 0,
      };
    }
    if (belowGuarantee || belowMinRev) {
      return {
        perfFee: 0,
        capped: false,
        total: BASE_FEE,
        effectivePct: 0,
        netExtra: revenue - BASE_FEE,
      };
    }
    const raw = Math.round(revenue * ((perfPct as number) / 100));
    const maxPerf = CAP - BASE_FEE;
    const capped = raw > maxPerf;
    const perf = capped ? maxPerf : raw;
    const tot = BASE_FEE + perf;
    return {
      perfFee: perf,
      capped,
      total: tot,
      effectivePct: (tot / revenue) * 100,
      netExtra: revenue - tot,
    };
  }, [roas, revenue, perfPct, belowGuarantee, belowMinRev]);

  // Scenario chart: show Net Extra Revenue for a range of ROAS values at current revenue
  const chartData = useMemo(() => {
    if (Number.isNaN(revenue) || revenue <= 0) return [];
    const min = model.guaranteeRoas;
    const max = model.points[model.points.length - 1].roas + 0.5;
    const steps = 12;
    const out: {
      roas: string;
      roasValue: number;
      total: number;
      netExtra: number;
      isCurrent: boolean;
    }[] = [];
    for (let i = 0; i <= steps; i++) {
      const r = min + (i / steps) * (max - min);
      const pct = computePerfFeePct(r, model);
      let tot = BASE_FEE;
      if (pct !== null && revenue >= MIN_REVENUE_FOR_PERF) {
        const raw = revenue * (pct / 100);
        const maxPerf = CAP - BASE_FEE;
        tot = BASE_FEE + Math.min(raw, maxPerf);
      }
      out.push({
        roas: r.toFixed(1).replace(".", ","),
        roasValue: r,
        total: Math.round(tot),
        netExtra: Math.round(revenue - tot),
        isCurrent: !Number.isNaN(roas) && Math.abs(r - roas) < (max - min) / steps / 2,
      });
    }
    return out;
  }, [model, revenue, roas]);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      {/* ---------------- Left column: config ---------------- */}
      <div className="space-y-4 lg:col-span-2">
        <FeesCard />
        <ConditionsCard model={model} />
        <TiersCard model={model} activeRoas={roas} />

        <div className="rounded-2xl border border-[#e2e4ea] bg-white p-5 shadow-sm">
          <div className="mb-1 text-[10px] font-medium uppercase tracking-widest text-[#9ca3af]">
            Stap 2 — Behaalde ROAS
          </div>
          <div className="flex items-end justify-between">
            <input
              type="text"
              value={roasInput}
              onChange={(e) => setRoasInput(e.target.value)}
              className="w-28 rounded-lg border border-[#e2e4ea] bg-white px-3 py-2 text-center text-2xl font-bold text-[#0a0a0a] outline-none transition-colors focus:border-[#E30613]"
            />
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-widest text-[#9ca3af]">
                Performance fee
              </div>
              <div className="flex items-baseline justify-end gap-1.5">
                <span className="text-3xl font-bold text-[#E30613]">
                  {belowGuarantee
                    ? "0 %"
                    : perfPct !== null
                      ? formatPct(perfPct)
                      : "—"}
                </span>
                <span className="text-xs text-[#9ca3af]">van revenue</span>
              </div>
            </div>
          </div>

          {belowGuarantee && (
            <div className="mt-3 rounded-lg border border-[#fce4e4] bg-[#fef2f2] px-3 py-2 text-xs font-medium text-[#E30613]">
              Onder garantie ROAS {model.guaranteeRoas} — geen performance fee
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-[#e2e4ea] bg-white p-5 shadow-sm">
          <div className="mb-1 text-[10px] font-medium uppercase tracking-widest text-[#9ca3af]">
            Stap 3 — Maandelijkse revenue
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xl font-semibold text-[#9ca3af]">€</span>
            <input
              type="text"
              value={revenueInput}
              onChange={(e) => setRevenueInput(e.target.value)}
              className="w-full rounded-lg border border-[#e2e4ea] bg-white px-3 py-2 text-2xl font-bold text-[#0a0a0a] outline-none transition-colors focus:border-[#E30613]"
            />
          </div>
          {belowMinRev && (
            <div className="mt-3 rounded-lg border border-[#e2e4ea] bg-[#f0f1f5] px-3 py-2 text-xs text-[#6b7280]">
              Onder € {MIN_REVENUE_FOR_PERF.toLocaleString("nl-NL")} revenue —
              performance fee nog niet actief
            </div>
          )}
        </div>
      </div>

      {/* ---------------- Right column: results + chart ---------------- */}
      <div className="space-y-4 lg:col-span-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <MetricCard label="Base fee" value={formatEur(BASE_FEE)} />
          <MetricCard
            label="Performance fee"
            value={formatEur(perfFee)}
            badge={
              belowGuarantee
                ? { text: `Garantie ${model.guaranteeRoas}`, tone: "red" }
                : belowMinRev
                  ? { text: "Onder € 20k", tone: "gray" }
                  : capped
                    ? { text: "Cap bereikt", tone: "red" }
                    : undefined
            }
          />
          <MetricCard
            label="Totaal / maand"
            value={formatEur(total)}
            sub={
              !belowMinRev && !belowGuarantee && revenue > 0
                ? "Effectief " + effectivePct.toFixed(2).replace(".", ",") + " %"
                : undefined
            }
            highlight
          />
        </div>

        {/* Scenario chart */}
        <div className="rounded-2xl border border-[#e2e4ea] bg-white p-5 shadow-sm">
          <div className="mb-1 flex items-start justify-between">
            <div>
              <div className="text-[10px] font-medium uppercase tracking-widest text-[#9ca3af]">
                Scenario analyse
              </div>
              <div className="mt-1 text-sm font-semibold text-[#0a0a0a]">
                Netto extra revenue bij verschillende ROAS
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-widest text-[#9ca3af]">
                Bij revenue
              </div>
              <div className="text-sm font-semibold text-[#0a0a0a]">
                {formatEur(revenue)}
              </div>
            </div>
          </div>

          <div className="mt-4 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e4ea" vertical={false} />
                <XAxis
                  dataKey="roas"
                  tick={{ fontSize: 11, fill: "#6b7280" }}
                  axisLine={{ stroke: "#e2e4ea" }}
                  tickLine={false}
                  label={{
                    value: "ROAS",
                    position: "insideBottom",
                    offset: -4,
                    fontSize: 11,
                    fill: "#9ca3af",
                  }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#6b7280" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => "€ " + (v / 1000).toFixed(0) + "k"}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid #e2e4ea",
                    fontSize: 12,
                  }}
                  formatter={(value, name) => [
                    formatEur(Number(value)),
                    name === "netExtra" ? "Netto voor jou" : "Pinformance fee",
                  ]}
                  labelFormatter={(l) => "ROAS " + l}
                />
                <Legend
                  verticalAlign="top"
                  align="right"
                  height={28}
                  iconType="circle"
                  iconSize={8}
                  formatter={(v) =>
                    v === "netExtra" ? "Netto voor jou" : "Pinformance fee"
                  }
                  wrapperStyle={{ fontSize: 12 }}
                />
                <Line
                  type="monotone"
                  dataKey="netExtra"
                  stroke="#E30613"
                  strokeWidth={3}
                  dot={{ r: 3, fill: "#E30613" }}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke="#9ca3af"
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  strokeDasharray="4 4"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Value summary */}
        {!belowMinRev && !belowGuarantee && revenue > 0 && (
          <div className="overflow-hidden rounded-2xl border border-[#e2e4ea] shadow-sm">
            <div className="border-b border-[#252832] bg-[#0f1117] px-5 py-4">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-[#E30613]">
                Wat Pinformance jou oplevert
              </div>
              <div className="mt-1 text-lg font-bold text-white">
                {formatEur(revenue)} extra revenue vanuit Pinterest
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 bg-white px-5 py-4 sm:grid-cols-3">
              <ValueItem
                label="Extra revenue uit Pinterest"
                value={formatEur(revenue)}
                accent
              />
              <ValueItem label="Kosten Pinformance" value={formatEur(total)} />
              <ValueItem
                label="Netto extra omzet"
                value={formatEur(netExtra)}
                accent
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Subscription panel
// -----------------------------------------------------------------------------
function SubscriptionPanel() {
  const [adspendInput, setAdspendInput] = useState("25000");
  const adspend = parseNumber(adspendInput);

  const calc = useMemo(() => {
    if (Number.isNaN(adspend) || adspend <= 0) {
      return {
        brackets: [] as { range: string; pct: number; fee: number }[],
        adspendFee: 0,
        capped: false,
        total: BASE_FEE,
        belowMin: true,
        effectivePct: 0,
        activeIdx: -1,
      };
    }
    if (adspend < MIN_ADSPEND_FOR_FEE) {
      return {
        brackets: [],
        adspendFee: 0,
        capped: false,
        total: BASE_FEE,
        belowMin: true,
        effectivePct: (BASE_FEE / adspend) * 100,
        activeIdx: -1,
      };
    }
    const brackets: { range: string; pct: number; fee: number }[] = [];
    let fee = 0;
    let activeIdx = -1;
    for (let i = 0; i < SUB_BRACKETS.length; i++) {
      const b = SUB_BRACKETS[i];
      if (adspend <= b.min) break;
      const hi = b.max === Number.POSITIVE_INFINITY ? adspend : Math.min(adspend, b.max);
      const taxable = hi - b.min;
      if (taxable <= 0) continue;
      const bracketFee = Math.round(taxable * (b.pct / 100));
      fee += bracketFee;
      activeIdx = i;
      const rangeLabel =
        b.max === Number.POSITIVE_INFINITY
          ? `€ ${(b.min / 1000).toFixed(0)}k+`
          : `€ ${(b.min / 1000).toFixed(0)}k – ${(b.max / 1000).toFixed(0)}k`;
      brackets.push({ range: rangeLabel, pct: b.pct, fee: bracketFee });
    }
    const maxFee = CAP - BASE_FEE;
    const capped = fee > maxFee;
    if (capped) fee = maxFee;
    const tot = BASE_FEE + fee;
    return {
      brackets,
      adspendFee: fee,
      capped,
      total: tot,
      belowMin: false,
      effectivePct: (tot / adspend) * 100,
      activeIdx,
    };
  }, [adspend]);

  // Scenario chart: how total fee scales with adspend
  const chartData = useMemo(() => {
    const steps = 16;
    const max = Math.max(adspend * 2.5, 150_000);
    const out: {
      adspend: string;
      adspendValue: number;
      total: number;
      isCurrent: boolean;
    }[] = [];
    for (let i = 0; i <= steps; i++) {
      const s = (i / steps) * max;
      let t = BASE_FEE;
      if (s >= MIN_ADSPEND_FOR_FEE) {
        let fee = 0;
        for (const b of SUB_BRACKETS) {
          if (s <= b.min) break;
          const hi = b.max === Number.POSITIVE_INFINITY ? s : Math.min(s, b.max);
          const tx = hi - b.min;
          if (tx > 0) fee += tx * (b.pct / 100);
        }
        fee = Math.min(fee, CAP - BASE_FEE);
        t = BASE_FEE + fee;
      }
      out.push({
        adspend: "€ " + (s / 1000).toFixed(0) + "k",
        adspendValue: s,
        total: Math.round(t),
        isCurrent:
          !Number.isNaN(adspend) &&
          Math.abs(s - adspend) < max / steps / 2,
      });
    }
    return out;
  }, [adspend]);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      {/* ---------------- Left: config ---------------- */}
      <div className="space-y-4 lg:col-span-2">
        <FeesCard />

        <div className="space-y-2">
          <ConditionRow
            label="Garantie ROAS — Variabel, per contract"
            value="Per contract"
            red
          />
          <ConditionRow
            label="Adspend fee pas actief vanaf"
            value={`€ ${MIN_ADSPEND_FOR_FEE.toLocaleString("nl-NL")}`}
          />
          <ConditionRow
            label="Maandelijkse cap"
            value={`Max. € ${CAP.toLocaleString("nl-NL")}`}
          />
        </div>

        <div className="rounded-2xl border border-[#e2e4ea] bg-white p-5 shadow-sm">
          <div className="mb-3 text-[10px] font-medium uppercase tracking-widest text-[#9ca3af]">
            Adspend fee brackets — progressief
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {SUB_BRACKETS.map((b, i) => {
              const active = calc.activeIdx >= i && !calc.belowMin;
              return (
                <div
                  key={i}
                  className={
                    "rounded-lg border px-3 py-3 text-center transition-all " +
                    (active
                      ? "border-[#E30613] bg-[#fef2f2]"
                      : "border-[#e2e4ea] bg-[#fafafa]")
                  }
                >
                  <div className="text-[9px] uppercase tracking-widest text-[#9ca3af]">
                    {b.max === Number.POSITIVE_INFINITY
                      ? `€ ${b.min / 1000}k+`
                      : `€ ${b.min / 1000}k – ${b.max / 1000}k`}
                  </div>
                  <div
                    className={
                      "mt-1 text-lg font-bold " +
                      (active ? "text-[#E30613]" : "text-[#0a0a0a]")
                    }
                  >
                    {b.pct}%
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-[#e2e4ea] bg-white p-5 shadow-sm">
          <div className="mb-1 text-[10px] font-medium uppercase tracking-widest text-[#9ca3af]">
            Stap 2 — Maandelijkse adspend
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xl font-semibold text-[#9ca3af]">€</span>
            <input
              type="text"
              value={adspendInput}
              onChange={(e) => setAdspendInput(e.target.value)}
              className="w-full rounded-lg border border-[#e2e4ea] bg-white px-3 py-2 text-2xl font-bold text-[#0a0a0a] outline-none transition-colors focus:border-[#E30613]"
            />
          </div>
          {calc.belowMin && (
            <div className="mt-3 rounded-lg border border-[#e2e4ea] bg-[#f0f1f5] px-3 py-2 text-xs text-[#6b7280]">
              Onder € {MIN_ADSPEND_FOR_FEE.toLocaleString("nl-NL")} — alleen
              base fee actief
            </div>
          )}
        </div>

        {calc.brackets.length > 0 && (
          <div className="rounded-2xl border border-[#e2e4ea] bg-white p-5 shadow-sm">
            <div className="mb-2 text-[10px] font-medium uppercase tracking-widest text-[#9ca3af]">
              Opbouw
            </div>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-[#6b7280]">
                <span>Base fee</span>
                <span className="font-semibold text-[#0a0a0a]">
                  {formatEur(BASE_FEE)}
                </span>
              </div>
              {calc.brackets.map((b, i) => (
                <div key={i} className="flex justify-between text-[#6b7280]">
                  <span>
                    {b.range} × {b.pct}%
                  </span>
                  <span className="font-semibold text-[#0a0a0a]">
                    {formatEur(b.fee)}
                  </span>
                </div>
              ))}
              <div className="mt-2 flex justify-between border-t border-[#e2e4ea] pt-2 text-[#E30613]">
                <span className="font-bold">
                  Totaal{calc.capped ? " (cap)" : ""}
                </span>
                <span className="font-bold">{formatEur(calc.total)}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ---------------- Right: results + chart ---------------- */}
      <div className="space-y-4 lg:col-span-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <MetricCard
            label="Base fee"
            value={formatEur(BASE_FEE)}
            sub={calc.belowMin ? undefined : "Altijd"}
          />
          <MetricCard
            label="Adspend fee"
            value={formatEur(calc.adspendFee)}
            badge={
              calc.belowMin
                ? { text: "Onder € 7.500", tone: "gray" }
                : calc.capped
                  ? { text: "Cap bereikt", tone: "red" }
                  : undefined
            }
          />
          <MetricCard
            label="Totaal / maand"
            value={formatEur(calc.total)}
            sub={
              !calc.belowMin && adspend > 0
                ? "Effectief " + calc.effectivePct.toFixed(1).replace(".", ",") + " %"
                : undefined
            }
            highlight
          />
        </div>

        <div className="rounded-2xl border border-[#e2e4ea] bg-white p-5 shadow-sm">
          <div className="mb-1 flex items-start justify-between">
            <div>
              <div className="text-[10px] font-medium uppercase tracking-widest text-[#9ca3af]">
                Scenario analyse
              </div>
              <div className="mt-1 text-sm font-semibold text-[#0a0a0a]">
                Totale fee bij verschillende adspend niveaus
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-widest text-[#9ca3af]">
                Huidige adspend
              </div>
              <div className="text-sm font-semibold text-[#0a0a0a]">
                {formatEur(adspend)}
              </div>
            </div>
          </div>

          <div className="mt-4 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e4ea" vertical={false} />
                <XAxis
                  dataKey="adspend"
                  tick={{ fontSize: 10, fill: "#6b7280" }}
                  axisLine={{ stroke: "#e2e4ea" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#6b7280" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => "€ " + (v / 1000).toFixed(1) + "k"}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid #e2e4ea",
                    fontSize: 12,
                  }}
                  formatter={(value) => [formatEur(Number(value)), "Totale fee"]}
                  labelFormatter={(l) => "Adspend " + l}
                />
                <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                  {chartData.map((d, i) => (
                    <Cell
                      key={i}
                      fill={d.isCurrent ? "#E30613" : "#fca5a5"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {!calc.belowMin && adspend > 0 && (
          <div className="overflow-hidden rounded-2xl border border-[#e2e4ea] shadow-sm">
            <div className="border-b border-[#252832] bg-[#0f1117] px-5 py-4">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-[#E30613]">
                Kostenoverzicht
              </div>
              <div className="mt-1 text-lg font-bold text-white">
                {formatEur(calc.total)} per maand totaal
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 bg-white px-5 py-4 sm:grid-cols-3">
              <ValueItem label="Base fee" value={formatEur(BASE_FEE)} />
              <ValueItem
                label="Adspend fee"
                value={formatEur(calc.adspendFee)}
                accent
              />
              <ValueItem
                label="Effectief % op adspend"
                value={calc.effectivePct.toFixed(1).replace(".", ",") + " %"}
                accent
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Reusable sub-components
// -----------------------------------------------------------------------------
function FeesCard() {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-xl border border-[#e2e4ea] bg-white p-4 shadow-sm">
        <div className="text-[10px] uppercase tracking-widest text-[#9ca3af]">
          Eenmalig
        </div>
        <div className="mt-1 text-base font-bold text-[#0a0a0a]">
          € {STARTUP_FEE.toLocaleString("nl-NL")}
        </div>
        <div className="text-[11px] text-[#9ca3af]">startup fee</div>
      </div>
      <div className="rounded-xl border border-[#e2e4ea] bg-white p-4 shadow-sm">
        <div className="text-[10px] uppercase tracking-widest text-[#9ca3af]">
          Maandelijks
        </div>
        <div className="mt-1 text-base font-bold text-[#0a0a0a]">
          € {BASE_FEE.toLocaleString("nl-NL")}
        </div>
        <div className="text-[11px] text-[#9ca3af]">base fee</div>
      </div>
    </div>
  );
}

function ConditionsCard({ model }: { model: FpModel }) {
  return (
    <div className="space-y-2">
      <ConditionRow
        label={`Garantie — Onder ROAS ${model.guaranteeRoas} geen performance fee`}
        value={`ROAS ${model.guaranteeRoas}`}
        red
      />
      <ConditionRow
        label="Performance fee pas vanaf"
        value={`€ ${MIN_REVENUE_FOR_PERF.toLocaleString("nl-NL")} revenue`}
      />
      <ConditionRow
        label="Maandelijkse cap"
        value={`Max. € ${CAP.toLocaleString("nl-NL")}`}
      />
    </div>
  );
}

function ConditionRow({
  label,
  value,
  red,
}: {
  label: string;
  value: string;
  red?: boolean;
}) {
  return (
    <div
      className={
        "flex items-center justify-between rounded-lg border px-3.5 py-2.5 text-xs " +
        (red
          ? "border-[#fce4e4] bg-[#fef2f2]"
          : "border-[#e2e4ea] bg-white")
      }
    >
      <span className={red ? "text-[#E30613]" : "text-[#6b7280]"}>{label}</span>
      <span
        className={
          "font-semibold " + (red ? "text-[#E30613]" : "text-[#0a0a0a]")
        }
      >
        {value}
      </span>
    </div>
  );
}

function TiersCard({ model, activeRoas }: { model: FpModel; activeRoas: number }) {
  const points = model.points;
  return (
    <div className="rounded-2xl border border-[#e2e4ea] bg-white p-5 shadow-sm">
      <div className="mb-3 text-[10px] font-medium uppercase tracking-widest text-[#9ca3af]">
        Performance fee tiers — lineair
      </div>
      <div className="grid grid-cols-4 gap-2">
        <TierBox
          label={`< ROAS ${model.guaranteeRoas}`}
          pct="0%"
          active={!Number.isNaN(activeRoas) && activeRoas < model.guaranteeRoas}
          zero
        />
        {points.map((p, i) => {
          const last = i === points.length - 1;
          const isActive =
            !Number.isNaN(activeRoas) &&
            activeRoas >= p.roas &&
            (last || activeRoas < points[i + 1].roas);
          return (
            <TierBox
              key={i}
              label={
                last
                  ? `ROAS ${p.roas.toString().replace(".", ",")}+`
                  : `ROAS ${p.roas.toString().replace(".", ",")}`
              }
              pct={`${p.pct}%`}
              active={isActive}
            />
          );
        })}
      </div>
    </div>
  );
}

function TierBox({
  label,
  pct,
  active,
  zero,
}: {
  label: string;
  pct: string;
  active?: boolean;
  zero?: boolean;
}) {
  return (
    <div
      className={
        "rounded-lg border px-2 py-3 text-center transition-colors " +
        (active
          ? "border-[#E30613] bg-[#fef2f2]"
          : "border-[#e2e4ea] bg-[#fafafa]")
      }
    >
      <div className="text-[9px] uppercase tracking-widest text-[#9ca3af]">
        {label}
      </div>
      <div
        className={
          "mt-1 font-bold " +
          (zero
            ? "text-sm text-[#d1d5db]"
            : active
              ? "text-lg text-[#E30613]"
              : "text-lg text-[#0a0a0a]")
        }
      >
        {pct}
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  sub,
  badge,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  badge?: { text: string; tone: "red" | "gray" };
  highlight?: boolean;
}) {
  if (highlight) {
    return (
      <div className="relative overflow-hidden rounded-2xl bg-[#E30613] p-5 text-white shadow-[0_8px_24px_rgba(227,6,19,0.25)]">
        <div className="text-[10px] font-medium uppercase tracking-widest text-white/75">
          {label}
        </div>
        <div className="mt-2 text-2xl font-bold">{value}</div>
        <div className="mt-1 min-h-[16px] text-[11px] text-white/75">
          {sub ?? ""}
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-[#e2e4ea] bg-white p-5 shadow-sm">
      <div className="text-[10px] font-medium uppercase tracking-widest text-[#9ca3af]">
        {label}
      </div>
      <div className="mt-2 text-2xl font-bold text-[#0a0a0a]">{value}</div>
      <div className="mt-1 min-h-[16px] text-[11px]">
        {badge ? (
          <span
            className={
              "inline-block rounded px-2 py-0.5 text-[10px] font-semibold " +
              (badge.tone === "red"
                ? "bg-[#E30613] text-white"
                : "bg-[#e2e4ea] text-[#6b7280]")
            }
          >
            {badge.text}
          </span>
        ) : (
          <span className="text-[#9ca3af]">{sub ?? ""}</span>
        )}
      </div>
    </div>
  );
}

function ValueItem({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-[#9ca3af]">
        {label}
      </div>
      <div
        className={
          "mt-1 text-lg font-bold " +
          (accent ? "text-[#E30613]" : "text-[#0a0a0a]")
        }
      >
        {value}
      </div>
    </div>
  );
}

function Footer() {
  return (
    <footer className="mt-10 flex items-center justify-between border-t border-[#e2e4ea] pt-4 text-[10px] text-[#9ca3af]">
      <span>Pinformance — Pinterest Performance Advertising</span>
      <span>pinformance-agency.com</span>
    </footer>
  );
}
