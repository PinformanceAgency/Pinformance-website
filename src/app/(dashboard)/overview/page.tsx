"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/hooks/use-org";
import { useRouter } from "next/navigation";
import {
  Image,
  LayoutGrid,
  Eye,
  Bookmark,
  MousePointer,
  ShoppingCart,
  ArrowRight,
  Play,
} from "lucide-react";
import Link from "next/link";
import { OnboardingVideoModal } from "@/components/shared/onboarding-video-modal";

interface DashboardStats {
  total_pins: number;
  posted_pins: number;
  scheduled_pins: number;
  total_boards: number;
  total_impressions: number;
  total_saves: number;
  total_clicks: number;
  total_sales: number;
}

export default function OverviewPage() {
  const { org, loading } = useOrg();
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [videoWatched, setVideoWatched] = useState(true);

  useEffect(() => {
    if (!org) return;

    if (!org.onboarding_completed_at) {
      router.push("/onboarding");
      return;
    }

    setVideoWatched(!!org.onboarding_video_watched);

    if (!org.onboarding_video_watched) {
      setShowVideoModal(true);
    }

    async function loadStats() {
      const supabase = createClient();

      const [pinsResult, boardsResult, analyticsResult, salesResult] = await Promise.all([
        supabase
          .from("pins")
          .select("status", { count: "exact" })
          .eq("org_id", org!.id),
        supabase
          .from("boards")
          .select("id", { count: "exact" })
          .eq("org_id", org!.id),
        supabase
          .from("pin_analytics")
          .select("impressions, saves, pin_clicks")
          .eq("org_id", org!.id),
        supabase
          .from("sales_data")
          .select("sales_count")
          .eq("org_id", org!.id),
      ]);

      const pins = pinsResult.data || [];
      const totalImpressions = (analyticsResult.data || []).reduce(
        (sum, a) => sum + (a.impressions || 0), 0
      );
      const totalSaves = (analyticsResult.data || []).reduce(
        (sum, a) => sum + (a.saves || 0), 0
      );
      const totalClicks = (analyticsResult.data || []).reduce(
        (sum, a) => sum + (a.pin_clicks || 0), 0
      );
      const totalSales = (salesResult.data || []).reduce(
        (sum, a) => sum + (a.sales_count || 0), 0
      );

      setStats({
        total_pins: pinsResult.count || 0,
        posted_pins: pins.filter((p) => p.status === "posted").length,
        scheduled_pins: pins.filter(
          (p) => p.status === "scheduled" || p.status === "approved"
        ).length,
        total_boards: boardsResult.count || 0,
        total_impressions: totalImpressions,
        total_saves: totalSaves,
        total_clicks: totalClicks,
        total_sales: totalSales,
      });
    }

    loadStats();
  }, [org, router]);

  if (loading || !org) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const statCards = [
    { label: "Total Pins", value: stats?.total_pins || 0, icon: Image, color: "text-primary" },
    { label: "Active Boards", value: stats?.total_boards || 0, icon: LayoutGrid, color: "text-blue-500" },
    { label: "Impressions", value: stats?.total_impressions || 0, icon: Eye, color: "text-green-500" },
    { label: "Saves", value: stats?.total_saves || 0, icon: Bookmark, color: "text-purple-500" },
    { label: "Clicks", value: stats?.total_clicks || 0, icon: MousePointer, color: "text-orange-500" },
    { label: "Sales", value: stats?.total_sales || 0, icon: ShoppingCart, color: "text-emerald-500" },
  ];

  function handleVideoComplete() {
    setShowVideoModal(false);
    setVideoWatched(true);
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Welcome back, {org.name}</h1>
        <p className="text-muted-foreground mt-1">
          Here&apos;s your Pinterest performance overview
        </p>
      </div>

      {/* Onboarding video banner */}
      {!videoWatched && (
        <button
          onClick={() => setShowVideoModal(true)}
          className="w-full bg-primary/5 border border-primary/20 rounded-xl p-4 flex items-center gap-4 hover:bg-primary/10 transition-colors text-left"
        >
          <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
            <Play className="w-6 h-6 text-primary ml-0.5" />
          </div>
          <div className="flex-1">
            <div className="font-medium text-sm">Watch the onboarding video</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Get a quick overview of Pinformance and how to get the most out of it
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-primary flex-shrink-0" />
        </button>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {statCards.map((card) => (
          <div key={card.label} className="bg-card border border-border rounded-xl p-5">
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Upcoming Pins</h2>
            <Link
              href="/calendar"
              className="text-sm text-primary flex items-center gap-1 hover:underline"
            >
              View calendar <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="text-sm text-muted-foreground">
            {stats?.scheduled_pins || 0} pins scheduled
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Performance</h2>
            <Link
              href="/analytics"
              className="text-sm text-primary flex items-center gap-1 hover:underline"
            >
              View analytics <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-lg font-semibold">
                {(stats?.total_impressions || 0).toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground">Impressions</div>
            </div>
            <div>
              <div className="text-lg font-semibold">
                {(stats?.total_saves || 0).toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground">Saves</div>
            </div>
            <div>
              <div className="text-lg font-semibold">
                {(stats?.total_clicks || 0).toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground">Clicks</div>
            </div>
          </div>
        </div>
      </div>

      {/* Onboarding Video Modal */}
      {showVideoModal && (
        <OnboardingVideoModal
          orgId={org.id}
          onClose={() => setShowVideoModal(false)}
          onComplete={handleVideoComplete}
        />
      )}
    </div>
  );
}
