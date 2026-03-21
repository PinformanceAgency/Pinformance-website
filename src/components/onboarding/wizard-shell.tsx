"use client";

import { StepIndicator } from "./step-indicator";
import { ONBOARDING_STEPS } from "@/lib/constants";

export function WizardShell({
  currentStep,
  onGoToStep,
  children,
}: {
  currentStep: number;
  onGoToStep?: (step: number) => void;
  children: React.ReactNode;
}) {
  const currentStepData = ONBOARDING_STEPS.find((s) => s.step === currentStep);

  return (
    <div className="fixed inset-0 flex bg-zinc-100 dark:bg-zinc-950">
      {/* Left Sidebar */}
      <aside className="hidden lg:flex w-[320px] flex-col bg-gradient-to-b from-zinc-900 via-zinc-900 to-zinc-950 flex-shrink-0">
        <StepIndicator currentStep={currentStep} onGoToStep={onGoToStep} />
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="min-h-full flex items-start justify-center px-6 py-12 lg:py-16">
          <div className="w-full max-w-2xl">
            {/* Mobile step indicator */}
            <div className="lg:hidden mb-6">
              <div className="flex items-center justify-between text-sm text-muted-foreground mb-3">
                <span className="font-medium text-foreground">
                  Step {currentStep} of {ONBOARDING_STEPS.length}
                </span>
                <span>
                  {Math.round(
                    ((currentStep - 1) / ONBOARDING_STEPS.length) * 100
                  )}
                  % complete
                </span>
              </div>
              <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{
                    width: `${((currentStep - 1) / ONBOARDING_STEPS.length) * 100}%`,
                  }}
                />
              </div>
            </div>

            {/* Step header */}
            <div className="mb-8">
              <div className="flex items-center gap-2 text-xs font-medium text-primary/70 uppercase tracking-wider mb-2">
                Step {currentStep} of {ONBOARDING_STEPS.length}
              </div>
              <h1 className="text-2xl lg:text-3xl font-bold text-foreground tracking-tight">
                {currentStepData?.title}
              </h1>
              <p className="text-muted-foreground mt-1.5 text-base">
                {currentStepData?.description}
              </p>
            </div>

            {/* Step content card */}
            <div className="bg-card border border-border rounded-2xl shadow-sm p-6 lg:p-8 transition-all duration-300">
              {children}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
