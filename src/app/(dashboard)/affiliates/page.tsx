"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/hooks/use-org";
import { cn } from "@/lib/utils";
import {
  Link2,
  Plus,
  X,
  MousePointer,
  TrendingUp,
  DollarSign,
  Users,
  ExternalLink,
} from "lucide-react";
import type { AffiliatePartner, AffiliatePinLink } from "@/lib/types";

type Tab = "partners" | "pin-links";

export default function AffiliatesPage() {
  const { org, isAgencyAdmin, loading } = useOrg();
  const [tab, setTab] = useState<Tab>("partners");
  const [partners, setPartners] = useState<AffiliatePartner[]>([]);
  const [pinLinks, setPinLinks] = useState<AffiliatePinLink[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newPartner, setNewPartner] = useState({
    name: "",
    email: "",
    code: "",
    commission_rate: "10",
  });

  useEffect(() => {
    if (!org) return;
    loadData();
  }, [org]);

  async function loadData() {
    if (!org) return;
    const supabase = createClient();

    const [partnersRes, linksRes] = await Promise.all([
      supabase
        .from("affiliate_partners")
        .select("*")
        .eq("org_id", org.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("affiliate_pin_links")
        .select("*")
        .eq("org_id", org.id)
        .order("created_at", { ascending: false }),
    ]);

    setPartners((partnersRes.data as AffiliatePartner[]) || []);
    setPinLinks((linksRes.data as AffiliatePinLink[]) || []);
  }

  async function handleCreatePartner() {
    if (!org || !newPartner.name.trim() || !newPartner.code.trim()) return;
    setCreating(true);

    const supabase = createClient();
    await supabase.from("affiliate_partners").insert({
      org_id: org.id,
      name: newPartner.name.trim(),
      email: newPartner.email.trim() || null,
      code: newPartner.code.trim(),
      commission_rate: parseFloat(newPartner.commission_rate) || 10,
    });

    setNewPartner({ name: "", email: "", code: "", commission_rate: "10" });
    setShowCreate(false);
    setCreating(false);
    loadData();
  }

  if (loading) {
    return <div className="h-96 bg-muted animate-pulse rounded-xl" />;
  }

  const totalClicks = partners.reduce((s, p) => s + p.total_clicks, 0);
  const totalConversions = partners.reduce((s, p) => s + p.total_conversions, 0);
  const totalEarnings = partners.reduce((s, p) => s + p.total_earnings, 0);
  const conversionRate = totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0;

  const summaryCards = [
    { label: "Total Partners", value: partners.length.toString(), icon: Users, color: "text-blue-500" },
    { label: "Total Clicks", value: totalClicks.toLocaleString(), icon: MousePointer, color: "text-green-500" },
    { label: "Conversions", value: totalConversions.toLocaleString(), icon: TrendingUp, color: "text-purple-500" },
    { label: "Total Earnings", value: `€${totalEarnings.toFixed(2)}`, icon: DollarSign, color: "text-emerald-500" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Affiliates</h1>
          <p className="text-muted-foreground mt-1">
            Track affiliate partners and pin links
          </p>
        </div>
        {tab === "partners" && (
          <button
            onClick={() => setShowCreate(true)}
            className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" /> Add Partner
          </button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryCards.map((card) => (
          <div key={card.label} className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{card.label}</span>
              <card.icon className={`w-4 h-4 ${card.color}`} />
            </div>
            <div className="mt-2 text-2xl font-semibold">{card.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-muted rounded-lg p-1 w-fit">
        {(["partners", "pin-links"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-1.5 rounded-md text-sm font-medium transition-colors",
              tab === t
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t === "partners" ? "Partners" : "Pin Links"}
          </button>
        ))}
      </div>

      {/* Partners Tab */}
      {tab === "partners" && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left p-4 font-medium">Name</th>
                <th className="text-left p-4 font-medium">Code</th>
                <th className="text-right p-4 font-medium">Commission</th>
                <th className="text-right p-4 font-medium">Clicks</th>
                <th className="text-right p-4 font-medium">Conversions</th>
                <th className="text-right p-4 font-medium">Earnings</th>
                <th className="text-center p-4 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {partners.map((partner) => (
                <tr key={partner.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="p-4">
                    <div className="font-medium">{partner.name}</div>
                    {partner.email && (
                      <div className="text-xs text-muted-foreground">{partner.email}</div>
                    )}
                  </td>
                  <td className="p-4">
                    <span className="text-xs bg-muted px-2 py-0.5 rounded font-mono">{partner.code}</span>
                  </td>
                  <td className="p-4 text-right tabular-nums">{partner.commission_rate}%</td>
                  <td className="p-4 text-right tabular-nums">{partner.total_clicks.toLocaleString()}</td>
                  <td className="p-4 text-right tabular-nums">{partner.total_conversions.toLocaleString()}</td>
                  <td className="p-4 text-right tabular-nums">€{partner.total_earnings.toFixed(2)}</td>
                  <td className="p-4 text-center">
                    <span className={cn(
                      "text-xs px-2 py-0.5 rounded-full font-medium",
                      partner.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                    )}>
                      {partner.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {partners.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              No affiliate partners yet. Add your first partner to start tracking.
            </div>
          )}
        </div>
      )}

      {/* Pin Links Tab */}
      {tab === "pin-links" && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left p-4 font-medium">Product URL</th>
                <th className="text-left p-4 font-medium">Affiliate Tag</th>
                <th className="text-right p-4 font-medium">Clicks</th>
                <th className="text-right p-4 font-medium">Sales</th>
                <th className="text-right p-4 font-medium">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {pinLinks.map((link) => (
                <tr key={link.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="p-4 max-w-xs">
                    <a
                      href={link.product_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 hover:text-primary truncate"
                    >
                      {link.product_url}
                      <ExternalLink className="w-3 h-3 flex-shrink-0" />
                    </a>
                  </td>
                  <td className="p-4">
                    {link.affiliate_tag && (
                      <span className="text-xs bg-muted px-2 py-0.5 rounded font-mono">{link.affiliate_tag}</span>
                    )}
                  </td>
                  <td className="p-4 text-right tabular-nums">{link.clicks.toLocaleString()}</td>
                  <td className="p-4 text-right tabular-nums">{link.sales.toLocaleString()}</td>
                  <td className="p-4 text-right tabular-nums">€{link.revenue.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {pinLinks.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              No affiliate pin links yet. Links will appear as they are tracked from pins.
            </div>
          )}
        </div>
      )}

      {/* Create Partner Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-xl border border-border max-w-md w-full mx-4">
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Add Affiliate Partner</h3>
                <button onClick={() => setShowCreate(false)} className="p-1 hover:bg-muted rounded">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Name</label>
                <input
                  type="text"
                  value={newPartner.name}
                  onChange={(e) => setNewPartner({ ...newPartner, name: e.target.value })}
                  placeholder="Partner name"
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Email (optional)</label>
                <input
                  type="email"
                  value={newPartner.email}
                  onChange={(e) => setNewPartner({ ...newPartner, email: e.target.value })}
                  placeholder="partner@example.com"
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Referral Code</label>
                <input
                  type="text"
                  value={newPartner.code}
                  onChange={(e) => setNewPartner({ ...newPartner, code: e.target.value })}
                  placeholder="e.g. PARTNER2024"
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Commission Rate (%)</label>
                <input
                  type="number"
                  value={newPartner.commission_rate}
                  onChange={(e) => setNewPartner({ ...newPartner, commission_rate: e.target.value })}
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setShowCreate(false)}
                  className="flex-1 bg-muted text-foreground py-2 rounded-lg text-sm font-medium hover:bg-muted/80"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreatePartner}
                  disabled={creating || !newPartner.name.trim() || !newPartner.code.trim()}
                  className="flex-1 bg-primary text-primary-foreground py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                >
                  {creating ? "Creating..." : "Add Partner"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
