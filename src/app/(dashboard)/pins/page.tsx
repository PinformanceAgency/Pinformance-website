"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/hooks/use-org";
import { cn } from "@/lib/utils";
import {
  Check,
  X,
  Filter,
  Trash2,
  Send,
  CalendarPlus,
  Loader2,
  CheckSquare,
  Square,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import type { Pin, PinStatus } from "@/lib/types";

const STATUS_FILTERS: { label: string; value: PinStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Generated", value: "generated" },
  { label: "Approved", value: "approved" },
  { label: "Scheduled", value: "scheduled" },
  { label: "Posted", value: "posted" },
  { label: "Rejected", value: "rejected" },
  { label: "Failed", value: "failed" },
];

export default function PinsPage() {
  const { org, loading } = useOrg();
  const [pins, setPins] = useState<Pin[]>([]);
  const [filter, setFilter] = useState<PinStatus | "all">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [busyAction, setBusyAction] = useState<string>("");
  const [toast, setToast] = useState<{ kind: "success" | "error"; msg: string } | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [perDay, setPerDay] = useState(5);

  async function load() {
    if (!org) return;
    const supabase = createClient();
    let query = supabase
      .from("pins")
      .select("*")
      .eq("org_id", org!.id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (filter !== "all") query = query.eq("status", filter);
    const { data } = await query;
    setPins((data as Pin[]) || []);
    // Drop any selection that's no longer visible.
    setSelected((prev) => {
      const next = new Set<string>();
      const visible = new Set((data || []).map((p: { id: string }) => p.id));
      for (const id of prev) if (visible.has(id)) next.add(id);
      return next;
    });
  }

  useEffect(() => {
    if (!org) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org, filter]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelected(new Set(pins.map((p) => p.id)));
  }
  function clearSelection() {
    setSelected(new Set());
  }

  async function runBulk(action: string, payload?: Record<string, unknown>) {
    setBusy(true);
    setBusyAction(action);
    setToast(null);
    try {
      const res = await fetch("/api/pins/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          pin_ids: Array.from(selected),
          ...payload,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        affected?: number;
        error?: string;
        note?: string;
        first_at?: string;
        last_at?: string;
      };
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
      let msg = `${action.replace(/_/g, " ")}: ${json.affected ?? 0} pin(s) updated`;
      if (json.note) msg += ` — ${json.note}`;
      if (json.first_at && json.last_at) {
        msg += ` (${new Date(json.first_at).toLocaleString()} → ${new Date(json.last_at).toLocaleString()})`;
      }
      setToast({ kind: "success", msg });
      clearSelection();
      await load();
    } catch (e) {
      setToast({
        kind: "error",
        msg: e instanceof Error ? e.message : "Action failed",
      });
    } finally {
      setBusy(false);
      setBusyAction("");
    }
  }

  if (loading) {
    return <div className="h-96 bg-muted animate-pulse rounded-xl" />;
  }

  const rejectedCount = pins.filter((p) => p.status === "rejected").length;
  const hasSelection = selected.size > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Pin Library</h1>
        <p className="text-muted-foreground mt-1">
          All generated and posted pins for your brand
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="w-4 h-4 text-muted-foreground" />
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
              filter === f.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            {f.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          {pins.length > 0 && (
            <button
              onClick={selected.size === pins.length ? clearSelection : selectAllVisible}
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-foreground flex items-center gap-1.5"
            >
              {selected.size === pins.length ? (
                <CheckSquare className="w-3.5 h-3.5" />
              ) : (
                <Square className="w-3.5 h-3.5" />
              )}
              {selected.size === pins.length ? "Deselect all" : "Select all visible"}
            </button>
          )}
          {rejectedCount > 0 && (
            <button
              onClick={() => runBulk("delete_all_rejected")}
              disabled={busy}
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-destructive/10 hover:bg-destructive/15 text-destructive flex items-center gap-1.5 disabled:opacity-50"
            >
              {busy && busyAction === "delete_all_rejected" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
              Delete all rejected ({rejectedCount})
            </button>
          )}
        </div>
      </div>

      {hasSelection && (
        <div className="sticky top-2 z-20 bg-card border border-border rounded-xl px-4 py-3 shadow-sm flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium">
            {selected.size} selected
          </span>
          <button
            onClick={clearSelection}
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <XCircle className="w-3.5 h-3.5" /> clear
          </button>
          <span className="text-muted-foreground">·</span>
          <button
            onClick={() => runBulk("approve")}
            disabled={busy}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-700 hover:bg-blue-500/15 inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {busy && busyAction === "approve" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
            Approve
          </button>
          <button
            onClick={() => runBulk("reject")}
            disabled={busy}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-yellow-500/10 text-yellow-700 hover:bg-yellow-500/15 inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {busy && busyAction === "reject" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <X className="w-3.5 h-3.5" />
            )}
            Reject
          </button>
          <button
            onClick={() => runBulk("post_now")}
            disabled={busy}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-green-500/10 text-green-700 hover:bg-green-500/15 inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {busy && busyAction === "post_now" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            Post now
          </button>
          <button
            onClick={() => setScheduleOpen(true)}
            disabled={busy}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-purple-500/10 text-purple-700 hover:bg-purple-500/15 inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <CalendarPlus className="w-3.5 h-3.5" />
            Schedule…
          </button>
          <button
            onClick={() => runBulk("delete")}
            disabled={busy}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/15 inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {busy && busyAction === "delete" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
            Delete
          </button>
        </div>
      )}

      {toast && (
        <div
          className={cn(
            "rounded-lg border p-3 text-sm",
            toast.kind === "success"
              ? "border-green-500/30 bg-green-500/5 text-green-700"
              : "border-red-500/30 bg-red-500/5 text-red-700"
          )}
        >
          {toast.msg}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {pins.map((pin) => {
          const isSelected = selected.has(pin.id);
          return (
            <div
              key={pin.id}
              className={cn(
                "bg-card border rounded-xl overflow-hidden transition-all relative",
                isSelected
                  ? "border-primary ring-2 ring-primary/30"
                  : "border-border hover:shadow-md"
              )}
            >
              <button
                onClick={() => toggle(pin.id)}
                className={cn(
                  "absolute top-2 left-2 z-10 w-6 h-6 rounded-md flex items-center justify-center transition-colors",
                  isSelected
                    ? "bg-primary text-primary-foreground"
                    : "bg-white/80 backdrop-blur border border-border text-muted-foreground hover:text-foreground"
                )}
                aria-label="Toggle select"
              >
                {isSelected ? <Check className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
              </button>
              <Link href={`/pins/${pin.id}`}>
                <div className="aspect-[2/3] bg-muted relative">
                  {pin.video_url ? (
                    <video
                      src={pin.video_url}
                      className="w-full h-full object-cover"
                      muted
                      loop
                      playsInline
                      autoPlay
                    />
                  ) : pin.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={pin.image_url}
                      alt={pin.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                      {pin.status === "generating" ? "Generating..." : "No image"}
                    </div>
                  )}
                  <div className="absolute top-2 right-2">
                    <span
                      className={cn(
                        "text-xs px-2 py-0.5 rounded-full font-medium",
                        pin.status === "posted" && "bg-green-500 text-white",
                        pin.status === "approved" && "bg-blue-500 text-white",
                        pin.status === "generated" && "bg-yellow-500 text-white",
                        pin.status === "scheduled" && "bg-purple-500 text-white",
                        pin.status === "rejected" && "bg-red-500 text-white",
                        pin.status === "generating" && "bg-gray-500 text-white",
                        pin.status === "failed" && "bg-red-700 text-white"
                      )}
                    >
                      {pin.status}
                    </span>
                  </div>
                </div>
                <div className="p-3">
                  <div className="text-sm font-medium truncate">{pin.title}</div>
                  <div className="text-xs text-muted-foreground mt-1 truncate">
                    {pin.pin_type} pin
                    {pin.scheduled_at &&
                      ` · ${new Date(pin.scheduled_at).toLocaleDateString()}`}
                  </div>
                </div>
              </Link>
            </div>
          );
        })}
      </div>

      {pins.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No pins found. Generate your first batch from the overview page.
        </div>
      )}

      {/* Schedule modal */}
      {scheduleOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => !busy && setScheduleOpen(false)}
        >
          <div
            className="bg-card border border-border rounded-2xl shadow-2xl max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-border">
              <h2 className="text-base font-semibold">Schedule selected pins</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Spread {selected.size} pin{selected.size === 1 ? "" : "s"} over the
                next days. They&apos;ll be posted on the hours configured in
                Settings (default 08:00, 12:00, 17:00, 20:00 UTC).
              </p>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-foreground">
                  Pins per day
                </label>
                <div className="mt-2 inline-flex bg-muted rounded-lg p-1">
                  {[1, 2, 3, 5, 8, 10, 15].map((n) => (
                    <button
                      key={n}
                      onClick={() => setPerDay(n)}
                      className={cn(
                        "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                        perDay === n
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <div className="text-[11px] text-muted-foreground mt-2">
                  {selected.size > 0 && (
                    <>
                      Schedules across{" "}
                      <strong className="text-foreground">
                        {Math.ceil(selected.size / perDay)}
                      </strong>{" "}
                      day{Math.ceil(selected.size / perDay) === 1 ? "" : "s"}.
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 p-5 border-t border-border">
              <button
                onClick={() => setScheduleOpen(false)}
                disabled={busy}
                className="px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-card hover:bg-muted disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await runBulk("schedule", {
                    schedule_opts: { pins_per_day: perDay },
                  });
                  setScheduleOpen(false);
                }}
                disabled={busy}
                className="px-4 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {busy && busyAction === "schedule" && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                )}
                Schedule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
