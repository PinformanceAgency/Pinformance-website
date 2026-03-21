"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/hooks/use-org";
import { useRouter, useParams } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Check,
  X,
  ExternalLink,
  Eye,
  Bookmark,
  MousePointer,
  Save,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import type { Pin, PinAnalytics } from "@/lib/types";

export default function PinDetailPage() {
  const { org, loading } = useOrg();
  const router = useRouter();
  const params = useParams();
  const pinId = params.id as string;

  const [pin, setPin] = useState<Pin | null>(null);
  const [analytics, setAnalytics] = useState<PinAnalytics[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!org) return;

    async function load() {
      const supabase = createClient();

      const { data: pinData } = await supabase
        .from("pins")
        .select("*")
        .eq("id", pinId)
        .eq("org_id", org!.id)
        .single();

      if (!pinData) {
        router.push("/pins");
        return;
      }

      const p = pinData as Pin;
      setPin(p);
      setTitle(p.title);
      setDescription(p.description || "");

      if (p.status === "posted") {
        const { data: analyticsData } = await supabase
          .from("pin_analytics")
          .select("*")
          .eq("pin_id", pinId)
          .eq("org_id", org!.id)
          .order("date", { ascending: true });

        setAnalytics((analyticsData as PinAnalytics[]) || []);
      }
    }

    load();
  }, [org, pinId, router]);

  async function handleSave() {
    if (!pin) return;
    setSaving(true);
    const supabase = createClient();
    await supabase
      .from("pins")
      .update({ title, description })
      .eq("id", pin.id);
    setPin({ ...pin, title, description });
    setSaving(false);
  }

  async function handleApprove() {
    if (!pin) return;
    const supabase = createClient();
    await supabase.from("pins").update({ status: "approved" }).eq("id", pin.id);
    setPin({ ...pin, status: "approved" });
  }

  async function handleReject() {
    if (!pin) return;
    const supabase = createClient();
    await supabase
      .from("pins")
      .update({ status: "rejected", rejected_reason: "Manually rejected" })
      .eq("id", pin.id);
    setPin({ ...pin, status: "rejected" });
  }

  if (loading || !pin) {
    return <div className="h-96 bg-muted animate-pulse rounded-xl" />;
  }

  const maxImpressions = Math.max(...analytics.map((a) => a.impressions), 1);

  const totalImpressions = analytics.reduce((s, a) => s + a.impressions, 0);
  const totalSaves = analytics.reduce((s, a) => s + a.saves, 0);
  const totalClicks = analytics.reduce((s, a) => s + a.pin_clicks, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/pins" className="p-2 hover:bg-muted rounded-lg">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold">Pin Details</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Edit and manage this pin
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Image preview */}
        <div className="lg:col-span-1">
          <div className="aspect-[2/3] bg-muted rounded-xl overflow-hidden">
            {pin.image_url ? (
              <img
                src={pin.image_url}
                alt={pin.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
                No image
              </div>
            )}
          </div>
        </div>

        {/* Details */}
        <div className="lg:col-span-2 space-y-5">
          {/* Badges */}
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "text-xs px-2.5 py-1 rounded-full font-medium",
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
            <span className="text-xs bg-muted px-2.5 py-1 rounded-full font-medium">
              {pin.pin_type} pin
            </span>
          </div>

          {/* Editable title */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              maxLength={100}
            />
          </div>

          {/* Editable description */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              maxLength={500}
            />
          </div>

          {/* Keywords */}
          {pin.keywords?.length > 0 && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Keywords
              </label>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {pin.keywords.map((kw) => (
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

          {/* Link URL */}
          {pin.link_url && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Link URL
              </label>
              <a
                href={pin.link_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 text-sm text-primary flex items-center gap-1 hover:underline"
              >
                {pin.link_url}
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}

          {/* Generation prompt */}
          {pin.generation_prompt && (
            <div>
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Generation Prompt
              </label>
              <div className="mt-1 text-sm bg-muted rounded-lg p-3 text-muted-foreground">
                {pin.generation_prompt}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 pt-2">
            {(pin.status === "generated" || pin.status === "scheduled") && (
              <>
                <button
                  onClick={handleApprove}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 hover:bg-green-700"
                >
                  <Check className="w-4 h-4" /> Approve
                </button>
                <button
                  onClick={handleReject}
                  className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 hover:bg-red-700"
                >
                  <X className="w-4 h-4" /> Reject
                </button>
              </>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 hover:bg-primary/90 disabled:opacity-50"
            >
              <Save className="w-4 h-4" /> {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      </div>

      {/* Analytics section */}
      {pin.status === "posted" && analytics.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Analytics</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Impressions
                </span>
                <Eye className="w-4 h-4 text-green-500" />
              </div>
              <div className="mt-2 text-2xl font-semibold">
                {totalImpressions.toLocaleString()}
              </div>
            </div>
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Saves</span>
                <Bookmark className="w-4 h-4 text-purple-500" />
              </div>
              <div className="mt-2 text-2xl font-semibold">
                {totalSaves.toLocaleString()}
              </div>
            </div>
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Clicks</span>
                <MousePointer className="w-4 h-4 text-blue-500" />
              </div>
              <div className="mt-2 text-2xl font-semibold">
                {totalClicks.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Simple bar chart */}
          <div className="bg-card border border-border rounded-xl p-6">
            <h3 className="text-sm font-medium mb-4">Daily Impressions</h3>
            <div className="flex items-end gap-1 h-40">
              {analytics.map((a) => (
                <div
                  key={a.date}
                  className="flex-1 flex flex-col items-center gap-1"
                >
                  <div
                    className="w-full bg-primary/80 rounded-t hover:bg-primary transition-colors"
                    style={{
                      height: `${(a.impressions / maxImpressions) * 100}%`,
                      minHeight: a.impressions > 0 ? "4px" : "0px",
                    }}
                    title={`${a.date}: ${a.impressions} impressions`}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-1 mt-1">
              {analytics.map((a) => (
                <div
                  key={a.date}
                  className="flex-1 text-center text-[10px] text-muted-foreground truncate"
                >
                  {new Date(a.date).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
