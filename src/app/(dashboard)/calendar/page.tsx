"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/hooks/use-org";
import { useRealtime } from "@/hooks/use-realtime";
import {
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  Eye,
} from "lucide-react";
import {
  addDays,
  startOfWeek,
  format,
  isSameDay,
  isToday,
} from "date-fns";
import { cn } from "@/lib/utils";
import type { Pin, CalendarEntry } from "@/lib/types";

interface CalendarPin extends CalendarEntry {
  pin: Pin;
}

export default function CalendarPage() {
  const { org, loading } = useOrg();
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [entries, setEntries] = useState<CalendarPin[]>([]);
  const [selectedPin, setSelectedPin] = useState<CalendarPin | null>(null);

  const loadEntries = useCallback(async () => {
    if (!org) return;
    const supabase = createClient();
    const weekEnd = addDays(weekStart, 6);

    const { data } = await supabase
      .from("calendar_entries")
      .select("*, pin:pins(*)")
      .eq("org_id", org.id)
      .gte("scheduled_date", format(weekStart, "yyyy-MM-dd"))
      .lte("scheduled_date", format(weekEnd, "yyyy-MM-dd"))
      .order("scheduled_time");

    setEntries((data as CalendarPin[]) || []);
  }, [org, weekStart]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  useRealtime("pins", org?.id, loadEntries);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  async function handleApprove(pinId: string) {
    const supabase = createClient();
    await supabase.from("pins").update({ status: "approved" }).eq("id", pinId);
    loadEntries();
  }

  async function handleReject(pinId: string) {
    const supabase = createClient();
    await supabase
      .from("pins")
      .update({ status: "rejected", rejected_reason: "Manually rejected" })
      .eq("id", pinId);
    loadEntries();
  }

  if (loading) {
    return <div className="h-96 bg-muted animate-pulse rounded-xl" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Content Calendar</h1>
          <p className="text-muted-foreground mt-1">
            Review, edit, and approve upcoming pins
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            className="p-2 hover:bg-muted rounded-lg"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium min-w-[180px] text-center">
            {format(weekStart, "MMM d")} — {format(addDays(weekStart, 6), "MMM d, yyyy")}
          </span>
          <button
            onClick={() => setWeekStart(addDays(weekStart, 7))}
            className="p-2 hover:bg-muted rounded-lg"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-3">
        {days.map((day) => {
          const dayEntries = entries.filter((e) =>
            isSameDay(new Date(e.scheduled_date), day)
          );

          return (
            <div
              key={day.toISOString()}
              className={cn(
                "bg-card border border-border rounded-xl p-3 min-h-[400px]",
                isToday(day) && "border-primary/50"
              )}
            >
              <div className="text-center mb-3">
                <div className="text-xs text-muted-foreground uppercase">
                  {format(day, "EEE")}
                </div>
                <div
                  className={cn(
                    "text-lg font-semibold",
                    isToday(day) && "text-primary"
                  )}
                >
                  {format(day, "d")}
                </div>
                <div className="text-xs text-muted-foreground">
                  {dayEntries.length} pins
                </div>
              </div>

              <div className="space-y-2">
                {dayEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className={cn(
                      "rounded-lg p-2 text-xs cursor-pointer hover:ring-1 hover:ring-primary/50 transition-all",
                      entry.pin.status === "posted" && "bg-green-50 border-green-200",
                      entry.pin.status === "approved" && "bg-blue-50 border-blue-200",
                      entry.pin.status === "generated" && "bg-yellow-50 border-yellow-200",
                      entry.pin.status === "rejected" && "bg-red-50 border-red-200",
                      entry.pin.status === "generating" && "bg-muted",
                      entry.pin.status === "failed" && "bg-red-50"
                    )}
                    onClick={() => setSelectedPin(entry)}
                  >
                    {entry.pin.image_url && (
                      <div className="w-full aspect-[2/3] rounded bg-muted mb-1.5 overflow-hidden">
                        <img
                          src={entry.pin.image_url}
                          alt={entry.pin.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    <div className="font-medium truncate">{entry.pin.title}</div>
                    <div className="text-muted-foreground mt-0.5">
                      {entry.scheduled_time?.slice(0, 5)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Pin Detail Modal */}
      {selectedPin && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-xl border border-border max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Pin Details</h3>
                <button
                  onClick={() => setSelectedPin(null)}
                  className="p-1 hover:bg-muted rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {selectedPin.pin.image_url && (
                <div className="w-full max-w-[200px] mx-auto aspect-[2/3] rounded-lg overflow-hidden bg-muted">
                  <img
                    src={selectedPin.pin.image_url}
                    alt={selectedPin.pin.title}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Title
                </label>
                <div className="text-sm mt-0.5">{selectedPin.pin.title}</div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Description
                </label>
                <div className="text-sm mt-0.5">
                  {selectedPin.pin.description || "No description"}
                </div>
              </div>

              <div className="flex gap-2">
                <span className="text-xs bg-muted px-2 py-1 rounded">
                  {selectedPin.pin.pin_type}
                </span>
                <span
                  className={cn(
                    "text-xs px-2 py-1 rounded",
                    selectedPin.pin.status === "posted" && "bg-green-100 text-green-700",
                    selectedPin.pin.status === "approved" && "bg-blue-100 text-blue-700",
                    selectedPin.pin.status === "generated" && "bg-yellow-100 text-yellow-700",
                    selectedPin.pin.status === "rejected" && "bg-red-100 text-red-700"
                  )}
                >
                  {selectedPin.pin.status}
                </span>
              </div>

              {selectedPin.pin.keywords?.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    Keywords
                  </label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selectedPin.pin.keywords.map((kw) => (
                      <span
                        key={kw}
                        className="text-xs bg-muted px-2 py-0.5 rounded"
                      >
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {(selectedPin.pin.status === "generated" ||
                selectedPin.pin.status === "scheduled") && (
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => {
                      handleApprove(selectedPin.pin.id);
                      setSelectedPin(null);
                    }}
                    className="flex-1 bg-green-600 text-white py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-1 hover:bg-green-700"
                  >
                    <Check className="w-4 h-4" /> Approve
                  </button>
                  <button
                    onClick={() => {
                      handleReject(selectedPin.pin.id);
                      setSelectedPin(null);
                    }}
                    className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-1 hover:bg-red-700"
                  >
                    <X className="w-4 h-4" /> Reject
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
