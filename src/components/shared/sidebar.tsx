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
  Users,
  Sparkles,
  Link2,
  FileText,
  FolderOpen,
  LogOut,
  ChevronRight,
  Zap,
  Key,
  LifeBuoy,
  Activity,
  Gauge,
  Store,
  Radar,
  Scale,
  LineChart,
  AlertTriangle,
  Grid3x3,
  Users2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useOrg } from "@/hooks/use-org";
import { canAccessPath } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/client";
import { useState } from "react";
import { OrgSwitcher } from "./org-switcher";

const organicNav = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/boards", label: "Boards", icon: LayoutGrid },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/pins", label: "Pins", icon: Image },
  { href: "/creatives", label: "Creatives", icon: Sparkles },
  { href: "/content-hub", label: "Content Hub", icon: FolderOpen },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/keywords", label: "Keywords", icon: Search },
  { href: "/pipeline", label: "Pipeline", icon: Zap },
  { href: "/affiliates", label: "Affiliates", icon: Link2 },
  { href: "/documents", label: "Documents", icon: FileText },
];

const paidAdsNav = [
  { href: "/paid-ads/creatives", label: "Creatives", icon: Sparkles },
  { href: "/paid-ads/media-buying", label: "Mediabuying", icon: BarChart3 },
  { href: "/paid-ads/creative-cadence", label: "Creative Cadence", icon: Gauge },
];

const mediaBuyingHubNav = [
  { href: "/media-buying-hub/overview", label: "Analytic Overview", icon: LineChart },
  { href: "/media-buying-hub/zones", label: "Zones", icon: Grid3x3 },
  { href: "/media-buying-hub/critical", label: "Critical Attention", icon: AlertTriangle },
  { href: "/media-buying-hub/team-activity", label: "Team Activity", icon: Users2 },
  { href: "/media-buying-hub/benchmarks", label: "Benchmarks", icon: Scale },
  { href: "/media-buying-hub/store-settings", label: "Store Settings", icon: Store },
];

const adminSharedNav = [
  { href: "/integrations", label: "Integrations", icon: Key },
  { href: "/settings", label: "Settings", icon: Settings },
];

