"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/hooks/use-org";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import type { Pin } from "@/lib/types";

interface ModerationPin extends Pin {
  organization?: { name: string };
}

export default function ModerationPage() {
  const { isAgencyAdmin, loading: authLoading } = useOrg();
  const router = useRouter();
  const [pins, setPins] = useState<ModerationPin[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!isAgencyAdmin) {
      router.push("/overview");
      return;
    }

    loadPins();
  }, [authLoading, isAgencyAdmin, router]);

  async function loadPins() {
    const supabase = createClient();
    const { data } = await supabase
      .from("pins")
      .select("*, organization:organizations(name)")
      .eq("status", "generated")
      .order("created_at", { ascending: false })
      .limit(100);

    setPins((data as ModerationPin[]) || []);
    setLoading(false);
  }

  async function handleApprove(pinId: string) {
    setActionLoading(pinId);
    await fetch(`/api/pins/${pinId}/approve`, { method: "POST" });
    setPins((prev) => prev.filter((p) => p.id !== pinId));
    setActionLoading(null);
  }

  async function handleReject(pinId: string) {
    if (!rejectReason.trim()) return;
    setActionLoading(pinId);
    await fetch(`/api/pins/${pinId}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: rejectReason }),
    });
    setPins((prev) => prev.filter((p) => p.id !== pinId));
    setRejectId(null);
    setRejectReason("");
    setActionLoading(null);
  }

  if (authLoading || loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-64 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Moderation Queue</h1>
        <p className="text-muted-foreground mt-1">
          Review and approve generated pins across all clients
        </p>
      </div>

      {pins.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground bg-card border border-border rounded-xl">
          No pins awaiting moderation.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {pins.map((pin) => (
            <div
              key={pin.id}
              className="bg-card border border-border rounded-xl overflow-hidden"
            >
              <div className="aspect-[2/3] bg-muted relative">
                {pin.image_url ? (
                  <img
                    src={pin.image_url}
                    alt={pin.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                    No image
                  </div>
                )}
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <div className="text-xs text-muted-foreground">
                    {pin.organization?.name}
                  </div>
                  <div className="font-medium truncate">{pin.title}</div>
                  {pin.scheduled_at && (
                    <div className="text-xs text-muted-foreground mt-1">
                      Scheduled: {new Date(pin.scheduled_at).toLocaleDateString()}
                    </div>
                  )}
                </div>

                {rejectId === pin.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Rejection reason..."
                      className="w-full text-sm border border-border rounded-lg p-2 bg-background resize-none"
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleReject(pin.id)}
                        disabled={actionLoading === pin.id || !rejectReason.trim()}
                        className="flex-1 bg-red-500 text-white text-xs py-1.5 rounded-lg hover:bg-red-600 disabled:opacity-50"
                      >
                        Confirm Reject
                      </button>
                      <button
                        onClick={() => {
                          setRejectId(null);
                          setRejectReason("");
                        }}
                        className="flex-1 bg-muted text-xs py-1.5 rounded-lg hover:bg-muted/80"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApprove(pin.id)}
                      disabled={actionLoading === pin.id}
                      className="flex-1 flex items-center justify-center gap-1 bg-green-500 text-white text-xs py-2 rounded-lg hover:bg-green-600 disabled:opacity-50"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Approve
                    </button>
                    <button
                      onClick={() => setRejectId(pin.id)}
                      disabled={actionLoading === pin.id}
                      className="flex-1 flex items-center justify-center gap-1 bg-red-500 text-white text-xs py-2 rounded-lg hover:bg-red-600 disabled:opacity-50"
                    >
                      <X className="w-3.5 h-3.5" />
                      Reject
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
