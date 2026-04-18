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
      { roas: 2, pct: 2 },
      { roas: 2.5, pct: 3 },
      { roas: 3, pct: 4 },
    ],
  },
  low: {
    id: "low",
    title: "First purchase",
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
  return intake.breakEvenRoas >= 1.5 ? "high" : "low";
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
            <FormField
              step={3}
              label="Break-even ROAS"
              hint="Bij welke ROAS zijn jullie kostendekkend? Bijvoorbeeld 1,6."
            >
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  inputMode="decimal"
                  value={berInput}
                  onChange={(e) => setBerInput(e.target.value)}
                  placeholder="1,6"
                  className="w-32 rounded-lg border border-[#e2e4ea] bg-white px-4 py-3 text-center text-lg font-semibold text-[#0a0a0a] outline-none transition-colors placeholder:text-[#d1d5db] focus:border-[#E30613]"
                />
                <span className="text-xs text-[#9ca3af]">Alles daarboven = winst</span>
              </div>
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
          hint="Wat willen jullie per maand via Pinterest binnenhalen?"
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
              <span>
                <span className="text-white/50">Businessmodel:</span>{" "}
                <span className="font-semibold text-white">
                  {intake.businessModel === "subscription" ? "Subscription" : "First purchase"}
                </span>
              </span>
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
// Revenue hero — the eye-catcher
// -----------------------------------------------------------------------------
function RevenueHero({
  brand,
  monthlyRevenue,
}: {
  brand: string;
  monthlyRevenue: number;
}) {
  const yearly = monthlyRevenue * 12;
  return (
    <div className="relative overflow-hidden rounded-2xl border border-[#E30613]/20 bg-gradient-to-br from-[#E30613] via-[#c10510] to-[#9a040d] p-8 text-white shadow-[0_20px_60px_rgba(227,6,19,0.25)] sm:p-10">
      {/* Decorative radial glow */}
      <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-20 h-72 w-72 rounded-full bg-black/20 blur-3xl" />

      <div className="relative">
        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/80">
          Wat Pinformance oplevert voor {brand}
        </div>
        <div className="mt-3 flex items-baseline gap-3">
          <span className="text-5xl font-bold tracking-tight sm:text-7xl">
            {formatEur(monthlyRevenue)}
          </span>
          <span className="text-lg font-medium text-white/80 sm:text-xl">
            / maand
          </span>
        </div>
        <p className="mt-3 max-w-xl text-base text-white/85 sm:text-lg">
          Extra maandelijkse omzet via Pinterest — een volledig nieuw, schaalbaar
          acquisitiekanaal naast je bestaande inspanningen.
        </p>

        <div className="mt-6 inline-flex items-center gap-3 rounded-full border border-white/20 bg-white/10 px-5 py-2.5 text-sm font-semibold backdrop-blur">
          <span className="h-2 w-2 rounded-full bg-white" />
          <span>
            Oftewel{" "}
            <span className="text-white">{formatEur(yearly)}</span> extra omzet
            op jaarbasis
          </span>
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Guarantees — 3 prominent cards that claim our promises
// -----------------------------------------------------------------------------
function GuaranteesFirstPurchase({ model }: { model: FpModel }) {
  return (
    <GuaranteesGrid
      title="Onze garanties voor jou"
      subtitle="Transparant, meetbaar, en zonder kleine lettertjes."
      items={[
        {
          icon: "🛡",
          headline: `Garantie ROAS ${model.guaranteeRoas.toString().replace(".", ",")}`,
          body: `Onder een ROAS van ${model.guaranteeRoas.toString().replace(".", ",")} betaal je 0 performance fee. Wij dragen het risico van prestatie.`,
          accent: "Zero-fee zone",
        },
        {
          icon: "📈",
          headline: `Performance fee vanaf € ${MIN_REVENUE_FOR_PERF.toLocaleString("nl-NL")}`,
          body: `Pas wanneer Pinterest minimaal € ${MIN_REVENUE_FOR_PERF.toLocaleString("nl-NL")} per maand voor je genereert, wordt er performance fee berekend. Daaronder alleen de vaste base fee.`,
          accent: "Drempel",
        },
        {
          icon: "🔒",
          headline: `Maximale fee € ${CAP.toLocaleString("nl-NL")}`,
          body: `Onze totale maandelijkse fee kan nooit hoger zijn dan € ${CAP.toLocaleString("nl-NL")}. Een harde cap — hoe hard we ook groeien.`,
          accent: "Hard cap",
        },
      ]}
    />
  );
}

function GuaranteesSubscription() {
  return (
    <GuaranteesGrid
      title="Onze garanties voor jou"
      subtitle="Transparant, meetbaar, en zonder kleine lettertjes."
      items={[
        {
          icon: "🛡",
          headline: "Garantie ROAS per contract",
          body: "De minimum ROAS die wij garanderen leggen we vooraf contractueel vast op basis van jullie business. Halen we die niet? Dan geen fee.",
          accent: "Contractueel",
        },
        {
          icon: "📈",
          headline: `Adspend fee vanaf € ${MIN_ADSPEND_FOR_FEE.toLocaleString("nl-NL")}`,
          body: `Pas wanneer de maandelijkse adspend minimaal € ${MIN_ADSPEND_FOR_FEE.toLocaleString("nl-NL")} is, wordt er adspend fee berekend. Daaronder alleen de vaste base fee.`,
          accent: "Drempel",
        },
        {
          icon: "🔒",
          headline: `Maximale fee € ${CAP.toLocaleString("nl-NL")}`,
          body: `Onze totale maandelijkse fee kan nooit hoger zijn dan € ${CAP.toLocaleString("nl-NL")}. Een harde cap — hoe hard we ook groeien.`,
          accent: "Hard cap",
        },
      ]}
    />
  );
}

function GuaranteesGrid({
  title,
  subtitle,
  items,
}: {
  title: string;
  subtitle: string;
  items: { icon: string; headline: string; body: string; accent: string }[];
}) {
  return (
    <section>
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h3 className="text-xl font-bold tracking-tight text-[#0a0a0a] sm:text-2xl">
            {title}
          </h3>
          <p className="mt-1 text-sm text-[#6b7280]">{subtitle}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {items.map((it, i) => (
          <div
            key={i}
            className="relative overflow-hidden rounded-2xl border border-[#e2e4ea] bg-white p-6 shadow-sm transition-all hover:border-[#E30613]/30 hover:shadow-[0_12px_32px_rgba(227,6,19,0.08)]"
          >
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#E30613] to-transparent" />
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#fef2f2] text-lg">
                {it.icon}
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-widest text-[#E30613]">
                  {it.accent}
                </div>
                <div className="mt-1 text-lg font-bold leading-tight text-[#0a0a0a]">
                  {it.headline}
                </div>
              </div>
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
    if (Number.isNaN(revenue) || revenue <= 0) return [];
    const min = model.guaranteeRoas;
    const max = model.points[model.points.length - 1].roas + 0.5;
    const steps = 12;
    const out: { roas: string; total: number; revenue: number }[] = [];
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
        total: Math.round(tot),
        revenue: Math.round(revenue),
      });
    }
    return out;
  }, [model, revenue]);

  return (
    <div className="space-y-8">
      {/* 1. The big revenue hero — what we deliver */}
      <RevenueHero brand={intake.brand} monthlyRevenue={revenue} />

      {/* 2. Guarantees — our promises, big and clear */}
      <GuaranteesFirstPurchase model={model} />

      {/* 3. Investment section — kept compact so it feels 'worth every cent' */}
      <section>
        <div className="mb-4">
          <h3 className="text-xl font-bold tracking-tight text-[#0a0a0a] sm:text-2xl">
            Jouw investering
          </h3>
          <p className="mt-1 text-sm text-[#6b7280]">
            Aanpasbaar — tijdens de call kunnen we live scenario&apos;s doorrekenen.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          {/* Inputs */}
          <div className="space-y-4 lg:col-span-2">
            <div className="rounded-2xl border border-[#e2e4ea] bg-white p-5 shadow-sm">
              <div className="mb-1 text-[10px] font-medium uppercase tracking-widest text-[#9ca3af]">
                Behaalde ROAS
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
                    <span className="text-2xl font-bold text-[#E30613]">
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
                Maandelijkse revenue
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
                  Onder € {MIN_REVENUE_FOR_PERF.toLocaleString("nl-NL")} revenue — performance fee nog niet actief
                </div>
              )}
            </div>

            <TiersCard model={model} activeRoas={roas} />
          </div>

          {/* Cost breakdown */}
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

            <div className="rounded-xl border border-[#e2e4ea] bg-white p-4 text-xs text-[#6b7280]">
              <span className="font-semibold text-[#0a0a0a]">Eenmalige startup fee: </span>
              € {STARTUP_FEE.toLocaleString("nl-NL")} — voor onboarding, strategie en
              account setup.
            </div>

            <div className="rounded-2xl border border-[#e2e4ea] bg-white p-5 shadow-sm">
              <div className="mb-1">
                <div className="text-[10px] font-medium uppercase tracking-widest text-[#9ca3af]">
                  Scenario analyse
                </div>
                <div className="mt-1 text-sm font-semibold text-[#0a0a0a]">
                  Fee bij verschillende ROAS — revenue blijft {formatEur(revenue)}
                </div>
              </div>

              <div className="mt-4 h-56 w-full">
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
                      formatter={(value) => [formatEur(Number(value)), "Pinformance fee"]}
                      labelFormatter={(l) => "ROAS " + l}
                    />
                    <Line
                      type="monotone"
                      dataKey="total"
                      stroke="#E30613"
                      strokeWidth={3}
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

  return (
    <div className="space-y-8">
      <RevenueHero brand={intake.brand} monthlyRevenue={deliveredRevenue} />

      <GuaranteesSubscription />

      <section>
        <div className="mb-4">
          <h3 className="text-xl font-bold tracking-tight text-[#0a0a0a] sm:text-2xl">
            Jouw investering
          </h3>
          <p className="mt-1 text-sm text-[#6b7280]">
            Aanpasbaar — tijdens de call kunnen we live scenario&apos;s doorrekenen.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="space-y-4 lg:col-span-2">
            <div className="rounded-2xl border border-[#e2e4ea] bg-white p-5 shadow-sm">
              <div className="mb-1 text-[10px] font-medium uppercase tracking-widest text-[#9ca3af]">
                Maandelijkse adspend
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
              <p className="mt-2 text-[11px] text-[#9ca3af]">
                Afgeleid uit revenue / schaal ROAS = {formatEur(derivedAdspend)}. Pas aan indien nodig.
              </p>
              {calc.belowMin && (
                <div className="mt-3 rounded-lg border border-[#e2e4ea] bg-[#f0f1f5] px-3 py-2 text-xs text-[#6b7280]">
                  Onder € {MIN_ADSPEND_FOR_FEE.toLocaleString("nl-NL")} — alleen base fee actief
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-[#e2e4ea] bg-white p-5 shadow-sm">
              <div className="mb-3 text-[10px] font-medium uppercase tracking-widest text-[#9ca3af]">
                Adspend fee brackets — progressief
              </div>
              <div className="grid grid-cols-2 gap-2">
                {SUB_BRACKETS.map((b, i) => {
                  const active = calc.activeIdx >= i && !calc.belowMin;
                  return (
                    <div
                      key={i}
                      className={
                        "rounded-lg border px-3 py-3 text-center transition-all " +
                        (active ? "border-[#E30613] bg-[#fef2f2]" : "border-[#e2e4ea] bg-[#fafafa]")
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

            <div className="rounded-xl border border-[#e2e4ea] bg-white p-4 text-xs text-[#6b7280]">
              <span className="font-semibold text-[#0a0a0a]">Eenmalige startup fee: </span>
              € {STARTUP_FEE.toLocaleString("nl-NL")} — voor onboarding, strategie en
              account setup.
            </div>

            <div className="rounded-2xl border border-[#e2e4ea] bg-white p-5 shadow-sm">
              <div className="mb-1">
                <div className="text-[10px] font-medium uppercase tracking-widest text-[#9ca3af]">
                  Scenario analyse
                </div>
                <div className="mt-1 text-sm font-semibold text-[#0a0a0a]">
                  Fee bij verschillende adspend niveaus
                </div>
              </div>

              <div className="mt-4 h-56 w-full">
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
                        <Cell key={i} fill={d.isCurrent ? "#E30613" : "#fca5a5"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      </section>
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

function Footer() {
  return (
    <footer className="mt-10 flex items-center justify-between border-t border-[#e2e4ea] pt-4 text-[10px] text-[#9ca3af]">
      <span>Pinformance — Pinterest Performance Advertising</span>
      <span>pinformance-agency.com</span>
    </footer>
  );
}
