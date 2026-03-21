"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  LayoutGrid,
  Calendar,
  Image,
  BarChart3,
  Search,
  Settings,
  Shield,
  Users,
  MessageSquare,
  Activity,
  Sparkles,
  Link2,
  FileText,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useOrg } from "@/hooks/use-org";
import { createClient } from "@/lib/supabase/client";
import { useState } from "react";

const clientNav = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/boards", label: "Boards", icon: LayoutGrid },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/pins", label: "Pins", icon: Image },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/keywords", label: "Keywords", icon: Search },
  { href: "/affiliates", label: "Affiliates", icon: Link2 },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/settings", label: "Settings", icon: Settings },
];

const adminNav = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/clients", label: "All Clients", icon: Users },
  { href: "/admin/moderation", label: "Moderation", icon: Shield },
  { href: "/admin/rules", label: "AI Rules", icon: MessageSquare },
  { href: "/admin/system", label: "System", icon: Activity },
  { href: "/admin/patterns", label: "Patterns", icon: Sparkles },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { org, isAgencyAdmin, loading } = useOrg();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (loading) {
    return (
      <aside className="w-64 border-r border-border bg-card h-screen flex flex-col">
        <div className="p-6">
          <div className="h-8 w-32 bg-muted animate-pulse rounded" />
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-64 border-r border-border bg-card h-screen flex flex-col">
      <div className="p-6">
        <Link href="/overview" className="flex items-center gap-2">
          <img
            src="/logo.png"
            alt="Pinformance"
            className="w-8 h-8 rounded-lg"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.style.display = "none";
              target.nextElementSibling?.classList.remove("hidden");
            }}
          />
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center hidden">
            <span className="text-primary-foreground font-bold text-sm">P</span>
          </div>
          <span className="font-semibold text-lg">Pinformance</span>
        </Link>
      </div>

      {org && (
        <div className="px-6 pb-4">
          <div className="text-sm text-muted-foreground">Organization</div>
          <div className="font-medium truncate">{org.name}</div>
        </div>
      )}

      <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
        <div className="text-xs font-medium text-muted-foreground px-3 pb-2 uppercase tracking-wider">
          Dashboard
        </div>
        {clientNav.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                isActive
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </Link>
          );
        })}

        {isAgencyAdmin && (
          <>
            <div className="text-xs font-medium text-muted-foreground px-3 pt-6 pb-2 uppercase tracking-wider">
              Agency Admin
            </div>
            {adminNav.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      <div className="p-4 border-t border-border space-y-2">
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
        >
          <LogOut className="w-4 h-4" />
          {signingOut ? "Signing out..." : "Sign out"}
        </button>
        <div className="text-xs text-muted-foreground text-center">
          Powered by Pinformance
        </div>
      </div>
    </aside>
  );
}
