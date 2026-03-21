"use client";

import { useState } from "react";
import { ExternalLink, ClipboardList, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Organization } from "@/lib/types";

const FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLScikiDgy9ZEsi56TiR8qi-Bqrk_YPyScbHHwC8AzzU3Ygscqw/viewform";

export function IntakeFormStep({
  org,
  onNext,
}: {
  org: Organization;
  onNext: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);

  return (
    <div className="space-y-6">
      {/* Intro */}
      <div className="bg-primary/5 border border-primary/15 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <ClipboardList className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h4 className="text-sm font-semibold">Why we need this</h4>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
              The intake form gives us all the information we need about your
              brand, products, and goals to set up your Pinterest campaigns the
              right way. It takes about 5 minutes.
            </p>
          </div>
        </div>
      </div>

      {/* CTA */}
      <a
        href={FORM_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "flex items-center justify-center gap-2.5 w-full px-6 py-4 rounded-xl text-sm font-semibold transition-all duration-200",
          "bg-primary text-primary-foreground hover:bg-primary/90",
          "shadow-sm hover:shadow-md"
        )}
      >
        Open Intake Form
        <ExternalLink className="w-4 h-4 opacity-80" />
      </a>

      {/* Confirmation checkbox */}
      <label
        className={cn(
          "flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all duration-200",
          confirmed
            ? "border-emerald-300 dark:border-emerald-700 bg-emerald-50/60 dark:bg-emerald-950/20"
            : "border-border hover:border-primary/30 bg-background"
        )}
      >
        <div className="pt-0.5 flex-shrink-0">
          <div
            className={cn(
              "w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all",
              confirmed
                ? "bg-emerald-500 border-emerald-500"
                : "border-border"
            )}
          >
            {confirmed && (
              <CheckCircle2 className="w-3.5 h-3.5 text-white" strokeWidth={3} />
            )}
          </div>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={() => setConfirmed((v) => !v)}
            className="hidden"
          />
        </div>
        <div>
          <span className="text-sm font-medium block">
            I've filled in the intake form
          </span>
          <span className="text-xs text-muted-foreground mt-0.5 block">
            Confirm once you've submitted the form above.
          </span>
        </div>
      </label>

      {/* Navigation */}
      <div className="flex justify-end pt-1">
        <button
          onClick={onNext}
          disabled={!confirmed}
          className={cn(
            "px-8 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200",
            "bg-primary text-primary-foreground hover:bg-primary/90",
            "disabled:opacity-40 disabled:cursor-not-allowed",
            "shadow-sm hover:shadow-md"
          )}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
