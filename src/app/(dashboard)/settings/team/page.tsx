"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/hooks/use-org";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Users,
  Plus,
  X,
  Trash2,
  Mail,
  Shield,
} from "lucide-react";
import type { User, UserRole } from "@/lib/types";

const TABS = [
  { href: "/settings", label: "General" },
  { href: "/settings/team", label: "Team" },
  { href: "/settings/api-keys", label: "API Keys" },
  { href: "/settings/prompts", label: "Prompts" },
  { href: "/settings/images", label: "Images" },
];

const ROLE_LABELS: Record<UserRole, string> = {
  agency_admin: "Agency Admin",
  client_admin: "Client Admin",
  client_viewer: "Client Viewer",
};

export default function TeamPage() {
  const pathname = usePathname();
  const { org, user: currentUser, loading } = useOrg();
  const [members, setMembers] = useState<User[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<UserRole>("client_viewer");
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    if (!org) return;
    loadMembers();
  }, [org]);

  async function loadMembers() {
    const supabase = createClient();
    const { data } = await supabase
      .from("users")
      .select("*")
      .eq("org_id", org!.id)
      .order("created_at");

    setMembers((data as User[]) || []);
  }

  async function handleInvite() {
    if (!org || !inviteEmail.trim()) return;
    setInviting(true);

    await fetch("/api/team/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: inviteEmail.trim(),
        role: inviteRole,
      }),
    });

    setInviteEmail("");
    setInviteRole("client_viewer");
    setShowInvite(false);
    setInviting(false);
    loadMembers();
  }

  async function handleRemove(userId: string) {
    if (!confirm("Remove this team member?")) return;

    await fetch("/api/team/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    });

    loadMembers();
  }

  if (loading) {
    return <div className="h-96 bg-muted animate-pulse rounded-xl" />;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Configure your organization and posting preferences
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted rounded-lg p-1">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "flex-1 text-center px-4 py-2 rounded-md text-sm font-medium transition-colors",
              pathname === tab.href
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Team</h2>
          <p className="text-muted-foreground text-sm mt-0.5">
            Manage who has access to this organization
          </p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-primary/90"
        >
          <Plus className="w-4 h-4" /> Invite Member
        </button>
      </div>

      <div className="bg-card border border-border rounded-xl divide-y divide-border">
        {members.map((member) => (
          <div
            key={member.id}
            className="p-4 flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center">
                {member.avatar_url ? (
                  <img
                    src={member.avatar_url}
                    alt={member.full_name}
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  <Users className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
              <div>
                <div className="text-sm font-medium">
                  {member.full_name}
                  {member.id === currentUser?.id && (
                    <span className="text-xs text-muted-foreground ml-1.5">
                      (you)
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <span className="flex items-center gap-0.5">
                    <Mail className="w-3 h-3" /> {member.email}
                  </span>
                  <span>
                    Joined{" "}
                    {new Date(member.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "text-xs px-2.5 py-1 rounded-full font-medium flex items-center gap-1",
                  member.role === "agency_admin" &&
                    "bg-primary/10 text-primary",
                  member.role === "client_admin" &&
                    "bg-blue-100 text-blue-700",
                  member.role === "client_viewer" &&
                    "bg-muted text-muted-foreground"
                )}
              >
                <Shield className="w-3 h-3" />
                {ROLE_LABELS[member.role]}
              </span>
              {member.id !== currentUser?.id && (
                <button
                  onClick={() => handleRemove(member.id)}
                  className="p-1.5 hover:bg-red-50 rounded text-red-500 hover:text-red-600"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {members.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No team members found.
        </div>
      )}

      {/* Invite Modal */}
      {showInvite && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-xl border border-border max-w-md w-full mx-4">
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Invite Team Member</h3>
                <button
                  onClick={() => setShowInvite(false)}
                  className="p-1 hover:bg-muted rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Email
                </label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="team@example.com"
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Role
                </label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as UserRole)}
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="client_viewer">Client Viewer</option>
                  <option value="client_admin">Client Admin</option>
                  <option value="agency_admin">Agency Admin</option>
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setShowInvite(false)}
                  className="flex-1 bg-muted text-foreground py-2 rounded-lg text-sm font-medium hover:bg-muted/80"
                >
                  Cancel
                </button>
                <button
                  onClick={handleInvite}
                  disabled={inviting || !inviteEmail.trim()}
                  className="flex-1 bg-primary text-primary-foreground py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                >
                  {inviting ? "Inviting..." : "Send Invite"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
