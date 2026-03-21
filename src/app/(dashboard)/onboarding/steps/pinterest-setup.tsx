"use client";

import { useState } from "react";
import { ExternalLink, Copy, Check, Video } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Organization } from "@/lib/types";

const TEAM_EMAILS = [
  "info@tt-advertisingbv.com",
  "generaltytech@gmail.com",
  "janner@tt-advertisingbv.com",
  "dylan@tt-advertisingbv.com",
];

const SUB_STEPS = [
  {
    id: "access",
    number: "2.1",
    title: "Give our team access to your ad account & profiles",
    description:
      "Add the following email addresses as collaborators on your Pinterest Business account.",
    loom: "https://www.loom.com/share/11f17baa853d478cb88e6806e9289fdb",
    hasEmails: true,
  },
  {
    id: "domain",
    number: "2.2",
    title: "Claim your domain within Pinterest",
    description:
      "Claiming your website improves pin distribution and shows your brand on all pins.",
    loom: "https://www.loom.com/share/eba786bef20b45daa3b30e972b11bda9",
    hasEmails: false,
  },
  {
    id: "billing",
    number: "2.3",
    title: "Set up your billing profile",
    description:
      "Add a payment method to your Pinterest Business account so campaigns can run.",
    loom: "https://www.loom.com/share/2dd163faf165440dbf423c6c08922f71",
    hasEmails: false,
  },
  {
    id: "profile",
    number: "2.4",
    title: "Set up your Pinterest profile",
    description:
      "Make sure your profile photo, name, and bio are set up and professional.",
    loom: "https://www.loom.com/share/9223b371f70b4272ba91eafa6c26e6d8",
    hasEmails: false,
  },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={handleCopy}
      className={cn(
        "p-1.5 rounded-lg transition-all duration-200",
        copied
          ? "text-emerald-600 bg-emerald-100 dark:bg-emerald-900"
          : "text-muted-foreground hover:text-foreground hover:bg-muted"
      )}
      title="Copy to clipboard"
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

export function PinterestSetupStep({
  org,
  onNext,
}: {
  org: Organization;
  onNext: () => void;
}) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const allDone = SUB_STEPS.every((s) => checked[s.id]);

  function toggle(id: string) {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <div className="space-y-4">
      {/* Sub-steps */}
      {SUB_STEPS.map((sub) => {
        const isDone = !!checked[sub.id];
        return (
          <div
            key={sub.id}
            className={cn(
              "rounded-xl border-2 transition-all duration-200",
              isDone
                ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/15"
                : "border-border bg-background"
            )}
          >
            {/* Header row */}
            <div className="flex items-start gap-3 p-4">
              {/* Checkbox */}
              <button
                onClick={() => toggle(sub.id)}
                className="mt-0.5 flex-shrink-0"
              >
                <div
                  className={cn(
                    "w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all",
                    isDone
                      ? "bg-emerald-500 border-emerald-500"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  {isDone && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                </div>
              </button>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-bold text-muted-foreground tabular-nums">
                    Step {sub.number}
                  </span>
                </div>
                <h4
                  className={cn(
                    "text-sm font-semibold leading-snug",
                    isDone && "line-through text-muted-foreground decoration-emerald-400/60"
                  )}
                >
                  {sub.title}
                </h4>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  {sub.description}
                </p>

                {/* Emails list for step 2.1 */}
                {sub.hasEmails && (
                  <div className="mt-3 space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      Add these email addresses as collaborators:
                    </p>
                    {TEAM_EMAILS.map((email) => (
                      <div
                        key={email}
                        className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2"
                      >
                        <span className="text-xs font-mono flex-1 text-foreground">
                          {email}
                        </span>
                        <CopyButton text={email} />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Loom button */}
              <a
                href={sub.loom}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200",
                  "bg-muted hover:bg-muted/80 text-foreground border border-border hover:border-primary/30"
                )}
              >
                <Video className="w-3.5 h-3.5 text-red-500" />
                How-to
                <ExternalLink className="w-3 h-3 text-muted-foreground" />
              </a>
            </div>
          </div>
        );
      })}

      {/* Progress hint */}
      {!allDone && (
        <p className="text-xs text-muted-foreground text-center pt-1">
          Check off each step above once completed to continue.
        </p>
      )}

      {/* Navigation */}
      <div className="flex justify-end pt-1">
        <button
          onClick={onNext}
          disabled={!allDone}
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