const adminOnlyNav = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/clients", label: "All Clients", icon: Users },
  { href: "/admin/activity", label: "Ad Activity", icon: Activity },
  { href: "/help-center", label: "Help Center", icon: LifeBuoy },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { org, user, isAgencyAdmin, loading } = useOrg();
  const [signingOut, setSigningOut] = useState(false);

  // Restricted roles (store_owner) see only a subset of nav items.
  const role = user?.role;
  const visibleOrganic = organicNav.filter((i) => canAccessPath(role, i.href));
  const visiblePaidAds = paidAdsNav.filter((i) => canAccessPath(role, i.href));
  const visibleHub = mediaBuyingHubNav.filter((i) => canAccessPath(role, i.href));
  const visibleAdminShared = adminSharedNav.filter((i) => canAccessPath(role, i.href));

  async function handleSignOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (loading) {
    return (
      <aside className="w-64 sidebar-gradient h-screen flex flex-col">
        <div className="p-6">
          <div className="h-8 w-32 bg-white/10 animate-pulse rounded" />
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-64 sidebar-gradient h-screen flex flex-col relative overflow-hidden">
      {/* Subtle radial glow at top */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-[#E30613]/5 rounded-full blur-3xl pointer-events-none" />

      {/* Logo */}
      <div className="p-5 pb-3 relative z-10">
        <Link href="/overview" className="flex items-center gap-3 group">
          <div className="relative">
            <img
              src="/logo.png"
              alt="Pinformance"
              className="w-9 h-9 rounded-xl transition-transform group-hover:scale-105"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = "none";
                target.nextElementSibling?.classList.remove("hidden");
              }}
            />
            <div className="w-9 h-9 bg-[#E30613] rounded-xl flex items-center justify-center hidden">
              <span className="text-white font-bold text-sm">P</span>
            </div>
          </div>
          <span className="font-semibold text-lg text-white tracking-tight">
            Pinformance
          </span>
        </Link>
      </div>

      {/* Organization — dropdown for agency_admin, static badge for everyone else */}
      {org && isAgencyAdmin && <OrgSwitcher currentOrgName={org.name} />}
      {org && !isAgencyAdmin && (
        <div className="mx-4 mb-4 px-3 py-2.5 bg-white/[0.04] rounded-lg border border-white/[0.06]">
          <div className="text-[10px] uppercase tracking-widest text-white/40 font-medium">
            Organization
          </div>
          <div className="font-medium text-sm text-white/90 truncate mt-0.5">
            {org.name}
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto relative z-10">
        {visibleOrganic.length > 0 && (
          <div className="text-[10px] font-semibold text-white/30 px-3 pb-2 uppercase tracking-[0.15em]">
            Organic
          </div>
        )}
        {visibleOrganic.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all relative",
                isActive
                  ? "sidebar-nav-active font-medium"
                  : "text-white/50 sidebar-nav-item hover:text-white/80"
              )}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">{item.label}</span>
              {isActive && (
                <ChevronRight className="w-3.5 h-3.5 opacity-60" />
              )}
            </Link>
          );
        })}

        {visiblePaidAds.length > 0 && (
          <div className="text-[10px] font-semibold text-white/30 px-3 pt-5 pb-2 uppercase tracking-[0.15em]">
            Paid Ads
          </div>
        )}
        {visiblePaidAds.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all relative",
                isActive
                  ? "sidebar-nav-active font-medium"
                  : "text-white/50 sidebar-nav-item hover:text-white/80"
              )}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">{item.label}</span>
              {isActive && (
                <ChevronRight className="w-3.5 h-3.5 opacity-60" />
              )}
            </Link>
          );
        })}

        {visibleHub.length > 0 && (
          <div className="text-[10px] font-semibold text-white/30 px-3 pt-5 pb-2 uppercase tracking-[0.15em]">
            Media Buying Hub
          </div>
        )}
        {visibleHub.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all relative",
                isActive
                  ? "sidebar-nav-active font-medium"
                  : "text-white/50 sidebar-nav-item hover:text-white/80"
              )}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">{item.label}</span>
              {isActive && (
                <ChevronRight className="w-3.5 h-3.5 opacity-60" />
              )}
            </Link>
          );
        })}

        {(visibleAdminShared.length > 0 || isAgencyAdmin) && (
          <div className="text-[10px] font-semibold text-white/30 px-3 pt-5 pb-2 uppercase tracking-[0.15em]">
            {role === "store_owner" ? "Account" : "Agency Admin"}
          </div>
        )}
        {visibleAdminShared.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all relative",
                isActive
                  ? "sidebar-nav-active font-medium"
                  : "text-white/50 sidebar-nav-item hover:text-white/80"
              )}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">{item.label}</span>
              {isActive && (
                <ChevronRight className="w-3.5 h-3.5 opacity-60" />
              )}
            </Link>
          );
        })}
        {isAgencyAdmin && adminOnlyNav.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all relative",
                isActive
                  ? "sidebar-nav-active font-medium"
                  : "text-white/50 sidebar-nav-item hover:text-white/80"
              )}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">{item.label}</span>
              {isActive && (
                <ChevronRight className="w-3.5 h-3.5 opacity-60" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-white/[0.06] relative z-10">
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-white/40 hover:text-white/70 hover:bg-white/[0.04] transition-all disabled:opacity-50"
        >
          <LogOut className="w-4 h-4" />
          {signingOut ? "Signing out..." : "Sign out"}
        </button>
        <div className="text-[10px] text-white/20 text-center mt-2 tracking-wide">
          Powered by Pinformance
        </div>
      </div>
    </aside>
  );
}
