"use client";

import { Sparkles } from "lucide-react";

export default function PaidAdsCreativesPage() {
  return (
    <div className="max-w-5xl">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-[#E30613]/10 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-[#E30613]" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Paid Ads — Creatives</h1>
            <p className="text-sm text-white/50 mt-0.5">
              Manage creatives for paid Pinterest ad campaigns.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-12 text-center">
        <Sparkles className="w-8 h-8 text-white/30 mx-auto mb-4" />
        <h2 className="text-lg font-medium mb-2">No paid creatives yet</h2>
        <p className="text-sm text-white/50 max-w-md mx-auto">
          This is where you&apos;ll upload, organize, and review creatives intended for paid Pinterest ad campaigns. Coming soon.
        </p>
      </div>
    </div>
  );
}
