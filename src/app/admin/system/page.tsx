"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/hooks/use-org";
import { useRouter } from "next/navigation";
import { Building2, Image, CalendarClock, AlertTriangle } from "lucide-react";

interface SystemStats {
  totalOrgs: number;
  pinsPostedToday: number;
  pinsScheduled: number;
  pinsFailed: number;
}

export default function SystemPage() {
  const { isAgencyAdmin, loading: authLoading } = useOrg();
  const router = useRouter();
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!isAgencyAdmin) {
      router.push("/overview");
      return;
    }

    async function load() {
      const supabase = createClient();

      const today = new Date().toISOString().split("T")[0];

      const [orgsRes, postedTodayRes, scheduledRes, failedRes] =
        await Promise.all([
          supabase
            .from("organizations")
            .select("id", { count: "exact", head: true }),
          supabase
            .from("pins")
            .select("id", { count: "exact", head: true })
            .eq("status", "posted")
            .gte("posted_at", `${today}T00:00:00Z`),
          supabase
            .from("pins")
            .select("id", { count: "exact", head: true })
            .in("status", ["scheduled", "approved"]),
          supabase
            .from("pins")
            .select("id", { count: "exact", head: true })
            .eq("status", "failed"),
        ]);

      setStats({
        totalOrgs: orgsRes.count || 0,
        pinsPostedToday: postedTodayRes.count || 0,
        pinsScheduled: scheduledRes.count || 0,
        pinsFailed: failedRes.count || 0,
      });
      setLoading(false);
    }

    load();
  }, [authLoading, isAgencyAdmin, router]);

  if (authLoading || loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const cards = [
    {
      label: "Total Organizations",
      value: stats?.totalOrgs || 0,
      icon: Building2,
      color: "text-blue-500",
    },
    {
      label: "Pins Posted Today",
      value: stats?.pinsPostedToday || 0,
      icon: Image,
      color: "text-green-500",
    },
    {
      label: "Pins Scheduled",
      value: stats?.pinsScheduled || 0,
      icon: CalendarClock,
      color: "text-purple-500",
    },
    {
      label: "Failed Pins",
      value: stats?.pinsFailed || 0,
      icon: AlertTriangle,
      color: stats?.pinsFailed ? "text-red-500" : "text-muted-foreground",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">System Overview</h1>
        <p className="text-muted-foreground mt-1">
          Platform-wide statistics and health
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="bg-card border border-border rounded-xl p-5"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{card.label}</span>
              <card.icon className={`w-4 h-4 ${card.color}`} />
            </div>
            <div className="mt-2 text-2xl font-semibold">
              {card.value.toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
