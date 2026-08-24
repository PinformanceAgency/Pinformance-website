"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, LayoutDashboard, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function OrganicSidebar() {
  const pathname = usePathname();
  const isClients = pathname === "/" || pathname.startsWith("/client") || pathname.startsWith("/report");
  const isAgency = pathname.startsWith("/agency");

  return (
    <aside className="w-64 sidebar-gradient h-screen flex flex-col relative overflow-hidden shrink-0">
      {/* Subtle radial glow at top — same as the dashboard sidebar */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-[#E30613]/5 rounded-full blur-3xl pointer-events-none" />

      {/* Logo */}
      <div className="p-5 pb-3 relative z-10">
        <Link href="/" className="flex items-center gap-3 group">
          <img
            src="/logo.png"
            alt="Pinformance"
            className="w-9 h-9 rounded-xl transition-transform group-hover:scale-105"
          />
          <div className="min-w-0">
            <div className="text-sidebar-foreground font-semibold text-sm leading-tight">Pinformance</div>
            <div className="text-[10px] uppercase tracking-wider text-[#E30613] font-medium">Organic</div>
          </div>
        </Link>
      </div>

      <div className="h-px bg-sidebar-border mx-5 mb-2" />

      <nav className="flex-1 px-3 space-y-0.5 relative z-10">
        <Link
          href="/"
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
            isClients
              ? "bg-sidebar-muted text-sidebar-foreground font-medium"
              : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-muted/60"
          )}
        >
          <Users className="w-4 h-4" />
          Clients
        </Link>
        <Link
          href="/agency/portfolio"
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
            isAgency
              ? "bg-sidebar-muted text-sidebar-foreground font-medium"
              : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-muted/60"
          )}
        >
          <Building2 className="w-4 h-4" />
          Agency
        </Link>
      </nav>

      <div className="p-4 relative z-10">
        <a
          href="https://dashboard.pinformance-agency.com"
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-muted/60 transition-colors"
        >
          <LayoutDashboard className="w-3.5 h-3.5" />
          Main dashboard
        </a>
      </div>
    </aside>
  );
}
