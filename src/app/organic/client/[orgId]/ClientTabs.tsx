"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, LayoutGrid, Search, Link2, FolderOpen, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PhaseProgressLite {
  phase: number;
  pct_done: number;
  done_tasks: number;
  total_tasks: number;
  blocked_tasks: number;
}

const PHASES = [
  { n: 1, label: "Phase 1", sub: "Onboarding & audit" },
  { n: 2, label: "Phase 2", sub: "Research" },
  { n: 3, label: "Phase 3", sub: "Keywords & boards" },
  { n: 4, label: "Phase 4", sub: "Production cycles" },
  { n: 5, label: "Phase 5", sub: "Analytics & loop" },
];

const REFERENCE_TABS = [
  { slug: "boards",    label: "Boards",    icon: LayoutGrid },
  { slug: "keywords",  label: "Keywords",  icon: Search },
  { slug: "urls",      label: "URLs",      icon: Link2 },
  { slug: "assets",    label: "Assets",    icon: FolderOpen },
  { slug: "analytics", label: "Analytics", icon: BarChart3 },
];

export function ClientTabs({ orgId, phases }: { orgId: string; phases: PhaseProgressLite[] }) {
  const pathname = usePathname();
  const base = `/client/${orgId}`;
  const byPhase = new Map(phases.map((p) => [p.phase, p]));

  return (
    <div className="space-y-3">
      {/* Phase tabs — the primary navigation */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {PHASES.map((ph) => {
          const p = byPhase.get(ph.n);
          const href = `${base}/phase/${ph.n}`;
          const isActive = pathname.startsWith(href);
          const pct = p?.pct_done ?? 0;
          const done = pct >= 100;
          return (
            <Link key={ph.n} href={href}
              className={cn(
                "rounded-lg border p-3 transition-colors",
                isActive
                  ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                  : "border-border bg-card hover:border-primary/40 hover:bg-muted/40"
              )}>
              <div className="flex items-baseline justify-between gap-2">
                <span className={cn("text-sm font-semibold", isActive ? "text-primary" : "text-foreground")}>{ph.label}</span>
                <span className={cn("text-xs tabular-nums font-medium", done ? "text-emerald-600" : "text-muted-foreground")}>
                  {pct}%
                </span>
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{ph.sub}</div>
              <div className="mt-2 h-1 rounded-full bg-muted overflow-hidden">
                <div className={cn("h-full transition-all",
                  done ? "bg-emerald-500" : pct >= 50 ? "bg-primary" : pct > 0 ? "bg-amber-500" : "bg-transparent")}
                  style={{ width: `${Math.min(100, pct)}%` }} />
              </div>
              {p && (
                <div className="mt-1.5 text-[10px] text-muted-foreground tabular-nums">
                  {p.done_tasks}/{p.total_tasks}
                  {p.blocked_tasks > 0 && <span className="ml-1.5 text-red-600 font-medium">{p.blocked_tasks} blocked</span>}
                </div>
              )}
            </Link>
          );
        })}
      </div>

      {/* Secondary reference tabs */}
      <div className="border-b border-border">
        <nav className="flex flex-wrap gap-1 -mb-px">
          <Link href={base}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px transition-colors",
              pathname === base
                ? "border-primary text-foreground font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            )}>
            <LayoutDashboard className="w-3.5 h-3.5" />
            Overview
          </Link>
          {REFERENCE_TABS.map((t) => {
            const href = `${base}/${t.slug}`;
            const isActive = pathname.startsWith(href);
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
    </div>
  );
}
