"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/hooks/use-org";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ExternalLink,
  Settings,
  Users,
  Check,
  AlertCircle,
  ShoppingCart,
  Key,
  CheckCircle2,
  Circle,
  Play,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Organization, Pin, PinStatus } from "@/lib/types";

interface OrgDetail extends Organization {
  productCount: number;
  boardCount: number;
  memberCount: number;
  pinsByStatus: Record<PinStatus, number>;
  recentPins: Pin[];
}

const ONBOARDING_STEPS = [
  { step: 1, label: "Brand info" },
  { step: 2, label: "Shopify connected" },
  { step: 3, label: "Brand assets uploaded" },
  { step: 4, label: "Competitors added" },
  { step: 5, label: "Pinterest connected" },
  { step: 6, label: "kie.ai configured" },
  { step: 7, label: "Onboarding complete" },
];

export default function ClientDetailPage() {
  const { isAgencyAdmin, loading: authLoading } = useOrg();
  const router = useRouter();
  const params = useParams();
  const orgId = params.orgId as string;
  const [orgDetail, setOrgDetail] = useState<OrgDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!isAgencyAdmin) {
      router.push("/overview");
      return;
    }

    async function load() {
      const supabase = createClient();

      const { data: org } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", orgId)
        .single();

      if (!org) {
        setLoading(false);
        return;
      }

      const [productsRes, boardsRes, pinsRes, recentPinsRes, membersRes] =
        await Promise.all([
          supabase
            .from("products")
            .select("id", { count: "exact", head: true })
            .eq("org_id", orgId),
          supabase
            .from("boards")
            .select("id", { count: "exact", head: true })
            .eq("org_id", orgId),
          supabase
            .from("pins")
            .select("status")
            .eq("org_id", orgId),
          supabase
            .from("pins")
            .select("*")
            .eq("org_id", orgId)
            .order("created_at", { ascending: false })
            .limit(12),
          supabase
            .from("users")
            .select("id", { count: "exact", head: true })
            .eq("org_id", orgId),
        ]);

      const pinsByStatus = {} as Record<PinStatus, number>;
      const statuses: PinStatus[] = [
        "generating",
        "generated",
        "scheduled",
        "approved",
        "posting",
        "posted",
        "failed",
        "rejected",
      ];
      for (const s of statuses) {
        pinsByStatus[s] =
          (pinsRes.data || []).filter((p) => p.status === s).length;
      }

      setOrgDetail({
        ...org,
        productCount: productsRes.count || 0,
        boardCount: boardsRes.count || 0,
        memberCount: membersRes.count || 0,
        pinsByStatus,
        recentPins: (recentPinsRes.data as Pin[]) || [],
      } as OrgDetail);
      setLoading(false);
    }

    load();
  }, [authLoading, isAgencyAdmin, orgId, router]);

  async function handleCompleteOnboarding() {
    if (!orgDetail) return;
    const supabase = createClient();
    await supabase
      .from("organizations")
      .update({
        onboarding_step: 7,
        onboarding_completed_at: new Date().toISOString(),
      })
      .eq("id", orgDetail.id);
    setOrgDetail({
      ...orgDetail,
      onboarding_step: 7 as any,
      onboarding_completed_at: new Date().toISOString(),
    });
  }

  if (authLoading || loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-64 bg-muted animate-pulse rounded-xl" />
      </div>
    );
  }

  if (!orgDetail) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Organization not found.
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    generating: "bg-gray-100 text-gray-700",
    generated: "bg-yellow-100 text-yellow-700",
    scheduled: "bg-purple-100 text-purple-700",
    approved: "bg-blue-100 text-blue-700",
    posting: "bg-indigo-100 text-indigo-700",
    posted: "bg-green-100 text-green-700",
    failed: "bg-red-100 text-red-700",
    rejected: "bg-red-50 text-red-600",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/admin/clients"
              className="text-muted-foreground hover:text-foreground text-sm flex items-center gap-1"
            >
              <ArrowLeft className="w-3 h-3" /> Clients
            </Link>
            <span className="text-muted-foreground">/</span>
            <h1 className="text-2xl font-semibold">{orgDetail.name}</h1>
          </div>
          <p className="text-muted-foreground mt-1">
            {orgDetail.slug}
            {orgDetail.shopify_domain && ` · ${orgDetail.shopify_domain}`}
            {orgDetail.pinterest_user_id &&
              ` · @${orgDetail.pinterest_user_id}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/overview`}
            className="bg-muted text-foreground px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-muted/80"
          >
            <ExternalLink className="w-4 h-4" /> Switch to client view
          </Link>
          <Link
            href={`/settings`}
            className="bg-muted text-foreground px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-muted/80"
          >
            <Settings className="w-4 h-4" /> Manage settings
          </Link>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-sm text-muted-foreground">Products</div>
          <div className="text-xl font-semibold mt-1">
            {orgDetail.productCount}
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-sm text-muted-foreground">Boards</div>
          <div className="text-xl font-semibold mt-1">
            {orgDetail.boardCount}
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-sm text-muted-foreground">Total Pins</div>
          <div className="text-xl font-semibold mt-1">
            {Object.values(orgDetail.pinsByStatus).reduce((a, b) => a + b, 0)}
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-sm text-muted-foreground flex items-center gap-1">
            <Users className="w-3 h-3" /> Team Members
          </div>
          <div className="text-xl font-semibold mt-1">
            {orgDetail.memberCount}
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-sm text-muted-foreground">Onboarding</div>
          <div className="text-xl font-semibold mt-1">
            Step {orgDetail.onboarding_step}/7
          </div>
        </div>
      </div>

      {/* Integrations + Onboarding row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Integrations */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="font-semibold mb-4">Integrations</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-green-50 rounded-lg flex items-center justify-center">
                  <ShoppingCart className="w-4 h-4 text-green-600" />
                </div>
                <div>
                  <div className="text-sm font-medium">Shopify</div>
                  <div className="text-xs text-muted-foreground">
                    {orgDetail.shopify_domain || "Not connected"}
                  </div>
                </div>
              </div>
              <span
                className={cn(
                  "text-xs px-2.5 py-1 rounded-full font-medium flex items-center gap-1",
                  orgDetail.shopify_domain
                    ? "bg-green-100 text-green-700"
                    : "bg-red-100 text-red-700"
                )}
              >
                {orgDetail.shopify_domain ? (
                  <><Check className="w-3 h-3" /> Connected</>
                ) : (
                  <><AlertCircle className="w-3 h-3" /> Not connected</>
                )}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-red-50 rounded-lg flex items-center justify-center">
                  <Key className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <div className="text-sm font-medium">Pinterest</div>
                  <div className="text-xs text-muted-foreground">
                    {orgDetail.pinterest_user_id
                      ? `@${orgDetail.pinterest_user_id}`
                      : "Not connected"}
                  </div>
                </div>
              </div>
              <span
                className={cn(
                  "text-xs px-2.5 py-1 rounded-full font-medium flex items-center gap-1",
                  orgDetail.pinterest_user_id
                    ? "bg-green-100 text-green-700"
                    : "bg-red-100 text-red-700"
                )}
              >
                {orgDetail.pinterest_user_id ? (
                  <><Check className="w-3 h-3" /> Connected</>
                ) : (
                  <><AlertCircle className="w-3 h-3" /> Not connected</>
                )}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center">
                  <Key className="w-4 h-4 text-purple-500" />
                </div>
                <div>
                  <div className="text-sm font-medium">kie.ai</div>
                  <div className="text-xs text-muted-foreground">
                    {orgDetail.onboarding_step >= 6
                      ? "Configured"
                      : "Not configured"}
                  </div>
                </div>
              </div>
              <span
                className={cn(
                  "text-xs px-2.5 py-1 rounded-full font-medium flex items-center gap-1",
                  orgDetail.onboarding_step >= 6
                    ? "bg-green-100 text-green-700"
                    : "bg-red-100 text-red-700"
                )}
              >
                {orgDetail.onboarding_step >= 6 ? (
                  <><Check className="w-3 h-3" /> Connected</>
                ) : (
                  <><AlertCircle className="w-3 h-3" /> Not connected</>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Onboarding Checklist */}
        <div className="bg-card border border-border rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Onboarding Status</h2>
            {orgDetail.onboarding_step < 7 && (
              <button
                onClick={handleCompleteOnboarding}
                className="text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-lg font-medium hover:bg-primary/90"
              >
                Complete onboarding for client
              </button>
            )}
          </div>
          <div className="space-y-2.5">
            {ONBOARDING_STEPS.map((item) => {
              const completed = orgDetail.onboarding_step >= item.step;
              return (
                <div
                  key={item.step}
                  className="flex items-center gap-3 text-sm"
                >
                  {completed ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                  ) : (
                    <Circle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  )}
                  <span
                    className={cn(
                      completed
                        ? "text-foreground"
                        : "text-muted-foreground"
                    )}
                  >
                    {item.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Pin status breakdown */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h2 className="font-semibold mb-4">Pin Status Breakdown</h2>
        <div className="flex flex-wrap gap-3">
          {Object.entries(orgDetail.pinsByStatus)
            .filter(([, count]) => count > 0)
            .map(([status, count]) => (
              <span
                key={status}
                className={`text-sm px-3 py-1.5 rounded-lg font-medium ${
                  statusColors[status] || "bg-muted"
                }`}
              >
                {status}: {count}
              </span>
            ))}
          {Object.values(orgDetail.pinsByStatus).every((c) => c === 0) && (
            <span className="text-sm text-muted-foreground">No pins yet</span>
          )}
        </div>
      </div>

      {/* Recent pins grid */}
      {orgDetail.recentPins.length > 0 && (
        <div>
          <h2 className="font-semibold mb-4">Recent Pins</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {orgDetail.recentPins.map((pin) => (
              <div
                key={pin.id}
                className="bg-card border border-border rounded-xl overflow-hidden"
              >
                <div className="aspect-[2/3] bg-muted">
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
                </div>
                <div className="p-2">
                  <div className="text-xs font-medium truncate">{pin.title}</div>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                      statusColors[pin.status] || "bg-muted"
                    }`}
                  >
                    {pin.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
