"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, LayoutGrid, Search, Link2, Repeat, FolderOpen, ListChecks, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { slug: "",           label: "Overview",  icon: LayoutDashboard },
  { slug: "boards",     label: "Boards",    icon: LayoutGrid },
  { slug: "keywords",   label: "Keywords",  icon: Search },
  { slug: "urls",       label: "URLs",      icon: Link2 },
  { slug: "cycles",     label: "Cycles",    icon: Repeat },
  { slug: "assets",     label: "Assets",    icon: FolderOpen },
  { slug: "tasks",      label: "Tasks",     icon: ListChecks },
  { slug: "analytics",  label: "Analytics", icon: BarChart3 },
];

export function ClientTabs({ orgId }: { orgId: string }) {
  const pathname = usePathname();
  const base = `/client/${orgId}`;
  return (
    <div className="border-b border-border">
      <nav className="flex flex-wrap gap-1 -mb-px">
        {TABS.map((t) => {
          const href = t.slug ? `${base}/${t.slug}` : base;
          const isActive = t.slug
            ? pathname.startsWith(`${base}/${t.slug}`)
            : pathname === base || pathname === `${base}/`;
          return (
            <Link key={t.slug} href={href}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px transition-colors",
                isActive
                  ? "border-primary text-foreground font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              )}>
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
