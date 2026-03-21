"use client";

import {
  Check,
  Building2,
  ShoppingBag,
  Palette,
  Users,
  Pin,
  Sparkles,
  Rocket,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ONBOARDING_STEPS } from "@/lib/constants";

const STEP_ICONS: Record<string, React.ElementType> = {
  "building-2": Building2,
  "shopping-bag": ShoppingBag,
  palette: Palette,
  users: Users,
  pin: Pin,
  sparkles: Sparkles,
  rocket: Rocket,
};

export function StepIndicator({
  currentStep,
  onGoToStep,
}: {
  currentStep: number;
  onGoToStep?: (step: number) => void;
}) {
  const totalMinutes = ONBOARDING_STEPS.reduce(
    (acc, s) => acc + (s.step >= currentStep ? s.estimatedMinutes : 0),
    0
  );

  const progressPercent = Math.round(
    ((currentStep - 1) / ONBOARDING_STEPS.length) * 100
  );

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-6 pt-6 pb-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center">
            <Pin className="w-4 h-4 text-white" />
          </div>
          <span className="text-white font-semibold text-lg tracking-tight">
            Pinformance
          </span>
        </div>
      </div>

      {/* Progress */}
      <div className="px-6 py-4">
        <div className="flex items-center justify-between text-xs text-white/60 mb-2">
          <span>{progressPercent}% complete</span>
          <span>~{totalMinutes} min left</span>
        </div>
        <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-emerald-400 to-emerald-300 rounded-full transition-all duration-700 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Divider */}
      <div className="mx-6 border-t border-white/10" />

      {/* Steps */}
      <nav className="flex-1 px-4 py-4 space-y-0.5 overflow-y-auto">
        {ONBOARDING_STEPS.map((step) => {
          const isComplete = currentStep > step.step;
          const isCurrent = currentStep === step.step;
          const isFuture = currentStep < step.step;
          const Icon = STEP_ICONS[step.icon] || Building2;

          const canClick = isComplete && onGoToStep;

          return (
            <button
              key={step.step}
              onClick={() => canClick && onGoToStep(step.step)}
              disabled={!canClick}
              className={cn(
                "w-full flex items-center gap-3.5 px-3 py-3 rounded-xl text-left transition-all duration-200 group",
                isCurrent &&
                  "bg-white/10 shadow-[0_0_20px_rgba(255,255,255,0.05)]",
                isComplete && "hover:bg-white/5 cursor-pointer",
                isFuture && "opacity-40 cursor-default"
              )}
            >
              {/* Step circle */}
              <div
                className={cn(
                  "w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-300",
                  isComplete &&
                    "bg-emerald-500/20 text-emerald-400",
                  isCurrent &&
                    "bg-white/15 text-white ring-2 ring-white/30 shadow-[0_0_12px_rgba(255,255,255,0.15)]",
                  isFuture && "bg-white/5 text-white/30"
                )}
              >
                {isComplete ? (
                  <Check className="w-4 h-4" strokeWidth={2.5} />
                ) : (
                  <Icon className="w-4 h-4" />
                )}
              </div>

              {/* Text */}
              <div className="min-w-0">
                <div
                  className={cn(
                    "text-sm font-medium leading-tight transition-colors",
                    isCurrent && "text-white",
                    isComplete && "text-white/80 group-hover:text-white",
                    isFuture && "text-white/30"
                  )}
                >
                  {step.title}
                </div>
                <div
                  className={cn(
                    "text-xs leading-tight mt-0.5 transition-colors",
                    isCurrent && "text-white/60",
                    isComplete && "text-white/40",
                    isFuture && "text-white/20"
                  )}
                >
                  {step.description}
                </div>
              </div>
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-6 pb-6 pt-2">
        <div className="border-t border-white/10 pt-4">
          <p className="text-xs text-white/30 leading-relaxed">
            You can always update these settings later from your dashboard.
          </p>
        </div>
      </div>
    </div>
  );
}
