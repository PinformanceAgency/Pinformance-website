"use client";

import { Image as ImageIcon, Loader2 } from "lucide-react";

export default function AdLevelPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <ImageIcon className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Ad Level</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Slice your spend by parsed ad naming-convention dimensions (Format, Creator type,
              Offer, Landing-page type, Launch date).
            </p>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl p-10 flex items-center justify-center text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Ad-level breakdown is under construction — slicers and per-creative performance table
          land in a follow-up.
        </div>
      </div>
    </div>
  );
}
