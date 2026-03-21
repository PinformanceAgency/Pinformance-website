"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useOrg } from "@/hooks/use-org";
import { createClient } from "@/lib/supabase/client";
import { IntakeFormStep } from "./steps/intake-form";
import { PinterestSetupStep } from "./steps/pinterest-setup";
import { TrelloAssetsStep } from "./steps/trello-assets";
import { TrackingSetupStep } from "./steps/tracking-setup";
import { TestSaleStep } from "./steps/test-sale";
import { ONBOARDING_STEPS } from "@/lib/constants";
import type { OnboardingStep } from "@/lib/types";
import {
  Loader2,
  Check,
  ClipboardList,
  Pin,
  Layout,
  BarChart3,
  Rocket,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

const STEP_ICONS: Record<string, React.ElementType> = {
  "clipboard-list": ClipboardList,
  pin: Pin,
  layout: Layout,
  "bar-chart-3": BarChart3,
  rocket: Rocket,
};

export default function OnboardingPage() {
  const { org, loading } = useOrg();
  const router = useRouter();
  const [step, setStep] = useState<OnboardingStep>(1);

  useEffect(() => {
    if (org) {
      if (org.onboarding_completed_at) {
        router.push("/overview");
        return;
      }
      setStep((org.onboarding_step || 1) as OnboardingStep);
    }
  }, [org, router]);

  async function advanceStep() {
    const nextStep = (step + 1) as OnboardingStep;
    const supabase = createClient();

    const update: Record<string, unknown> = { onboarding_step: nextStep };
    if (nextStep > 5) {
      update.onboarding_completed_at = new Date().toISOString();
    }

    await supabase.from("organizations").update(update).eq("id", org!.id);

    if (nextStep > 5) {
      router.push("/overview");
    } else {
      setStep(nextStep);
    }
  }

  if (loading || !org) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-7 h-7 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading your workspace…</p>
        </div>
      </div>
    );
  }

  const completedCount = Math.max(0, step - 1);
  const progressPercent = Math.round((completedCount / ONBOARDING_STEPS.length) * 100);

  const noop = () => {};

  const stepComponents: Record<number, React.ReactNode> = {
    1: <IntakeFormStep org={org} onNext={advanceStep} />,
    2: <PinterestSetupStep org={org} onNext={advanceStep} />,
    3: <TrelloAssetsStep org={org} onNext={advanceStep} />,
    4: <TrackingSetupStep org={org} onNext={advanceStep} />,
    5: <TestSaleStep org={org} onNext={advanceStep} />,
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Account Setup</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Complete the steps below to get your Pinterest campaigns ready to launch.
        </p>

        {/* Progress bar */}
        <div className="mt-5">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
            <span>
              {completedCount} of {ONBOARDING_STEPS.length} steps completed
            </span>
            <span className="font-medium text-foreground">{progressPercent}%</span>
          </div>
          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Accordion steps */}
      <div className="space-y-2">
        {ONBOARDING_STEPS.map((stepData) => {
          const isComplete = step > stepData.step;
          const isCurrent = step === stepData.step;
          const isFuture = step < stepData.step;
          const Icon = STEP_ICONS[stepData.icon] || ClipboardList;

          return (
            <div
              key={stepData.step}
              className={cn(
                "rounded-2xl border transition-all duration-300",
                isComplete &&
                  "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/50 dark:bg-emerald-950/20",
                isCurrent && "border-border bg-card shadow-sm",
                isFuture && "border-border/50 bg-card/50 opacity-50"
              )}
            >
              {/* Step header */}
              <div
                className={cn(
                  "flex items-center gap-4 px-5 py-4",
                  isCurrent && "pb-0"
                )}
              >
                {/* Icon / check */}
                <div
                  className={cn(
                    "w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0",
                    isComplete &&
                      "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
                    isCurrent && "bg-primary/10 text-primary",
                    isFuture && "bg-muted text-muted-foreground"
                  )}
                >
                  {isComplete ? (
                    <Check className="w-4 h-4" strokeWidth={2.5} />
                  ) : (
                    <Icon className="w-4 h-4" />
                  )}
                </div>

                {/* Title & description */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "text-sm font-semibold",
                        isComplete &&
                          "text-emerald-700 dark:text-emerald-400 line-through decoration-emerald-400/60",
                        isCurrent && "text-foreground",
                        isFuture && "text-muted-foreground"
                      )}
                    >
                      {stepData.title}
                    </span>
                    {isComplete && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                        Done
                      </span>
                    )}
                    {isFuture && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        Upcoming
                      </span>
                    )}
                  </div>
                  <p
                    className={cn(
                      "text-xs mt-0.5",
                      isComplete &&
                        "text-emerald-600/60 dark:text-emerald-500/50",
                      isCurrent && "text-muted-foreground",
                      isFuture && "text-muted-foreground/60"
                    )}
                  >
                    {stepData.description}
                  </p>
                </div>

                {/* Chevron for current */}
                {isCurrent && (
                  <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                )}
              </div>

              {/* Step form — only shown for the current step */}
              {isCurrent && (
                <div className="px-5 pt-5 pb-6">
                  <div className="border-t border-border/60 pt-5">
                    {stepComponents[stepData.step]}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
