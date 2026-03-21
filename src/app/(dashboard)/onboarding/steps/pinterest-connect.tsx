"use client";

import { useState } from "react";
import {
  Check,
  ExternalLink,
  Pin,
  Shield,
  LayoutGrid,
  PenTool,
  Eye,
  BarChart3,
  Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Organization } from "@/lib/types";

const CHECKLIST_ITEMS = [
  {
    label: "Pinterest Business account (not personal)",
    description:
      "Business accounts have access to analytics and API features required for automation.",
    required: true,
  },
  {
    label: "Logged into the correct Pinterest account",
    description:
      "Make sure you're logged into the account you want to connect in your browser.",
    required: true,
  },
  {
    label: "Website claimed on Pinterest",
    description:
      "Claiming your website improves pin distribution and shows your brand on all pins.",
    required: false,
  },
  {
    label: "Rich Pins enabled",
    description:
      "Rich Pins pull metadata from your site for better product information on pins.",
    required: false,
  },
];

const PERMISSIONS = [
  {
    icon: LayoutGrid,
    label: "Boards",
    scope: "Read & Write",
    reason: "Create and manage boards for your content strategy",
  },
  {
    icon: PenTool,
    label: "Pins",
    scope: "Read & Write",
    reason: "Create, schedule, and publish pins automatically",
  },
  {
    icon: Eye,
    label: "Account",
    scope: "Read only",
    reason: "Verify your account and read profile details",
  },
];

export function PinterestConnectStep({
  org,
  onNext,
  onBack,
}: {
  org: Organization;
  onNext: () => void;
  onBack: () => void;
}) {
  const [connected] = useState(!!org.pinterest_user_id);
  const [checklist, setChecklist] = useState<boolean[]>(
    CHECKLIST_ITEMS.map(() => false)
  );

  const requiredChecked = CHECKLIST_ITEMS.every(
    (item, i) => !item.required || checklist[i]
  );

  async function handleConnect() {
    const res = await fetch("/api/pinterest/oauth");
    const { url } = await res.json();
    window.location.href = url;
  }

  return (
    <div className="space-y-6">
      {connected ? (
        <div className="space-y-5">
          <div className="flex items-center gap-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-5 rounded-xl">
            <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center flex-shrink-0">
              <Check className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-base font-semibold text-emerald-800 dark:text-emerald-200">
                Pinterest account connected
              </p>
              <p className="text-sm text-emerald-600 dark:text-emerald-400 mt-0.5">
                Your Pinterest Business account is linked and ready for
                automated posting.
              </p>
            </div>
          </div>

          <div className="bg-muted/30 rounded-xl p-4 border border-border">
            <h4 className="text-sm font-semibold mb-2">Permissions granted</h4>
            <div className="space-y-2">
              {PERMISSIONS.map((perm) => (
                <div key={perm.label} className="flex items-center gap-3">
                  <Check className="w-4 h-4 text-emerald-500" />
                  <span className="text-sm text-muted-foreground">
                    {perm.label}: {perm.scope}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Pre-connect Checklist */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">
              Before connecting, verify:
            </h4>
            {CHECKLIST_ITEMS.map((item, i) => (
              <label
                key={i}
                className={cn(
                  "flex items-start gap-3 p-3.5 rounded-xl border transition-all duration-200 cursor-pointer group",
                  checklist[i]
                    ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20"
                    : "border-border hover:border-primary/30 bg-background"
                )}
              >
                <div className="pt-0.5">
                  <div
                    className={cn(
                      "w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all",
                      checklist[i]
                        ? "bg-emerald-500 border-emerald-500"
                        : "border-border group-hover:border-primary/40"
                    )}
                  >
                    {checklist[i] && (
                      <Check className="w-3 h-3 text-white" strokeWidth={3} />
                    )}
                  </div>
                  <input
                    type="checkbox"
                    checked={checklist[i]}
                    onChange={() => {
                      const updated = [...checklist];
                      updated[i] = !updated[i];
                      setChecklist(updated);
                    }}
                    className="hidden"
                  />
                </div>
                <div className="min-w-0">
                  <span className="text-sm font-medium block leading-tight">
                    {item.label}
                    {item.required && (
                      <span className="text-destructive ml-1">*</span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground mt-0.5 block">
                    {item.description}
                  </span>
                </div>
              </label>
            ))}
          </div>

          {/* Permissions Section */}
          <div className="bg-muted/30 border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-4 h-4 text-muted-foreground" />
              <h4 className="text-sm font-semibold">
                Permissions we&apos;ll request
              </h4>
            </div>
            <div className="space-y-3">
              {PERMISSIONS.map((perm) => (
                <div key={perm.label} className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-background border border-border flex items-center justify-center flex-shrink-0">
                    <perm.icon className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">
                      {perm.label}{" "}
                      <span className="text-xs text-muted-foreground font-normal">
                        ({perm.scope})
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {perm.reason}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Connect Button */}
          <button
            onClick={handleConnect}
            disabled={!requiredChecked}
            className={cn(
              "w-full flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl text-sm font-semibold transition-all duration-200",
              "bg-[#E60023] text-white hover:bg-[#CC001F]",
              "disabled:opacity-40 disabled:cursor-not-allowed",
              "shadow-sm hover:shadow-md"
            )}
          >
            <Pin className="w-4 h-4" />
            Connect with Pinterest
            <ExternalLink className="w-3.5 h-3.5 opacity-60" />
          </button>

          {!requiredChecked && (
            <p className="text-xs text-muted-foreground text-center">
              Please check the required items above before connecting.
            </p>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-end pt-2">
        <button
          onClick={onNext}
          disabled={!connected}
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
