"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------
const CAP = 10_000;
const BASE_FEE = 750;
const STARTUP_FEE = 1_000;
const MIN_REVENUE_FOR_PERF = 20_000;
const MIN_ADSPEND_FOR_FEE = 7_500;

type FpModelId = "high" | "low";
type BusinessModel = "first_purchase" | "subscription";
type ModelKey = "high" | "low" | "sub";

type FpPoint = { roas: number; pct: number };

type FpModel = {
  id: FpModelId;
  title: string;
  guaranteeRoas: number;
  points: FpPoint[];
};

const FP_MODELS: Record<FpModelId, FpModel> = {
  high: {
    id: "high",
    title: "First purchase",
    guaranteeRoas: 2,
    points: [
      { roas: 2, pct: 2.5 },
      { roas: 2.5, pct: 3.5 },
      { roas: 3, pct: 4.5 },
    ],
  },
  low: {
    id: "low",
    title: "First purchase",
    guaranteeRoas: 1.8,
    points: [
      { roas: 1.8, pct: 2.5 },
      { roas: 2.2, pct: 3.5 },
      { roas: 2.6, pct: 4.5 },
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

function determineModel(intake: Intake): ModelKey {
  if (intake.businessModel === "subscription") return "sub";
  // BER 1.2 – 1.5 → Low model (guarantee ROAS 1.8, fee from ROAS 1.8)
  // BER 1.6 – 2.0 → High model (guarantee ROAS 2.0, fee from ROAS 2.0)
  return intake.breakEvenRoas >= 1.6 ? "high" : "low";
}

// -----------------------------------------------------------------------------
// Intake type
// -----------------------------------------------------------------------------
interface Intake {
  brand: string;
  businessModel: BusinessModel;
  breakEvenRoas: number;
  targetRoas: number;
  expectedRevenue: number;
}

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------
export default function CalculatorPage() {
  const [step, setStep] = useState<"intake" | "result">("intake");
  const [intake, setIntake] = useState<Intake>({
    brand: "",
    businessModel: "first_purchase",
    breakEvenRoas: NaN,
    targetRoas: NaN,
    expectedRevenue: NaN,
  });

  return (
    <div className="min-h-screen bg-[#f8f9fb] dot-grid-bg py-10 px-4 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-6xl">
        {step === "intake" ? (
          <IntakeForm
            intake={intake}
            setIntake={setIntake}
            onSubmit={() => setStep("result")}
          />
        ) : (
          <>
            <Header />
            <ResultView intake={intake} onBack={() => setStep("intake")} />
          </>
        )}
        <Footer />
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Header — matches dashboard logo usage
// -----------------------------------------------------------------------------
function Header() {
  return (
    <header className="mb-8 flex items-center justify-between border-b border-[#e2e4ea] pb-6">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt="Pinformance"
          className="h-10 w-10 rounded-xl"
        />
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0a0a0a]">
            Pinformance
          </h1>
          <p className="text-xs uppercase tracking-widest text-[#6b7280]">
            Pinterest Performance Calculator
          </p>
        </div>
      </div>
    </header>
  );
}

// -----------------------------------------------------------------------------
// Intake form
// -----------------------------------------------------------------------------
function IntakeForm({
  intake,
  setIntake,
  onSubmit,
}: {
  intake: Intake;
  setIntake: (i: Intake) => void;
  onSubmit: () => void;
}) {
  const [berInput, setBerInput] = useState(
    Number.isFinite(intake.breakEvenRoas) ? String(intake.breakEvenRoas).replace(".", ",") : ""
  );
  const [targetInput, setTargetInput] = useState(
    Number.isFinite(intake.targetRoas) ? String(intake.targetRoas).replace(".", ",") : ""
  );
  const [revenueInput, setRevenueInput] = useState(
    Number.isFinite(intake.expectedRevenue) ? String(Math.round(intake.expectedRevenue)) : ""
  );

  const ber = parseFloat(berInput.replace(",", "."));
  const target = parseFloat(targetInput.replace(",", "."));
  const revenue = parseNumber(revenueInput);

  const canSubmit =
    intake.brand.trim().length > 0 &&
    (intake.businessModel === "subscription" ||
      (Number.isFinite(ber) && ber > 0)) &&
    Number.isFinite(target) &&
    target > 0 &&
    Number.isFinite(revenue) &&
    revenue > 0;

  function handleSubmit() {
    if (!canSubmit) return;
    setIntake({
      ...intake,
      breakEvenRoas: ber,
      targetRoas: target,
      expectedRevenue: revenue,
    });
    onSubmit();
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-10 flex flex-col items-center text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt="Pinformance"
          className="h-16 w-16 rounded-2xl shadow-[0_8px_24px_rgba(227,6,19,0.15)] sm:h-20 sm:w-20"
        />
        <h1 className="mt-6 max-w-2xl text-3xl font-bold tracking-tight text-[#0a0a0a] sm:text-5xl">
          Ontdek wat je laat liggen op Pinterest.
        </h1>
      </div>

      <div className="rounded-2xl border border-[#e2e4ea] bg-white p-6 shadow-sm sm:p-8">
        <FormField step={1} label="Brandnaam" hint="Zoals jullie bekend staan bij klanten.">
          <input
            type="text"
            value={intake.brand}
            onChange={(e) => setIntake({ ...intake, brand: e.target.value })}
            placeholder=""
            className="w-full rounded-lg border border-[#e2e4ea] bg-white px-4 py-3 text-lg font-semibold text-[#0a0a0a] outline-none transition-colors focus:border-[#E30613]"
          />
        </FormField>

        <Divider />

        <FormField
          step={2}
          label="Businessmodel"
          hint="Runnen jullie een subscription-model of verkopen jullie op first-purchase basis?"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ModelCard
              active={intake.businessModel === "first_purchase"}
              onClick={() => setIntake({ ...intake, businessModel: "first_purchase" })}
              title="First purchase"
              description="Eenmalige aankopen — we werken met performance fee op basis van behaalde ROAS."
            />
            <ModelCard
              active={intake.businessModel === "subscription"}
              onClick={() => setIntake({ ...intake, businessModel: "subscription" })}
              title="Subscription"
              description="Terugkerend abonnementsmodel — we werken met een adspend fee structuur."
            />
          </div>
        </FormField>

        {intake.businessModel === "first_purchase" && (
          <>
            <Divider />
            <FormField step={3} label="Break-even ROAS">
              <input
                type="text"
                inputMode="decimal"
                value={berInput}
                onChange={(e) => setBerInput(e.target.value)}
                placeholder="1,6"
                className="w-32 rounded-lg border border-[#e2e4ea] bg-white px-4 py-3 text-center text-lg font-semibold text-[#0a0a0a] outline-none transition-colors placeholder:text-[#d1d5db] focus:border-[#E30613]"
              />
            </FormField>
          </>
        )}

        <Divider />

        <FormField
          step={intake.businessModel === "first_purchase" ? 4 : 3}
          label="Schaal ROAS / Target ROAS"
          hint="Welke ROAS draaien jullie gemiddeld, dit gebruiken we als realistisch doel op Pinterest."
        >
          <div className="flex items-center gap-3">
            <input
              type="text"
              inputMode="decimal"
              value={targetInput}
              onChange={(e) => setTargetInput(e.target.value)}
              placeholder="2,1"
              className="w-32 rounded-lg border border-[#e2e4ea] bg-white px-4 py-3 text-center text-lg font-semibold text-[#0a0a0a] outline-none transition-colors placeholder:text-[#d1d5db] focus:border-[#E30613]"
            />
            <span className="text-xs text-[#9ca3af]">Bijv. Meta, Google, TikTok gemiddelde</span>
          </div>
        </FormField>

        <Divider />

        <FormField
          step={intake.businessModel === "first_purchase" ? 5 : 4}
          label="Realistisch doel maandelijkse omzet via Pinterest"
        >
          <div className="flex items-center gap-2">
            <span className="text-xl font-semibold text-[#9ca3af]">€</span>
            <input
              type="text"
              inputMode="numeric"
              value={revenueInput}
              onChange={(e) => setRevenueInput(e.target.value)}
              placeholder="100.000"
              className="w-48 rounded-lg border border-[#e2e4ea] bg-white px-4 py-3 text-lg font-semibold text-[#0a0a0a] outline-none transition-colors placeholder:text-[#d1d5db] focus:border-[#E30613]"
            />
            <span className="text-xs text-[#9ca3af]">per maand</span>
          </div>
        </FormField>

        <div className="mt-8 flex items-center justify-between border-t border-[#e2e4ea] pt-6">
          <p className="text-xs text-[#9ca3af]">
            We stellen op basis van deze gegevens een gepersonaliseerd aanbod samen.
          </p>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={
              "rounded-lg px-6 py-3 text-sm font-semibold transition-all " +
              (canSubmit
                ? "bg-[#E30613] text-white shadow-[0_2px_8px_rgba(227,6,19,0.25)] hover:shadow-[0_4px_20px_rgba(227,6,19,0.35)]"
                : "cursor-not-allowed bg-[#e2e4ea] text-[#9ca3af]")
            }
          >
            Toon aanbod →
          </button>
        </div>
      </div>
    </div>
  );
}

function FormField({
  step,
  label,
  hint,
  children,
}: {
  step: number;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="py-4">
      <div className="mb-3 flex items-start gap-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#fef2f2] text-xs font-bold text-[#E30613]">
          {step}
        </span>
        <div>
          <label className="text-sm font-semibold text-[#0a0a0a]">{label}</label>
          {hint && <p className="mt-0.5 text-xs text-[#6b7280]">{hint}</p>}
        </div>
      </div>
      <div className="pl-9">{children}</div>
    </div>
  );
}

function ModelCard({
  active,
  onClick,
  title,
  description,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-xl border p-4 text-left transition-all " +
        (active
          ? "border-[#E30613] bg-[#fef2f2] shadow-[0_4px_16px_rgba(227,6,19,0.1)]"
          : "border-[#e2e4ea] bg-white hover:border-[#d1d5db]")
      }
    >
      <div className="flex items-center gap-2">
        <span
          className={
            "h-4 w-4 rounded-full border-2 " +
            (active ? "border-[#E30613] bg-[#E30613]" : "border-[#d1d5db] bg-white")
          }
        />
        <span
          className={
            "text-sm font-semibold " + (active ? "text-[#E30613]" : "text-[#0a0a0a]")
          }
        >
          {title}
        </span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-[#6b7280]">{description}</p>
    </button>
  );
}

function Divider() {
  return <div className="my-2 h-px bg-[#e2e4ea]" />;
}

// -----------------------------------------------------------------------------
// Result view
// -----------------------------------------------------------------------------
function ResultView({
  intake,
  onBack,
}: {
  intake: Intake;
  onBack: () => void;
}) {
  const modelKey = determineModel(intake);

  return (
    <div>
      {/* Brand banner */}
      <div className="mb-6 overflow-hidden rounded-2xl border border-[#e2e4ea] bg-[#0f1117] shadow-[0_10px_40px_rgba(0,0,0,0.08)]">
        <div className="flex items-center justify-between gap-4 px-6 py-5 sm:px-8 sm:py-6">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-[#E30613]">
              Gepersonaliseerd Pinformance aanbod
            </div>
            <h2 className="mt-1 text-2xl font-bold text-white sm:text-3xl">
              {intake.brand}
            </h2>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/70">
              {intake.businessModel === "first_purchase" && (
                <span>
                  <span className="text-white/50">Break-even ROAS:</span>{" "}
                  <span className="font-semibold text-white">
                    {intake.breakEvenRoas.toFixed(1).replace(".", ",")}
                  </span>
                </span>
              )}
              <span>
                <span className="text-white/50">Schaal ROAS:</span>{" "}
                <span className="font-semibold text-white">
                  {intake.targetRoas.toFixed(1).replace(".", ",")}
                </span>
              </span>
              <span>
                <span className="text-white/50">Target revenue:</span>{" "}
                <span className="font-semibold text-white">
                  {formatEur(intake.expectedRevenue)}/mnd
                </span>
              </span>
            </div>
          </div>
          <button
            onClick={onBack}
            className="shrink-0 rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-xs font-medium text-white/80 transition-all hover:bg-white/10 hover:text-white"
          >
            ← Pas aan
          </button>
        </div>
      </div>

      {modelKey === "sub" ? (
        <SubscriptionPanel intake={intake} />
      ) : (
        <FirstPurchasePanel model={FP_MODELS[modelKey]} intake={intake} />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Projection hero — revenue (dominant) paired with investment (transparent)
// -----------------------------------------------------------------------------
function ProjectionHero({
  brand,
  monthlyRevenue,
  totalCost,
  breakdown,
  effectivePct,
  effectiveLabel,
  note,
}: {
  brand: string;
  monthlyRevenue: number;
  totalCost: number;
  breakdown: { label: string; value: string }[];
  effectivePct?: number;
  effectiveLabel?: string;
  note?: string;
}) {
  return (
    <div className="overflow-hidden rounded-3xl border border-[#e2e4ea] bg-white shadow-[0_8px_32px_rgba(0,0,0,0.04)]">
      <div className="grid grid-cols-1 lg:grid-cols-12">
        {/* Revenue — dominant */}
        <div className="relative border-b border-[#e2e4ea] p-8 sm:p-10 lg:col-span-7 lg:border-b-0 lg:border-r lg:p-14">
          <div className="absolute left-8 right-8 top-0 h-px bg-gradient-to-r from-[#E30613] via-[#E30613]/40 to-transparent sm:left-10 lg:left-14" />
          <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[#E30613]">
            Projectie maandelijkse omzet · {brand}
          </div>
          <div className="mt-8 text-6xl font-bold leading-none tracking-tight text-[#0a0a0a] sm:text-7xl lg:text-[88px]">
            {formatEur(monthlyRevenue)}
          </div>
          <p className="mt-6 max-w-md text-base leading-relaxed text-[#6b7280]">
            Extra maandelijkse revenue via Pinterest — een additioneel
            acquisitiekanaal naast jullie bestaande inspanningen.
          </p>
          {note && <p className="mt-5 text-xs text-[#9ca3af]">{note}</p>}
        </div>

        {/* Investment — subordinate but transparent */}
        <div className="bg-[#fafbfc] p-8 sm:p-10 lg:col-span-5 lg:p-14">
          <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[#9ca3af]">
            Pinformance investering
          </div>
          <div className="mt-8 flex items-baseline gap-2">
            <span className="text-4xl font-bold text-[#0a0a0a] sm:text-5xl">
              {formatEur(totalCost)}
            </span>
            <span className="text-sm font-medium text-[#9ca3af]">/ maand</span>
          </div>

          <div className="mt-8 space-y-3 text-sm">
            {breakdown.map((b, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className="text-[#6b7280]">{b.label}</span>
                <span className="font-medium tabular-nums text-[#0a0a0a]">
                  {b.value}
                </span>
              </div>
            ))}
            {effectivePct !== undefined && effectivePct > 0 && (
              <div className="mt-4 flex items-center justify-between border-t border-[#e2e4ea] pt-4 text-xs">
                <span className="text-[#9ca3af]">
                  {effectiveLabel ?? "Effectief"}
                </span>
                <span className="font-semibold tabular-nums text-[#E30613]">
                  {effectivePct.toFixed(2).replace(".", ",")} %
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}

// -----------------------------------------------------------------------------
// Guarantees — 3 prominent cards that claim our promises
// -----------------------------------------------------------------------------
function GuaranteesFirstPurchase({ model }: { model: FpModel }) {
  const g = model.guaranteeRoas.toString().replace(".", ",");
  return (
    <GuaranteesGrid
      items={[
        {
          label: "Garantie",
          headline: `ROAS onder ${g} — geen fee`,
          body: `Behalen we de minimum ROAS van ${g} niet, dan rekenen we geen performance fee. Wij dragen het risico van prestatie.`,
        },
        {
          label: "Drempel",
          headline: `Pas vanaf € ${MIN_REVENUE_FOR_PERF.toLocaleString("nl-NL")} revenue`,
          body: `Onder dit maandelijks revenue-niveau rekenen we enkel de vaste base fee — geen variabele kosten.`,
        },
        {
          label: "Maximum",
          headline: `Fee maximaal € ${CAP.toLocaleString("nl-NL")} per maand`,
          body: `Onze totale maandelijkse fee overstijgt dit bedrag nooit, ongeacht hoe hard we samen schalen.`,
        },
        {
          label: "Invoicing",
          headline: "Achteraf, nooit vooraf",
          body: "De performance fee wordt pas aan het einde van de maand berekend en gefactureerd — op basis van werkelijk behaalde resultaten. Jullie realiseren eerst de omzet, daarna pas de investering.",
        },
      ]}
    />
  );
}

function GuaranteesSubscription() {
  return (
    <GuaranteesGrid
      items={[
        {
          label: "Garantie",
          headline: "Minimum ROAS per contract",
          body: "De minimum ROAS die wij garanderen leggen we vooraf vast in jullie service agreement. Halen we die niet, dan rekenen we geen adspend fee.",
        },
        {
          label: "Drempel",
          headline: `Pas vanaf € ${MIN_ADSPEND_FOR_FEE.toLocaleString("nl-NL")} adspend`,
          body: `Onder dit maandelijkse adspend-niveau rekenen we enkel de vaste base fee — geen variabele kosten.`,
        },
        {
          label: "Maximum",
          headline: `Fee maximaal € ${CAP.toLocaleString("nl-NL")} per maand`,
          body: `Onze totale maandelijkse fee overstijgt dit bedrag nooit, ongeacht hoe hard we samen schalen.`,
        },
        {
          label: "Invoicing",
          headline: "Achteraf, nooit vooraf",
          body: "De adspend fee wordt pas aan het einde van de maand berekend en gefactureerd — op basis van werkelijke adspend. Jullie realiseren eerst het resultaat, daarna pas de investering.",
        },
      ]}
    />
  );
}

function GuaranteesGrid({
  items,
}: {
  items: { label: string; headline: string; body: string }[];
}) {
  return (
    <section>
      <div className="mb-6">
        <h3 className="text-xl font-semibold tracking-tight text-[#0a0a0a]">
          Garanties & voorwaarden
        </h3>
        <p className="mt-1 text-sm text-[#6b7280]">
          Vastgelegd in NDA en service agreements.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {items.map((it, i) => (
          <div
            key={i}
            className="relative rounded-2xl border border-[#e2e4ea] bg-white p-7"
          >
            <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[#E30613]">
              {it.label}
            </div>
            <div className="mt-4 text-lg font-semibold leading-snug text-[#0a0a0a]">
              {it.headline}
            </div>
            <p className="mt-4 text-sm leading-relaxed text-[#6b7280]">
              {it.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

// -----------------------------------------------------------------------------
// First-purchase panel
// -----------------------------------------------------------------------------
function FirstPurchasePanel({
  model,
  intake,
}: {
  model: FpModel;
  intake: Intake;
}) {
  const [roasInput, setRoasInput] = useState(
    intake.targetRoas.toFixed(1).replace(".", ",")
  );
  const [revenueInput, setRevenueInput] = useState(
    String(Math.round(intake.expectedRevenue))
  );

  const roas = parseFloat(roasInput.replace(",", "."));
  const revenue = parseNumber(revenueInput);

  const perfPct = useMemo(() => computePerfFeePct(roas, model), [roas, model]);
  const belowGuarantee = perfPct === null;
  const belowMinRev = !Number.isNaN(revenue) && revenue < MIN_REVENUE_FOR_PERF;

  const { perfFee, capped, total, effectivePct } = useMemo(() => {
    if (Number.isNaN(roas) || roas <= 0 || Number.isNaN(revenue) || revenue <= 0) {
      return { perfFee: 0, capped: false, total: BASE_FEE, effectivePct: 0 };
    }
    if (belowGuarantee || belowMinRev) {
      return { perfFee: 0, capped: false, total: BASE_FEE, effectivePct: 0 };
    }
    const raw = Math.round(revenue * ((perfPct as number) / 100));
    const maxPerf = CAP - BASE_FEE;
    const isCapped = raw > maxPerf;
    const perf = isCapped ? maxPerf : raw;
    const tot = BASE_FEE + perf;
    return {
      perfFee: perf,
      capped: isCapped,
      total: tot,
      effectivePct: (tot / revenue) * 100,
    };
  }, [roas, revenue, perfPct, belowGuarantee, belowMinRev]);

  const chartData = useMemo(() => {
    const min = model.guaranteeRoas;
    const max = model.points[model.points.length - 1].roas + 0.5;
    // Walk in clean 0.1 increments so the labels on the X-axis line up
    // exactly with the tier boundaries and the displayed percentages match
    // the values shown in the tier cards.
    const out: { roas: string; pct: number }[] = [];
    const startTenths = Math.round(min * 10);
    const endTenths = Math.round(max * 10);
    for (let t = startTenths; t <= endTenths; t++) {
      const r = t / 10;
      const pct = computePerfFeePct(r, model);
      out.push({
        roas: r.toFixed(1).replace(".", ","),
        pct: pct ?? 0,
      });
    }
    return out;
  }, [model]);

  let note: string | undefined;
  if (belowGuarantee) {
    note = `Onder de garantie ROAS van ${model.guaranteeRoas.toString().replace(".", ",")} — geen performance fee van toepassing.`;
  } else if (belowMinRev) {
    note = `Onder € ${MIN_REVENUE_FOR_PERF.toLocaleString("nl-NL")} maandelijkse revenue — alleen de vaste base fee actief.`;
  } else if (capped) {
    note = `Maximum fee bereikt — onze fee blijft op € ${CAP.toLocaleString("nl-NL")} per maand.`;
  }

  const perfLabel =
    belowGuarantee || perfPct === null
      ? "Performance fee"
      : `Performance fee (${formatPct(perfPct)})`;

  return (
    <div className="space-y-10">
      {/* 1. Combined projection — revenue dominant, investment transparent */}
      <ProjectionHero
        brand={intake.brand}
        monthlyRevenue={revenue}
        totalCost={total}
        breakdown={[
          { label: "Base fee", value: formatEur(BASE_FEE) },
          { label: perfLabel, value: formatEur(perfFee) },
        ]}
        effectivePct={!belowMinRev && !belowGuarantee ? effectivePct : undefined}
        effectiveLabel="Effectief op revenue"
        note={note}
      />

      {/* 2. Live scenarios — inputs + chart, compact and clean */}
      <section>
        <div className="mb-6">
          <h3 className="text-xl font-semibold tracking-tight text-[#0a0a0a]">
            Scenario&apos;s doorrekenen
          </h3>
          <p className="mt-1 text-sm text-[#6b7280]">
            Pas ROAS of revenue aan — de projectie werkt live mee.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
          <div className="space-y-4 lg:col-span-2">
            <div className="rounded-2xl border border-[#e2e4ea] bg-white p-5">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9ca3af]">
                Behaalde ROAS
              </div>
              <input
                type="text"
                value={roasInput}
                onChange={(e) => setRoasInput(e.target.value)}
                className="w-full rounded-lg border border-[#e2e4ea] bg-white px-4 py-3 text-center text-2xl font-semibold text-[#0a0a0a] outline-none transition-colors focus:border-[#E30613]"
              />
            </div>

            <div className="rounded-2xl border border-[#e2e4ea] bg-white p-5">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9ca3af]">
                Maandelijkse revenue
              </div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-medium text-[#9ca3af]">€</span>
                <input
                  type="text"
                  value={revenueInput}
                  onChange={(e) => setRevenueInput(e.target.value)}
                  className="w-full rounded-lg border border-[#e2e4ea] bg-white px-3 py-3 text-2xl font-semibold text-[#0a0a0a] outline-none transition-colors focus:border-[#E30613]"
                />
              </div>
            </div>

            <TiersCard model={model} activeRoas={roas} />
          </div>

          <div className="lg:col-span-3">
            <div className="rounded-2xl border border-[#e2e4ea] bg-white p-6">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9ca3af]">
                Performance fee bij verschillende ROAS
              </div>
              <div className="text-base font-semibold text-[#0a0a0a]">
                Bij een omzet van{" "}
                <span className="text-[#E30613]">{formatEur(revenue)}</span> per
                maand
              </div>
              <div className="mt-5 h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e4ea" vertical={false} />
                    <XAxis
                      dataKey="roas"
                      tick={{ fontSize: 11, fill: "#6b7280" }}
                      axisLine={{ stroke: "#e2e4ea" }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#6b7280" }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) =>
                        Number(v).toFixed(1).replace(".", ",") + " %"
                      }
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 8,
                        border: "1px solid #e2e4ea",
                        fontSize: 12,
                      }}
                      formatter={(value) => [
                        Number(value).toFixed(2).replace(".", ",") + " %",
                        "Performance fee",
                      ]}
                      labelFormatter={(l) => "ROAS " + l}
                    />
                    <Line
                      type="monotone"
                      dataKey="pct"
                      stroke="#E30613"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: "#E30613" }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Startup fee — small footnote */}
      <div className="flex items-center justify-between gap-4 rounded-xl border border-[#e2e4ea] bg-white px-5 py-4 text-xs text-[#6b7280]">
        <span>
          <span className="font-semibold text-[#0a0a0a]">Eenmalige startup fee </span>
          € {STARTUP_FEE.toLocaleString("nl-NL")} · onboarding, strategie en
          account setup.
        </span>
      </div>

      {/* 4. Guarantees */}
      <GuaranteesFirstPurchase model={model} />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Subscription panel
// -----------------------------------------------------------------------------
function SubscriptionPanel({ intake }: { intake: Intake }) {
  const derivedAdspend =
    Number.isFinite(intake.expectedRevenue) &&
    Number.isFinite(intake.targetRoas) &&
    intake.targetRoas > 0
      ? Math.round(intake.expectedRevenue / intake.targetRoas)
      : 25_000;

  const [adspendInput, setAdspendInput] = useState(String(derivedAdspend));
  const adspend = parseNumber(adspendInput);

  // The revenue we "deliver" — adspend times target ROAS
  const deliveredRevenue = useMemo(() => {
    if (!Number.isFinite(adspend) || !Number.isFinite(intake.targetRoas)) return 0;
    return adspend * intake.targetRoas;
  }, [adspend, intake.targetRoas]);

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
    const isCapped = fee > maxFee;
    if (isCapped) fee = maxFee;
    const tot = BASE_FEE + fee;
    return {
      brackets,
      adspendFee: fee,
      capped: isCapped,
      total: tot,
      belowMin: false,
      effectivePct: (tot / adspend) * 100,
      activeIdx,
    };
  }, [adspend]);

  const chartData = useMemo(() => {
    const steps = 16;
    const max = Math.max(adspend * 2.5, 150_000);
    const out: { adspend: string; total: number; isCurrent: boolean }[] = [];
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
        total: Math.round(t),
        isCurrent:
          !Number.isNaN(adspend) && Math.abs(s - adspend) < max / steps / 2,
      });
    }
    return out;
  }, [adspend]);

  let note: string | undefined;
  if (calc.belowMin) {
    note = `Onder € ${MIN_ADSPEND_FOR_FEE.toLocaleString("nl-NL")} adspend — alleen de vaste base fee actief.`;
  } else if (calc.capped) {
    note = `Maximum fee bereikt — onze fee blijft op € ${CAP.toLocaleString("nl-NL")} per maand.`;
  }

  const breakdown: { label: string; value: string }[] = [
    { label: "Base fee", value: formatEur(BASE_FEE) },
    { label: "Adspend fee", value: formatEur(calc.adspendFee) },
  ];

  return (
    <div className="space-y-10">
      <ProjectionHero
        brand={intake.brand}
        monthlyRevenue={deliveredRevenue}
        totalCost={calc.total}
        breakdown={breakdown}
        effectivePct={!calc.belowMin ? calc.effectivePct : undefined}
        effectiveLabel="Effectief op adspend"
        note={note}
      />

      <section>
        <div className="mb-6">
          <h3 className="text-xl font-semibold tracking-tight text-[#0a0a0a]">
            Scenario&apos;s doorrekenen
          </h3>
          <p className="mt-1 text-sm text-[#6b7280]">
            Pas de adspend aan — de projectie werkt live mee.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
          <div className="space-y-4 lg:col-span-2">
            <div className="rounded-2xl border border-[#e2e4ea] bg-white p-5">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9ca3af]">
                Maandelijkse adspend
              </div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-medium text-[#9ca3af]">€</span>
                <input
                  type="text"
                  value={adspendInput}
                  onChange={(e) => setAdspendInput(e.target.value)}
                  className="w-full rounded-lg border border-[#e2e4ea] bg-white px-3 py-3 text-2xl font-semibold text-[#0a0a0a] outline-none transition-colors focus:border-[#E30613]"
                />
              </div>
              <p className="mt-3 text-[11px] text-[#9ca3af]">
                Afgeleid uit revenue ÷ schaal ROAS ={" "}
                {formatEur(derivedAdspend)}. Pas aan indien nodig.
              </p>
            </div>

            <div className="rounded-2xl border border-[#e2e4ea] bg-white p-5">
              <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9ca3af]">
                Adspend fee brackets
              </div>
              <div className="grid grid-cols-2 gap-2">
                {SUB_BRACKETS.map((b, i) => {
                  const active = calc.activeIdx >= i && !calc.belowMin;
                  return (
                    <div
                      key={i}
                      className={
                        "rounded-lg border px-3 py-3 text-center transition-all " +
                        (active
                          ? "border-[#E30613] bg-[#fef2f2]"
                          : "border-[#e2e4ea] bg-white")
                      }
                    >
                      <div className="text-[9px] uppercase tracking-[0.2em] text-[#9ca3af]">
                        {b.max === Number.POSITIVE_INFINITY
                          ? `€ ${b.min / 1000}k+`
                          : `€ ${b.min / 1000}k – ${b.max / 1000}k`}
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
            </div>

            {calc.brackets.length > 0 && (
              <div className="rounded-2xl border border-[#e2e4ea] bg-white p-5">
                <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9ca3af]">
                  Opbouw
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-[#6b7280]">
                    <span>Base fee</span>
                    <span className="font-medium tabular-nums text-[#0a0a0a]">
                      {formatEur(BASE_FEE)}
                    </span>
                  </div>
                  {calc.brackets.map((b, i) => (
                    <div
                      key={i}
                      className="flex justify-between text-[#6b7280]"
                    >
                      <span>
                        {b.range} × {b.pct}%
                      </span>
                      <span className="font-medium tabular-nums text-[#0a0a0a]">
                        {formatEur(b.fee)}
                      </span>
                    </div>
                  ))}
                  <div className="mt-2 flex justify-between border-t border-[#e2e4ea] pt-2">
                    <span className="font-semibold text-[#0a0a0a]">
                      Totaal{calc.capped ? " (cap)" : ""}
                    </span>
                    <span className="font-semibold tabular-nums text-[#E30613]">
                      {formatEur(calc.total)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-3">
            <div className="rounded-2xl border border-[#e2e4ea] bg-white p-6">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9ca3af]">
                Fee bij verschillende adspend niveaus
              </div>
              <div className="text-sm text-[#6b7280]">
                Rode staaf = huidige adspend
              </div>
              <div className="mt-5 h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
                  >
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
                        <Cell key={i} fill={d.isCurrent ? "#E30613" : "#e5e7eb"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="flex items-center justify-between gap-4 rounded-xl border border-[#e2e4ea] bg-white px-5 py-4 text-xs text-[#6b7280]">
        <span>
          <span className="font-semibold text-[#0a0a0a]">Eenmalige startup fee </span>
          € {STARTUP_FEE.toLocaleString("nl-NL")} · onboarding, strategie en
          account setup.
        </span>
      </div>

      <GuaranteesSubscription />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Reusable sub-components
// -----------------------------------------------------------------------------
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
              pct={`${p.pct.toString().replace(".", ",")}%`}
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
        (active ? "border-[#E30613] bg-[#fef2f2]" : "border-[#e2e4ea] bg-[#fafafa]")
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

function Footer() {
  return (
    <footer className="mt-10 flex items-center justify-between border-t border-[#e2e4ea] pt-4 text-[10px] text-[#9ca3af]">
      <span>Pinformance — Pinterest Performance Advertising</span>
      <span>pinformance-agency.com</span>
    </footer>
  );
}
