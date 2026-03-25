"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/hooks/use-org";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  X,
  Search,
  Check,
  AlertCircle,
  ShoppingCart,
  Key,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Organization } from "@/lib/types";

interface ClientRow extends Organization {
  pin_count: number;
  board_count: number;
}

export default function ClientsPage() {
  const { user, isAgencyAdmin, loading: authLoading } = useOrg();
  const router = useRouter();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showAddClient, setShowAddClient] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgSlug, setNewOrgSlug] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!isAgencyAdmin) {
      router.push("/overview");
      return;
    }

    load();
  }, [authLoading, isAgencyAdmin, router]);

  async function load() {
    const supabase = createClient();

    const { data: orgs } = await supabase
      .from("organizations")
      .select("*")
      .order("created_at", { ascending: false });

    if (!orgs) {
      setLoading(false);
      return;
    }

    const enriched: ClientRow[] = await Promise.all(
      orgs.map(async (org) => {
        const [pinsRes, boardsRes] = await Promise.all([
          supabase
            .from("pins")
            .select("id", { count: "exact", head: true })
            .eq("org_id", org.id),
          supabase
            .from("boards")
            .select("id", { count: "exact", head: true })
            .eq("org_id", org.id),
        ]);

        return {
          ...org,
          pin_count: pinsRes.count || 0,
          board_count: boardsRes.count || 0,
        } as ClientRow;
      })
    );

    setClients(enriched);
    setLoading(false);
  }

  async function handleCreateClient() {
    if (!newOrgName.trim() || !newOrgSlug.trim() || !newUserEmail.trim()) return;
    setCreating(true);

    try {
      await fetch("/api/admin/create-client", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_name: newOrgName.trim(),
          org_slug: newOrgSlug.trim(),
          user_email: newUserEmail.trim(),
        }),
      });

      setNewOrgName("");
      setNewOrgSlug("");
      setNewUserEmail("");
      setShowAddClient(false);
      load();
    } catch {
      // handle silently
    }

    setCreating(false);
  }

  const onboardingLabel = (step: number) => {
    const labels: Record<number, string> = {
      0: "Not started",
      1: "Intake form",
      2: "Pinterest setup",
      3: "Trello & assets",
      4: "Tracking",
    };
    return labels[step] || `Step ${step}`;
  };

  const filtered = clients.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.slug.toLowerCase().includes(search.toLowerCase()) ||
      (c.shopify_domain || "").toLowerCase().includes(search.toLowerCase())
  );

  if (authLoading || loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-64 bg-muted animate-pulse rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Clients</h1>
          <p className="text-muted-foreground mt-1">
            All organizations managed by the agency
          </p>
        </div>
        <button
          onClick={() => setShowAddClient(true)}
          className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-primary/90"
        >
          <Plus className="w-4 h-4" /> Add Client
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, slug, or domain..."
          className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left p-4 font-medium">Organization</th>
              <th className="text-left p-4 font-medium">Integrations</th>
              <th className="text-left p-4 font-medium">Onboarding</th>
              <th className="text-right p-4 font-medium">Pins</th>
              <th className="text-right p-4 font-medium">Boards</th>
              <th className="text-left p-4 font-medium">Last Activity</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((client) => (
              <tr
                key={client.id}
                className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
              >
                <td className="p-4">
                  <Link
                    href={`/admin/clients/${client.id}`}
                    className="font-medium hover:underline"
                  >
                    {client.name}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {client.slug}
                  </div>
                </td>
                <td className="p-4">
                  <div className="flex items-center gap-2">
                    <span
                      title={client.shopify_domain ? `Shopify: ${client.shopify_domain}` : "Shopify: Not connected"}
                      className={cn(
                        "w-6 h-6 rounded flex items-center justify-center",
                        client.shopify_domain
                          ? "bg-green-100 text-green-600"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      <ShoppingCart className="w-3 h-3" />
                    </span>
                    <span
                      title={client.pinterest_user_id ? "Pinterest: Connected" : "Pinterest: Not connected"}
                      className={cn(
                        "w-6 h-6 rounded flex items-center justify-center",
                        client.pinterest_user_id
                          ? "bg-green-100 text-green-600"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      <Key className="w-3 h-3" />
                    </span>
                    <span
                      title={client.onboarding_step >= 6 ? "kie.ai: Connected" : "kie.ai: Not connected"}
                      className={cn(
                        "w-6 h-6 rounded flex items-center justify-center",
                        client.onboarding_step >= 6
                          ? "bg-green-100 text-green-600"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      <span className="text-[10px] font-bold">K</span>
                    </span>
                  </div>
                </td>
                <td className="p-4">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      client.onboarding_step === 4
                        ? "bg-green-100 text-green-700"
                        : "bg-yellow-100 text-yellow-700"
                    }`}
                  >
                    {onboardingLabel(client.onboarding_step)}
                  </span>
                </td>
                <td className="p-4 text-right tabular-nums">
                  {client.pin_count}
                </td>
                <td className="p-4 text-right tabular-nums">
                  {client.board_count}
                </td>
                <td className="p-4 text-muted-foreground">
                  {new Date(client.updated_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            {search ? "No clients match your search." : "No clients yet."}
          </div>
        )}
      </div>

      {/* Add Client Modal */}
      {showAddClient && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-xl border border-border max-w-md w-full mx-4">
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Add New Client</h3>
                <button
                  onClick={() => setShowAddClient(false)}
                  className="p-1 hover:bg-muted rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Organization Name
                </label>
                <input
                  type="text"
                  value={newOrgName}
                  onChange={(e) => {
                    setNewOrgName(e.target.value);
                    setNewOrgSlug(
                      e.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, "-")
                        .replace(/^-|-$/g, "")
                    );
                  }}
                  placeholder="Acme Inc."
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Slug
                </label>
                <input
                  type="text"
                  value={newOrgSlug}
                  onChange={(e) => setNewOrgSlug(e.target.value)}
                  placeholder="acme-inc"
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Client Admin Email
                </label>
                <input
                  type="email"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  placeholder="client@example.com"
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  An invite will be sent to this email
                </p>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setShowAddClient(false)}
                  className="flex-1 bg-muted text-foreground py-2 rounded-lg text-sm font-medium hover:bg-muted/80"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateClient}
                  disabled={creating || !newOrgName.trim() || !newUserEmail.trim()}
                  className="flex-1 bg-primary text-primary-foreground py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                >
                  {creating ? "Creating..." : "Create Client"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
