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
  return "€ " + Math.round(n).toLocaleString("en-US");
}

function formatPct(n: number): string {
  return n.toFixed(2) + " %";
}

function parseNumber(s: string): number {
  // Accept both 100,000 and 100.000 as thousands separators
  const cleaned = s.replace(/,/g, "").replace(/\.(?=\d{3}\b)/g, "");
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
  expectedRevenue: number; // first_purchase target
  expectedAdspend: number; // subscription target
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
    expectedAdspend: NaN,
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
    <header className="mb-10 flex flex-col items-center border-b border-[#e2e4ea] pb-10 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.png"
        alt="Pinformance"
        className="h-20 w-20 rounded-2xl shadow-[0_8px_24px_rgba(227,6,19,0.15)] sm:h-24 sm:w-24"
      />
      <h1 className="mt-6 text-4xl font-bold tracking-tight text-[#0a0a0a] sm:text-6xl">
        Pinformance
      </h1>
      <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.3em] text-[#6b7280] sm:text-sm">
        Pinterest Performance Calculator
      </p>
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
    Number.isFinite(intake.breakEvenRoas) ? String(intake.breakEvenRoas)  : ""
  );
  const [targetInput, setTargetInput] = useState(
    Number.isFinite(intake.targetRoas) ? String(intake.targetRoas)  : ""
  );
  const [revenueInput, setRevenueInput] = useState(
    Number.isFinite(intake.expectedRevenue) ? String(Math.round(intake.expectedRevenue)) : ""
  );
  const [adspendInput, setAdspendInput] = useState(
    Number.isFinite(intake.expectedAdspend) ? String(Math.round(intake.expectedAdspend)) : ""
  );

  const ber = parseFloat(berInput.replace(",", "."));
  const target = parseFloat(targetInput.replace(",", "."));
  const revenue = parseNumber(revenueInput);
  const adspend = parseNumber(adspendInput);

  const isSubscription = intake.businessModel === "subscription";

  const canSubmit =
    intake.brand.trim().length > 0 &&
    (isSubscription || (Number.isFinite(ber) && ber > 0)) &&
    Number.isFinite(target) &&
    target > 0 &&
    (isSubscription
      ? Number.isFinite(adspend) && adspend > 0
      : Number.isFinite(revenue) && revenue > 0);

  function handleSubmit() {
    if (!canSubmit) return;
    setIntake({
      ...intake,
      breakEvenRoas: ber,
      targetRoas: target,
      expectedRevenue: isSubscription ? NaN : revenue,
      expectedAdspend: isSubscription ? adspend : NaN,
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
          Let&apos;s see what you&apos;re currently missing out on
        </h1>
      </div>

      <div className="rounded-2xl border border-[#e2e4ea] bg-white p-6 shadow-sm sm:p-8">
        <FormField step={1} label="Brand name">
          <input
            type="text"
            value={intake.brand}
            onChange={(e) => setIntake({ ...intake, brand: e.target.value })}
            placeholder=""
            className="w-full rounded-lg border border-[#e2e4ea] bg-white px-4 py-3 text-lg font-semibold text-[#0a0a0a] outline-none transition-colors focus:border-[#E30613]"
          />
        </FormField>

        <Divider />

        <FormField step={2} label="Business model">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ModelCard
              active={intake.businessModel === "first_purchase"}
              onClick={() => setIntake({ ...intake, businessModel: "first_purchase" })}
              title="First purchase"
              description="One-time purchases. Performance fee on achieved ROAS."
            />
            <ModelCard
              active={intake.businessModel === "subscription"}
              onClick={() => setIntake({ ...intake, businessModel: "subscription" })}
              title="Subscription"
              description="Recurring subscription model. Adspend fee structure."
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
                placeholder="1.6"
                className="w-32 rounded-lg border border-[#e2e4ea] bg-white px-4 py-3 text-center text-lg font-semibold text-[#0a0a0a] outline-none transition-colors placeholder:text-[#d1d5db] focus:border-[#E30613]"
              />
            </FormField>
          </>
        )}

        <Divider />

        <FormField
          step={isSubscription ? 3 : 4}
          label={isSubscription ? "Minimum ROAS" : "Target ROAS"}
          hint={
            isSubscription
              ? "The ROAS floor we commit to in the contract."
              : "Your current ROAS on Meta, Google, TikTok or another platform."
          }
        >
          <div className="flex items-center gap-3">
            <input
              type="text"
              inputMode="decimal"
              value={targetInput}
              onChange={(e) => setTargetInput(e.target.value)}
              placeholder={isSubscription ? "1.0" : "2.1"}
              className="w-32 rounded-lg border border-[#e2e4ea] bg-white px-4 py-3 text-center text-lg font-semibold text-[#0a0a0a] outline-none transition-colors placeholder:text-[#d1d5db] focus:border-[#E30613]"
            />
          </div>
        </FormField>

        <Divider />

        <FormField
          step={isSubscription ? 4 : 5}
          label={
            isSubscription
              ? "Monthly adspend target"
              : "Monthly revenue target from Pinterest"
          }
        >
          <div className="flex items-center gap-2">
            <span className="text-xl font-semibold text-[#9ca3af]">€</span>
            <input
              type="text"
              inputMode="numeric"
              value={isSubscription ? adspendInput : revenueInput}
              onChange={(e) =>
                isSubscription
                  ? setAdspendInput(e.target.value)
                  : setRevenueInput(e.target.value)
              }
              placeholder={isSubscription ? "50,000" : "100,000"}
              className="w-48 rounded-lg border border-[#e2e4ea] bg-white px-4 py-3 text-lg font-semibold text-[#0a0a0a] outline-none transition-colors placeholder:text-[#d1d5db] focus:border-[#E30613]"
            />
            <span className="text-xs text-[#9ca3af]">per month</span>
          </div>
        </FormField>

        <div className="mt-8 flex items-center justify-end border-t border-[#e2e4ea] pt-6">
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
            Show offer →
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
              Your Pinformance offer
            </div>
            <h2 className="mt-1 text-2xl font-bold text-white sm:text-3xl">
              {intake.brand}
            </h2>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/70">
              {intake.businessModel === "first_purchase" && (
                <span>
                  <span className="text-white/50">Break-even ROAS:</span>{" "}
                  <span className="font-semibold text-white">
                    {intake.breakEvenRoas.toFixed(1)}
                  </span>
                </span>
              )}
              <span>
                <span className="text-white/50">
                  {intake.businessModel === "subscription"
                    ? "Minimum ROAS:"
                    : "Target ROAS:"}
                </span>{" "}
                <span className="font-semibold text-white">
                  {intake.targetRoas.toFixed(1)}
                </span>
              </span>
              {intake.businessModel === "subscription" ? (
                <span>
                  <span className="text-white/50">Adspend target:</span>{" "}
                  <span className="font-semibold text-white">
                    {formatEur(intake.expectedAdspend)}/mo
                  </span>
                </span>
              ) : (
                <span>
                  <span className="text-white/50">Revenue target:</span>{" "}
                  <span className="font-semibold text-white">
                    {formatEur(intake.expectedRevenue)}/mo
                  </span>
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onBack}
            className="shrink-0 rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-xs font-medium text-white/80 transition-all hover:bg-white/10 hover:text-white"
          >
            ← Edit
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
function ThenVsNowHero({
  brand,
  projection,
  projectionLabel,
  projectionDescription,
  currentlyLabel,
  currentlyCopy,
}: {
  brand: string;
  projection: number;
  projectionLabel: string;
  projectionDescription: string;
  currentlyLabel: string;
  currentlyCopy: string;
}) {
  const projectionNum = Math.round(projection).toLocaleString("en-US");

  return (
    <div className="relative overflow-hidden rounded-3xl border border-[#e2e4ea] bg-white shadow-[0_20px_80px_rgba(10,10,10,0.06)]">
      {/* Meta strip */}
      <div className="relative flex items-center justify-between gap-3 border-b border-[#e2e4ea] bg-gradient-to-b from-[#fafbfc] to-white px-8 py-3.5 sm:px-10 lg:px-14">
        <div className="flex items-center gap-2.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[#E30613]" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#6b7280]">
            Tailored proposal · {brand}
          </span>
        </div>
        <span className="hidden text-[10px] font-medium uppercase tracking-[0.3em] text-[#c1c5cf] sm:inline">
          Pinformance
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12">
        {/* LEFT — Currently (quieter, smaller column) */}
        <div className="relative border-b border-[#e2e4ea] bg-gradient-to-br from-[#fafbfc] to-[#f4f5f8] p-10 sm:p-12 lg:col-span-5 lg:border-b-0 lg:border-r lg:p-14">
          <div className="text-xl font-semibold text-[#9ca3af] sm:text-2xl lg:text-3xl">
            {currentlyLabel}
          </div>
          <div className="mt-6 flex items-start gap-1.5">
            <span className="mt-2 text-xl font-semibold text-[#b8bcc6] sm:mt-3 sm:text-2xl lg:text-3xl">
              €
            </span>
            <span className="text-5xl font-bold leading-none tracking-tight tabular-nums text-[#b8bcc6] sm:text-6xl lg:text-7xl">
              0
            </span>
          </div>
          <div className="mt-3 text-[10px] font-semibold uppercase tracking-[0.25em] text-[#b8bcc6]">
            Per month
          </div>
          <p className="mt-8 max-w-xs text-sm leading-relaxed text-[#9ca3af]">
            {currentlyCopy}
          </p>
        </div>

        {/* RIGHT — With Pinformance (dominant column, flat brand red) */}
        <div className="relative overflow-hidden bg-[#E30613] p-10 sm:p-12 lg:col-span-7 lg:p-14">
          {/* Subtle top highlight line */}
          <div className="absolute inset-x-0 top-0 h-px bg-white/25" />
          <div className="relative">
            <div className="text-xl font-semibold text-white sm:text-2xl lg:text-3xl">
              {projectionLabel}
            </div>
            <div className="mt-6 flex items-start gap-2 whitespace-nowrap">
              <span className="mt-2 text-2xl font-semibold text-white/80 sm:mt-3 sm:text-3xl lg:mt-4 lg:text-4xl">
                €
              </span>
              <span className="text-6xl font-bold leading-none tracking-tight tabular-nums text-white sm:text-7xl lg:text-[92px]">
                {projectionNum}
              </span>
            </div>
            <div className="mt-3 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/70">
              Per month
            </div>
            <p className="mt-8 max-w-md text-base leading-relaxed text-white/85">
              {projectionDescription}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function CompactCostCard({
  totalCost,
  breakdown,
  effectivePct,
  effectiveLabel,
  note,
}: {
  totalCost: number;
  breakdown: { label: string; value: string }[];
  effectivePct?: number;
  effectiveLabel?: string;
  note?: string;
}) {
  return (
    <div className="rounded-2xl border border-[#e2e4ea] bg-white p-6 sm:p-8">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-baseline">
        <div className="lg:col-span-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[#9ca3af]">
            Pinformance cost
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-[#0a0a0a] sm:text-4xl">
              {formatEur(totalCost)}
            </span>
            <span className="text-sm text-[#9ca3af]">/month</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-4 text-sm lg:col-span-8 lg:justify-end">
          {breakdown.map((b, i) => (
            <div key={i}>
              <div className="text-[10px] font-medium uppercase tracking-widest text-[#9ca3af]">
                {b.label}
              </div>
              <div className="mt-1 font-semibold tabular-nums text-[#0a0a0a]">
                {b.value}
              </div>
            </div>
          ))}
          {effectivePct !== undefined && effectivePct > 0 && (
            <div>
              <div className="text-[10px] font-medium uppercase tracking-widest text-[#9ca3af]">
                {effectiveLabel ?? "Effective"}
              </div>
              <div className="mt-1 font-semibold tabular-nums text-[#E30613]">
                {effectivePct.toFixed(2)} %
              </div>
            </div>
          )}
        </div>
      </div>
      {note && (
        <p className="mt-5 border-t border-[#e2e4ea] pt-4 text-xs text-[#9ca3af]">
          {note}
        </p>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Guarantees — 3 prominent cards that claim our promises
// -----------------------------------------------------------------------------
function GuaranteesFirstPurchase({ model }: { model: FpModel }) {
  const g = model.guaranteeRoas.toString();
  return (
    <GuaranteesGrid
      items={[
        {
          label: "Guarantee",
          headline: `ROAS below ${g} — no fee`,
          body: `If we don't hit a ROAS of ${g}, you pay no performance fee. We carry the performance risk.`,
        },
        {
          label: "Threshold",
          headline: `Only from € ${MIN_REVENUE_FOR_PERF.toLocaleString("en-US")} revenue`,
          body: `Below this monthly revenue, only the base fee applies. No variable cost.`,
        },
        {
          label: "Maximum",
          headline: `Fee capped at € ${CAP.toLocaleString("en-US")} per month`,
          body: `Our total monthly fee never goes above this, however far we scale.`,
        },
        {
          label: "Invoicing",
          headline: "After the month, never before",
          body: "The performance fee is calculated and invoiced at month-end, on actual results. You earn first, pay after.",
        },
      ]}
    />
  );
}

function GuaranteesSubscription({ minimumRoas }: { minimumRoas: number }) {
  const roasLabel = Number.isFinite(minimumRoas) ? minimumRoas.toFixed(1) : "—";
  return (
    <GuaranteesGrid
      items={[
        {
          label: "Guarantee",
          headline: `Minimum ROAS ${roasLabel}`,
          body: `We commit to a ROAS of at least ${roasLabel} in the contract. If we fall below, you pay no adspend fee. On us.`,
        },
        {
          label: "Threshold",
          headline: `Only from € ${MIN_ADSPEND_FOR_FEE.toLocaleString("en-US")} adspend`,
          body: `Below this monthly adspend, only the base fee applies. No variable cost.`,
        },
        {
          label: "Maximum",
          headline: `Fee capped at € ${CAP.toLocaleString("en-US")} per month`,
          body: `Our total monthly fee never goes above this, however far we scale.`,
        },
        {
          label: "Invoicing",
          headline: "After the month, never before",
          body: "The adspend fee is calculated and invoiced at month-end, on actual adspend. You run first, pay after.",
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
        <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#E30613]">
          Zero risk on our side
        </div>
        <h3 className="mt-2 text-2xl font-semibold tracking-tight text-[#0a0a0a] sm:text-3xl">
          Guarantees & terms
        </h3>
        <p className="mt-1 text-sm text-[#6b7280]">
          Captured in the NDA and service agreement.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {items.map((it, i) => (
          <div
            key={i}
            className="group relative overflow-hidden rounded-2xl border border-[#e2e4ea] bg-white p-7 shadow-[0_4px_16px_rgba(10,10,10,0.03)] transition-all hover:border-[#E30613]/30 hover:shadow-[0_12px_32px_rgba(227,6,19,0.08)]"
          >
            {/* Red top accent line */}
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#E30613] via-[#E30613]/60 to-transparent" />
            {/* Subtle red glow on hover */}
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
    intake.targetRoas.toFixed(1) 
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
        roas: r.toFixed(1),
        pct: pct ?? 0,
      });
    }
    return out;
  }, [model]);

  let note: string | undefined;
  if (belowGuarantee) {
    note = `Below the guaranteed ROAS of ${model.guaranteeRoas.toString()}. No performance fee.`;
  } else if (belowMinRev) {
    note = `Below € ${MIN_REVENUE_FOR_PERF.toLocaleString("en-US")} monthly revenue. Base fee only.`;
  } else if (capped) {
    note = `Cap reached. Our fee stays at € ${CAP.toLocaleString("en-US")} per month.`;
  }

  const perfLabel =
    belowGuarantee || perfPct === null
      ? "Performance fee"
      : `Performance fee (${formatPct(perfPct)})`;

  return (
    <div className="space-y-12">
      {/* 1. Hero — what you earn */}
      <ThenVsNowHero
        brand={intake.brand}
        projection={revenue}
        projectionLabel="Revenue you're missing out on"
        projectionDescription="Extra monthly revenue from purely Pinterest."
        currentlyLabel="Pinterest performance revenue"
        currentlyCopy="No Pinterest performance channel running today."
      />

      {/* 2. Guarantees — what we commit to (de-risks the cost reveal next) */}
      <GuaranteesFirstPurchase model={model} />

      <section>
        <div className="mb-6">
          <h3 className="text-xl font-semibold tracking-tight text-[#0a0a0a]">
            Your investment
          </h3>
        </div>

        {/* LIVE ADJUST panel — obvious inputs with quick presets */}
        <AdjustPanel>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <AdjustInput
              label="Achieved ROAS"
              value={roasInput}
              onChange={setRoasInput}
              presets={model.points.map((p) => ({
                label: p.roas.toString(),
                value: p.roas.toString(),
              }))}
            />
            <AdjustInput
              label="Monthly revenue"
              value={revenueInput}
              onChange={setRevenueInput}
              prefix="€"
              presets={[
                { label: "€ 50k", value: "50000" },
                { label: "€ 100k", value: "100000" },
                { label: "€ 250k", value: "250000" },
                { label: "€ 500k", value: "500000" },
              ]}
            />
          </div>
        </AdjustPanel>

        {note && (
          <div className="mt-5 rounded-xl border border-[#fce4e4] bg-[#fef2f2] px-4 py-3 text-xs text-[#E30613]">
            {note}
          </div>
        )}

        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-5">
          <div className="space-y-4 lg:col-span-2">
            <TiersCard
              model={model}
              activeRoas={roas}
              breakdown={{
                scenarioLabel:
                  !Number.isNaN(roas) && !Number.isNaN(revenue) && revenue > 0 ? (
                    <span>
                      At ROAS{" "}
                      <span className="text-[#E30613]">{roasInput}</span>
                      {" · "}
                      <span className="text-[#E30613]">
                        {formatEur(revenue)}
                      </span>{" "}
                      revenue
                    </span>
                  ) : (
                    "Fee breakdown"
                  ),
                items: [
                  { label: "Base fee", value: formatEur(BASE_FEE) },
                  {
                    label: "Performance fee",
                    value: formatEur(perfFee),
                    hint:
                      !belowGuarantee && !belowMinRev && perfPct !== null
                        ? formatPct(perfPct)
                        : undefined,
                  },
                ],
                total: {
                  label: "Total / month",
                  value: formatEur(total),
                  hint:
                    !belowMinRev && !belowGuarantee && revenue > 0
                      ? `Eff. ${effectivePct.toFixed(2)} %`
                      : undefined,
                },
              }}
            />
          </div>

          <div className="lg:col-span-3">
            <div className="rounded-2xl border border-[#e2e4ea] bg-white p-6">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9ca3af]">
                Performance fee at different ROAS
              </div>
              <div className="text-base font-semibold text-[#0a0a0a]">
                At monthly revenue of{" "}
                <span className="text-[#E30613]">{formatEur(revenue)}</span>
              </div>
              <div className="mt-5 h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 18 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e4ea" vertical={false} />
                    <XAxis
                      dataKey="roas"
                      tick={{ fontSize: 11, fill: "#6b7280" }}
                      axisLine={{ stroke: "#e2e4ea" }}
                      tickLine={false}
                      label={{
                        value: "ROAS",
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
                      tickFormatter={(v) => Number(v).toFixed(1) + " %"}
                      label={{
                        value: "PERFORMANCE FEE",
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
                        Number(value).toFixed(2) + " %",
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

      {/* 5. Setup — natural next-step */}
      <SetupFeeSection />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Subscription panel
// -----------------------------------------------------------------------------
function SubscriptionPanel({ intake }: { intake: Intake }) {
  const intakeAdspend = Number.isFinite(intake.expectedAdspend)
    ? Math.round(intake.expectedAdspend)
    : 25_000;

  const [adspendInput, setAdspendInput] = useState(String(intakeAdspend));
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
        flatPct: 0,
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
        flatPct: 0,
      };
    }
    // Flat rate: find the bracket the adspend sits in and apply that
    // percentage to the ENTIRE adspend — not progressive per bracket.
    let activeIdx = -1;
    let flatPct = 0;
    for (let i = 0; i < SUB_BRACKETS.length; i++) {
      const b = SUB_BRACKETS[i];
      if (adspend >= b.min && adspend < b.max) {
        activeIdx = i;
        flatPct = b.pct;
        break;
      }
    }
    const b = SUB_BRACKETS[activeIdx];
    const rangeLabel =
      b.max === Number.POSITIVE_INFINITY
        ? `€ ${(b.min / 1000).toFixed(0)}k+`
        : `€ ${(b.min / 1000).toFixed(0)}k – ${(b.max / 1000).toFixed(0)}k`;
    let fee = Math.round(adspend * (flatPct / 100));
    const maxFee = CAP - BASE_FEE;
    const isCapped = fee > maxFee;
    if (isCapped) fee = maxFee;
    const brackets = [
      { range: rangeLabel, pct: flatPct, fee },
    ];
    const tot = BASE_FEE + fee;
    return {
      brackets,
      adspendFee: fee,
      capped: isCapped,
      total: tot,
      belowMin: false,
      effectivePct: (tot / adspend) * 100,
      activeIdx,
      flatPct,
    };
  }, [adspend]);

  const chartData = useMemo(() => {
    // One point per bracket boundary — shows the step-down in fee as
    // adspend scales up. Labels use the bracket start.
    return SUB_BRACKETS.map((b, i) => ({
      adspend:
        b.max === Number.POSITIVE_INFINITY
          ? `€ ${(b.min / 1000).toFixed(0)}k+`
          : `€ ${(b.min / 1000).toFixed(0)}k`,
      pct: b.pct,
      isCurrent: i === calc.activeIdx && !calc.belowMin,
    }));
  }, [calc.activeIdx, calc.belowMin]);

  let note: string | undefined;
  if (calc.belowMin) {
    note = `Below € ${MIN_ADSPEND_FOR_FEE.toLocaleString("en-US")} adspend. Base fee only.`;
  } else if (calc.capped) {
    note = `Cap reached. Our fee stays at € ${CAP.toLocaleString("en-US")} per month.`;
  }

  const breakdown: { label: string; value: string }[] = [
    { label: "Base fee", value: formatEur(BASE_FEE) },
    { label: "Adspend fee", value: formatEur(calc.adspendFee) },
  ];

  return (
    <div className="space-y-12">
      <ThenVsNowHero
        brand={intake.brand}
        projection={adspend}
        projectionLabel="Monthly Pinterest adspend"
        projectionDescription="The media budget we run on Pinterest for you. The rate drops as you scale — more adspend, lower percentage."
        currentlyLabel="Active Pinterest adspend"
        currentlyCopy="No Pinterest performance channel running today."
      />

      <GuaranteesSubscription minimumRoas={intake.targetRoas} />

      <section>
        <div className="mb-6">
          <h3 className="text-xl font-semibold tracking-tight text-[#0a0a0a]">
            Your investment
          </h3>
        </div>

        <AdjustPanel>
          <div className="grid grid-cols-1 gap-6">
            <AdjustInput
              label="Monthly adspend"
              value={adspendInput}
              onChange={setAdspendInput}
              prefix="€"
              accent={{
                text:
                  "Intake target " + formatEur(intakeAdspend),
                tone: "gray",
              }}
              presets={[
                { label: "€ 10k", value: "10000" },
                { label: "€ 25k", value: "25000" },
                { label: "€ 50k", value: "50000" },
                { label: "€ 100k", value: "100000" },
                { label: "€ 200k", value: "200000" },
              ]}
            />
          </div>
        </AdjustPanel>

        {note && (
          <div className="mt-5 rounded-xl border border-[#fce4e4] bg-[#fef2f2] px-4 py-3 text-xs text-[#E30613]">
            {note}
          </div>
        )}

        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-5">
          <div className="space-y-4 lg:col-span-2">
            <div className="rounded-2xl border border-[#e2e4ea] bg-white p-5 shadow-sm">
              <div className="mb-3 text-[10px] font-medium uppercase tracking-widest text-[#9ca3af]">
                Adspend fee brackets
              </div>
              <div className="grid grid-cols-2 gap-2">
                {SUB_BRACKETS.map((b, i) => {
                  const active = calc.activeIdx === i && !calc.belowMin;
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
              {calc.brackets.length > 0 && (
                <BreakdownFooter
                  scenarioLabel={
                    <span>
                      At{" "}
                      <span className="text-[#E30613]">
                        {formatEur(adspend)}
                      </span>{" "}
                      adspend
                    </span>
                  }
                  items={[
                    { label: "Base fee", value: formatEur(BASE_FEE) },
                    ...calc.brackets.map((b) => ({
                      label: `${formatEur(adspend)} × ${b.pct}%`,
                      value: formatEur(b.fee),
                    })),
                  ]}
                  total={{
                    label: `Total${calc.capped ? " (cap)" : ""}`,
                    value: formatEur(calc.total),
                    hint:
                      !calc.belowMin && adspend > 0
                        ? `Eff. ${calc.effectivePct.toFixed(1)} %`
                        : undefined,
                  }}
                />
              )}
            </div>
          </div>

          <div className="lg:col-span-3">
            <div className="rounded-2xl border border-[#e2e4ea] bg-white p-6">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9ca3af]">
                Adspend fee rate per bracket
              </div>
              <div className="text-base font-semibold text-[#0a0a0a]">
                At monthly adspend of{" "}
                <span className="text-[#E30613]">{formatEur(adspend)}</span>
              </div>
              <div className="mt-5 h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={chartData}
                    margin={{ top: 8, right: 24, left: 8, bottom: 18 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e4ea" vertical={false} />
                    <XAxis
                      dataKey="adspend"
                      tick={{ fontSize: 11, fill: "#6b7280" }}
                      axisLine={{ stroke: "#e2e4ea" }}
                      tickLine={false}
                      label={{
                        value: "ADSPEND",
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
                      domain={[6, 11]}
                      tickFormatter={(v) => Number(v).toFixed(0) + " %"}
                      label={{
                        value: "ADSPEND FEE",
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
                        "Adspend fee",
                      ]}
                      labelFormatter={(l) => "Adspend " + l}
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
                            key={`sub-dot-${index ?? 0}`}
                            cx={cx}
                            cy={cy}
                            r={isCurrent ? 8 : 4}
                            fill={isCurrent ? "#E30613" : "#fff"}
                            stroke="#E30613"
                            strokeWidth={isCurrent ? 0 : 2}
                          />
                        );
                      }}
                      activeDot={{ r: 8, fill: "#E30613", stroke: "#fff", strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      </section>

      <SetupFeeSection />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Reusable sub-components
// -----------------------------------------------------------------------------
function TiersCard({
  model,
  activeRoas,
  breakdown,
}: {
  model: FpModel;
  activeRoas: number;
  breakdown?: {
    scenarioLabel: React.ReactNode;
    items: { label: string; value: string; hint?: string }[];
    total: { label: string; value: string; hint?: string };
  };
}) {
  const points = model.points;
  return (
    <div className="rounded-2xl border border-[#e2e4ea] bg-white p-5 shadow-sm">
      <div className="mb-3 text-[10px] font-medium uppercase tracking-widest text-[#9ca3af]">
        Performance fee tiers
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
                  ? `ROAS ${p.roas.toString()}+`
                  : `ROAS ${p.roas.toString()}`
              }
              pct={`${p.pct.toString()}%`}
              active={isActive}
            />
          );
        })}
      </div>
      {breakdown && <BreakdownFooter {...breakdown} />}
    </div>
  );
}

function BreakdownFooter({
  scenarioLabel,
  items,
  total,
}: {
  scenarioLabel: React.ReactNode;
  items: { label: string; value: string; hint?: string }[];
  total: { label: string; value: string; hint?: string };
}) {
  return (
    <div className="mt-6 border-t border-[#e2e4ea] pt-6">
      <div className="mb-6 text-center text-sm font-bold uppercase tracking-[0.15em] text-[#0a0a0a] sm:text-base">
        {scenarioLabel}
      </div>
      <div className="space-y-3.5 text-sm">
        {items.map((it, i) => (
          <div key={i} className="flex justify-between">
            <span className="text-[#6b7280]">
              {it.label}
              {it.hint && (
                <span className="text-[#c1c5cf]"> · {it.hint}</span>
              )}
            </span>
            <span className="font-medium tabular-nums text-[#0a0a0a]">
              {it.value}
            </span>
          </div>
        ))}
        <div className="mt-5 flex items-baseline justify-between border-t border-[#e2e4ea] pt-5">
          <span className="font-semibold text-[#0a0a0a]">{total.label}</span>
          <span className="font-semibold tabular-nums text-[#E30613]">
            {total.value}
            {total.hint && (
              <span className="ml-2 text-[10px] font-medium uppercase tracking-wider text-[#9ca3af]">
                {total.hint}
              </span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-[#e2e4ea] bg-white px-5 py-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9ca3af]">
        {label}
      </div>
      <div className="mt-1.5 text-xl font-semibold tabular-nums text-[#0a0a0a] sm:text-2xl">
        {value}
      </div>
      <div className="mt-0.5 min-h-[14px] text-[10px] font-medium text-[#9ca3af]">
        {sub ?? ""}
      </div>
    </div>
  );
}

function AdjustPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-[#E30613]/25 bg-white p-6 shadow-[0_8px_32px_rgba(227,6,19,0.06)] sm:p-7">
      {children}
    </div>
  );
}

function AdjustInput({
  label,
  value,
  onChange,
  prefix,
  accent,
  presets,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  accent?: { text: string; tone: "red" | "gray" };
  presets?: { label: string; value: string }[];
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[#6b7280]">
          {label}
        </div>
        {accent && (
          <span
            className={
              "rounded-full px-2.5 py-1 text-[10px] font-semibold tabular-nums " +
              (accent.tone === "red"
                ? "bg-[#fef2f2] text-[#E30613]"
                : "bg-[#f0f1f5] text-[#6b7280]")
            }
          >
            {accent.text}
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-2 rounded-xl border border-[#e2e4ea] bg-[#fafbfc] px-4 py-3 transition-colors focus-within:border-[#E30613] focus-within:bg-white">
        {prefix && (
          <span className="text-lg font-semibold text-[#9ca3af]">{prefix}</span>
        )}
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent text-2xl font-bold tabular-nums text-[#0a0a0a] outline-none placeholder:text-[#d1d5db] sm:text-3xl"
        />
      </div>
      {presets && presets.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#9ca3af]">
            Try:
          </span>
          {presets.map((p, i) => (
            <button
              key={i}
              onClick={() => onChange(p.value)}
              className={
                "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors " +
                (value === p.value
                  ? "border-[#E30613] bg-[#fef2f2] text-[#E30613]"
                  : "border-[#e2e4ea] bg-white text-[#6b7280] hover:border-[#d1d5db] hover:text-[#0a0a0a]")
              }
              type="button"
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
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

function SetupFeeSection() {
  const items = [
    {
      title: "Pinterest profile setup",
      body: "Branded bio, keyword-led boards, SEO-tuned profile page.",
    },
    {
      title: "Paid advertising setup",
      body: "Ads Manager configured, full-funnel campaign structure.",
    },
    {
      title: "Connecting to our internal AI systems",
      body: "Your ad account plugged into our internal AI stack.",
    },
    {
      title: "Organic setup",
      body: "20+ topic boards, daily Pin schedule, 90-day content calendar.",
    },
    {
      title: "Brand research",
      body: "Buyer persona, competitor audit, keyword + trend deep-dive.",
    },
    {
      title: "Creative gameplan",
      body: "Creative guidance and format direction for what wins on Pinterest.",
    },
    {
      title: "Understanding your internal workprocess and apps",
      body: "Notion, DataAds, Tagbox, Triple Whale, Atria — whatever's in your stack.",
    },
    {
      title: "Dedicated organic dashboard",
      body: "Live view of scheduled Pins, board growth, reach, impressions, and organic revenue.",
    },
  ];
  return (
    <section>
      <div className="mb-6">
        <h3 className="text-xl font-semibold tracking-tight text-[#0a0a0a]">
          Setup
        </h3>
        <p className="mt-1 text-sm text-[#6b7280]">
          What we do before your first month runs.
        </p>
      </div>
      <div className="overflow-hidden rounded-2xl border border-[#e2e4ea] bg-white shadow-[0_8px_32px_rgba(0,0,0,0.04)]">
        {/* TOP: fee badge, centred */}
        <div className="border-b border-[#e2e4ea] bg-[#fafbfc] px-8 py-8 text-center sm:px-10">
          <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[#E30613]">
            One-time setup
          </div>
          <div className="mt-3 text-3xl font-bold tabular-nums text-[#0a0a0a] sm:text-4xl">
            € {STARTUP_FEE.toLocaleString("en-US")}
          </div>
          <div className="mt-2 text-[11px] font-medium uppercase tracking-[0.2em] text-[#9ca3af]">
            Billed once
          </div>
        </div>

        {/* BOTTOM: deliverables grid, 2 cols on md, 4 cols on xl */}
        <div className="px-8 py-8 sm:px-10">
          <div className="mb-6 text-[10px] font-semibold uppercase tracking-[0.25em] text-[#9ca3af]">
            What&apos;s covered
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
            {items.map((it, i) => (
              <div key={i} className="flex gap-3">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#E30613]" />
                <div>
                  <div className="text-sm font-semibold text-[#0a0a0a]">
                    {it.title}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-[#6b7280]">
                    {it.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
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
