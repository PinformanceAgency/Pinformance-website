"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { X, Play } from "lucide-react";

interface OnboardingVideoModalProps {
  orgId: string;
  userId?: string;
  onClose: () => void;
  onComplete: () => void;
}

export function OnboardingVideoModal({
  orgId,
  userId,
  onClose,
  onComplete,
}: OnboardingVideoModalProps) {
  const [marking, setMarking] = useState(false);

  async function handleWatched() {
    setMarking(true);
    const supabase = createClient();

    // Update per-user video watched status
    if (userId) {
      await supabase
        .from("users")
        .update({ onboarding_video_watched: true })
        .eq("id", userId);
    }

    // Also keep org-level in sync
    await supabase
      .from("organizations")
      .update({ onboarding_video_watched: true })
      .eq("id", orgId);

    setMarking(false);
    onComplete();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card rounded-xl border border-border max-w-lg w-full mx-4">
        <div className="p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Welcome to Pinformance</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                Watch this quick overview to get started
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-muted rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="aspect-video bg-muted rounded-lg flex flex-col items-center justify-center gap-3">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
              <Play className="w-8 h-8 text-primary ml-1" />
            </div>
            <span className="text-sm text-muted-foreground">
              Video coming soon
            </span>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              className="flex-1 bg-muted text-foreground py-2.5 rounded-lg text-sm font-medium hover:bg-muted/80"
            >
              Remind me later
            </button>
            <button
              onClick={handleWatched}
              disabled={marking}
              className="flex-1 bg-primary text-primary-foreground py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {marking ? "Saving..." : "I've watched it"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
