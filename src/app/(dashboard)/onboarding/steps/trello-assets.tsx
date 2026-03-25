"use client";

import { useState } from "react";
import {
  ExternalLink,
  Video,
  ImageIcon,
  Link2,
  Film,
  MonitorPlay,
  Info,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Organization } from "@/lib/types";

const LOOM_URL_1 = "https://www.loom.com/share/cb22c6265e60405db32a5bcf261c5802";
const LOOM_URL_2 = "https://www.loom.com/share/cc17d5cf8a03402ab5b5414a4edfa6f8";

const UPLOAD_ITEMS = [
  {
    icon: Link2,
    label: "Product links / collections",
    description: "Share the URLs of the products or collections you want us to promote.",
  },
  {
    icon: ImageIcon,
    label: "Images & static creatives",
    description: "Static images must be 1000×1500 px (2:3 ratio) for optimal Pinterest display.",
  },
  {
    icon: Film,
    label: "Videos (optional)",
    description:
      "Videos from Meta in Story format are fine. Statics must still be 1000×1500 px.",
  },
  {
    icon: MonitorPlay,
    label: "Landing & sales pages",
    description: "Any specific pages you'd like us to drive traffic to.",
  },
];

export function TrelloAssetsStep({
  org,
  onNext,
}: {
  org: Organization;
  onNext: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);

  return (
    <div className="space-y-6">
      {/* Intro + Loom */}
      <div className="bg-muted/40 border border-border rounded-xl p-5">
        <div>
          <h4 className="text-sm font-semibold">We've created a Trello board for your store</h4>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
            Use the Trello board to upload all your creatives, product links, and
            campaign materials. Watch the videos below to learn how to use it correctly.
          </p>
          <p className="text-sm font-semibold text-primary mt-2">
            Important to watch both videos
          </p>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          <a
            href={LOOM_URL_1}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-background border border-border hover:border-primary/30 transition-all"
          >
            <Video className="w-3.5 h-3.5 text-red-500" />
            Watch video 1
            <ExternalLink className="w-3 h-3 text-muted-foreground" />
          </a>
          <a
            href={LOOM_URL_2}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-background border border-border hover:border-primary/30 transition-all"
          >
            <Video className="w-3.5 h-3.5 text-red-500" />
            Watch video 2
            <ExternalLink className="w-3 h-3 text-muted-foreground" />
          </a>
        </div>
      </div>

      {/* What to upload */}
      <div>
        <h4 className="text-sm font-semibold mb-3">Please upload the following:</h4>
        <div className="space-y-2">
          {UPLOAD_ITEMS.map((item) => (
            <div
              key={item.label}
              className="flex items-start gap-3 p-3.5 rounded-xl border border-border bg-background"
            >
              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                <item.icon className="w-4 h-4 text-muted-foreground" />
              </div>
              <div>
                <h5 className="text-sm font-medium">{item.label}</h5>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  {item.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Size note */}
      <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
        <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
            Important: Pinterest sizing
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5 leading-relaxed">
            All static images must be <strong>1000×1500 px</strong> (2:3 ratio). Videos
            from Meta in Story format are also accepted. Mixed formats are fine — just
            keep statics at the correct size.
          </p>
        </div>
      </div>

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
            I've uploaded my creatives and materials to the Trello board
          </span>
          <span className="text-xs text-muted-foreground mt-0.5 block">
            You can always add more later — just let us know.
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
