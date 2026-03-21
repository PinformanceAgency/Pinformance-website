"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/hooks/use-org";
import { cn } from "@/lib/utils";
import { Eye, Check, X, Filter } from "lucide-react";
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

  useEffect(() => {
    if (!org) return;

    async function load() {
      const supabase = createClient();
      let query = supabase
        .from("pins")
        .select("*")
        .eq("org_id", org!.id)
        .order("created_at", { ascending: false })
        .limit(100);

      if (filter !== "all") {
        query = query.eq("status", filter);
      }

      const { data } = await query;
      setPins((data as Pin[]) || []);
    }

    load();
  }, [org, filter]);

  if (loading) {
    return <div className="h-96 bg-muted animate-pulse rounded-xl" />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Pin Library</h1>
        <p className="text-muted-foreground mt-1">
          All generated and posted pins for your brand
        </p>
      </div>

      <div className="flex items-center gap-2">
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
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {pins.map((pin) => (
          <Link
            key={pin.id}
            href={`/pins/${pin.id}`}
            className="bg-card border border-border rounded-xl overflow-hidden hover:shadow-md transition-shadow"
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
        ))}
      </div>

      {pins.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No pins found. Generate your first batch from the overview page.
        </div>
      )}
    </div>
  );
}
