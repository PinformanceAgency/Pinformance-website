"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Users, LayoutDashboard, ChevronRight, ChevronDown,
  FileText, Sun, LayoutGrid, Search, Link2, FolderOpen,
  BarChart3, Settings, LineChart, Gauge, Scale, AlertTriangle, Radar,
  Share2, BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ClientSwitcher } from "./ClientSwitcher";
import type { ClientNav, SwitchableClient } from "@/lib/organic/nav";

/**
 * The SOP made navigable.
 *
 * Same shell as the main dashboard sidebar — same gradient, switcher,
 * small-caps group headers, icon set and active treatment — because a
 * manager moving between the two apps should not have to relearn where
 * anything is. What differs is the middle: phases 1–3 expand to their SOP
 * steps and each step to its tasks, so the whole method is reachable
 * without a horizontal tab strip in the content area.
 *
 * The client Report sits above a rule, marked, because it is the one
 * surface that leaves the building.
 */

interface Item {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number | null;
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold text-white/30 px-3 pt-5 pb-2 uppercase tracking-[0.15em]">
      {children}
    </div>
  );
}

function NavLink({ item, active }: { item: Item; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all relative",
        active ? "sidebar-nav-active font-medium" : "text-white/50 sidebar-nav-item hover:text-white/80"
      )}
    >
      <item.icon className="w-4 h-4 flex-shrink-0" />
      <span className="flex-1 truncate">{item.label}</span>
      {item.badge != null && item.badge > 0 && (
        <span className="o-num text-[10px] tabular-nums text-white/40">{item.badge}</span>
      )}
      {active && <ChevronRight className="w-3.5 h-3.5 opacity-60 flex-shrink-0" />}
    </Link>
  );
}

// Same three-colour logic as the light surfaces, inverted for the dark
// sidebar: red still means "yours to act on", but "settled" has to be
// white here — near-black on a #0f1117 ground is an invisible dot.
const STATUS_DOT: Record<string, string> = {
  DONE:        "bg-white/80",
  BLOCKED:     "bg-primary",
  IN_PROGRESS: "bg-primary/70",
  REVIEW:      "bg-primary/70",
  SKIPPED:     "bg-white/15",
  TODO:        "bg-white/30",
  // Defined in the SOP but not instantiated for this store yet.
  PENDING:     "bg-white/10",
};

/** One phase, expandable to steps, each step expandable to its tasks. */
function PhaseTree({
  phase, base, pathname,
}: {
  phase: ClientNav["phases"][number];
  base: string;
  pathname: string;
}) {
  const href = `${base}/phase/${phase.phase}`;
  const onPhase = pathname.startsWith(href);
  const [open, setOpen] = useState(onPhase);
  const recurring = phase.phase >= 4;

  return (
    <div>
      <div className={cn(
        "flex items-stretch rounded-lg",
        onPhase ? "sidebar-nav-active" : "sidebar-nav-item"
      )}>
        <Link
          href={href}
          className={cn(
            "flex items-center gap-3 pl-3 py-2 text-sm flex-1 min-w-0 rounded-l-lg",
            onPhase ? "font-medium" : "text-white/50 hover:text-white/80"
          )}
        >
          <span className={cn(
            "w-4 h-4 flex-shrink-0 rounded-[4px] grid place-items-center text-[10px] font-semibold",
            onPhase ? "bg-[#E30613]/20 text-[#E30613]" : "bg-white/[0.07] text-white/40"
          )}>
            {phase.phase}
          </span>
          <span className="flex-1 truncate">{phase.title}</span>
          {!recurring && phase.total > 0 && (
            <span className="o-num text-[10px] tabular-nums text-white/35">{phase.pct}%</span>
          )}
        </Link>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? `Collapse phase ${phase.phase}` : `Expand phase ${phase.phase}`}
          aria-expanded={open}
          className="px-2 text-white/30 hover:text-white/70 transition-colors rounded-r-lg"
        >
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Progress hairline. Phases 4 and 5 are recurring, so a completion
          bar there would be a category error. */}
      {!recurring && phase.total > 0 && (
        <div className="mx-3 mt-1 h-[2px] rounded-full bg-white/[0.07] overflow-hidden">
          <div className="h-full rounded-full bg-[#E30613]/50" style={{ width: `${phase.pct}%` }} />
        </div>
      )}

      {open && (
        <div className="mt-1 mb-1 ml-[1.4rem] border-l border-white/[0.07] pl-1 space-y-0.5">
          {phase.steps.map((s) => (
            <StepTree key={s.step} step={s} phase={phase.phase} base={base} pathname={pathname} />
          ))}
          {phase.steps.length === 0 && (
            <p className="px-3 py-1.5 text-[11px] text-white/25">No tasks in this phase yet.</p>
          )}
        </div>
      )}
    </div>
  );
}

function StepTree({
  step, phase, base, pathname,
}: {
  step: ClientNav["phases"][number]["steps"][number];
  phase: number;
  base: string;
  pathname: string;
}) {
  const href = `${base}/phase/${phase}/${step.step}`;
  const onStep = pathname === href;
  const [open, setOpen] = useState(onStep);
  // "Step 1.2 · Account audit" → "Account audit". The number is already
  // carried by the tree position.
  const short = step.title.includes("·") ? step.title.split("·").slice(1).join("·").trim() : step.title;

  return (
    <div>
      <div className="flex items-stretch">
        <Link
          href={href}
          className={cn(
            "flex items-center gap-2 pl-2.5 pr-1 py-1.5 text-[13px] flex-1 min-w-0 rounded-md transition-colors",
            onStep ? "text-white/90 bg-white/[0.05]" : "text-white/45 hover:text-white/75 hover:bg-white/[0.03]"
          )}
        >
          <span className="o-num text-[10px] tabular-nums text-white/25 w-5 flex-shrink-0">
            {phase}.{step.step}
          </span>
          <span className="flex-1 truncate">{short}</span>
          {step.blocked > 0 && (
            <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0"
                  title={`${step.blocked} blocked`} />
          )}
          {/* Complete only if the step actually ran. A phase-4 step whose
              tasks are not instantiated yet has nothing outstanding either,
              and marking that green would report unstarted work as done. */}
          {step.blocked === 0 && step.outstanding === 0 && step.instantiated > 0 && (
            <span className="w-1.5 h-1.5 rounded-full bg-white/70 flex-shrink-0" title="Complete" />
          )}
          {step.instantiated === 0 && (
            <span className="text-[9px] uppercase tracking-wider text-white/20 flex-shrink-0">soon</span>
          )}
        </Link>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? `Collapse step ${phase}.${step.step}` : `Expand step ${phase}.${step.step}`}
          aria-expanded={open}
          className="px-1.5 text-white/20 hover:text-white/60 transition-colors"
        >
          {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </button>
      </div>

      {open && (
        <ul className="ml-[1.6rem] border-l border-white/[0.06] pl-2 py-0.5 space-y-px">
          {step.tasks.map((t) => (
            <li key={t.task_id}>
              <Link
                href={`${href}#${t.task_id}`}
                className="flex items-center gap-2 px-2 py-1 rounded text-[12px] text-white/35 hover:text-white/70 hover:bg-white/[0.03] transition-colors"
                title={`${t.task_id} — ${t.name}`}
              >
                <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0",
                  STATUS_DOT[t.status] ?? "bg-white/20")} />
                <span className={cn("truncate", t.status === "SKIPPED" && "line-through opacity-60")}>
                  {t.name}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function OrganicSidebar({
  clients, nav,
}: {
  clients: SwitchableClient[];
  nav: ClientNav | null;
}) {
  const pathname = usePathname();
  // A store with no task bank has no phases, library or report to link
  // to, so it falls through to the picker nav — but the switcher above
  // still names it.
  const base = nav?.activated ? `/client/${nav.org_id}` : null;

  const isAgency = pathname.startsWith("/agency");
  const onReport = nav ? pathname.startsWith(`/report/${nav.org_id}`) : false;
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  const library: Item[] = base ? [
    // First in the library on purpose: the other four are things you built,
    // this is what you built them from, and it is the one you reach for
    // mid-decision in phase 4.
    { href: `${base}/research`, label: "Research",  icon: BookOpen },
    { href: `${base}/boards`,   label: "Boards",   icon: LayoutGrid },
    { href: `${base}/keywords`, label: "Keywords", icon: Search },
    { href: `${base}/urls`,     label: "URLs",     icon: Link2 },
    { href: `${base}/assets`,   label: "Assets",   icon: FolderOpen },
  ] : [];

  const analysis: Item[] = base ? [
    { href: `${base}/analytics`, label: "Store analytics", icon: BarChart3 },
    { href: `${base}/settings`,  label: "Settings",        icon: Settings },
  ] : [];

  const agency: Item[] = [
    { href: "/agency/portfolio", label: "Portfolio", icon: LineChart },
    { href: "/agency/execution", label: "Execution", icon: Gauge },
    { href: "/agency/margin",    label: "Margin",    icon: Scale },
    { href: "/agency/risk",      label: "Risk",      icon: AlertTriangle },
    { href: "/agency/method",    label: "Method",    icon: Radar },
  ];

  return (
    <aside className="w-64 sidebar-gradient h-screen flex flex-col relative overflow-hidden shrink-0">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-[#E30613]/5 rounded-full blur-3xl pointer-events-none" />

      {/* Logo */}
      <div className="p-5 pb-3 relative z-10">
        <Link href="/" className="flex items-center gap-3 group">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Pinformance"
               className="w-9 h-9 rounded-xl transition-transform group-hover:scale-105" />
          <div className="min-w-0">
            <div className="font-semibold text-lg text-white tracking-tight leading-none">Pinformance</div>
            <div className="text-[10px] uppercase tracking-wider text-[#E30613] font-medium mt-0.5">Organic</div>
          </div>
        </Link>
      </div>

      {/* Client switcher — replaces the old "All clients" back-link. A
          manager holding fifty stores switches from here, not by
          navigating back to a list. */}
      <ClientSwitcher
        clients={clients}
        currentOrgId={nav?.org_id ?? null}
        currentName={nav?.name ?? null}
      />

      <nav className="flex-1 px-3 pb-4 space-y-0.5 overflow-y-auto relative z-10">
        {nav && base ? (
          <>
            {/* ---- ORGANIC ---------------------------------------- */}
            <GroupLabel>Organic</GroupLabel>

            {/* The one shareable surface. Bordered, labelled, and separated
                by a rule from everything below, so nobody has to guess
                which tab is safe to screen-share. */}
            <Link
              href={`/report/${nav.org_id}`}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all relative border",
                onReport
                  ? "sidebar-nav-active font-medium border-[#E30613]/30"
                  : "text-white/60 border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] hover:text-white/85"
              )}
            >
              <FileText className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">Report</span>
              <span className="inline-flex items-center gap-1 text-[9px] uppercase tracking-widest text-[#E30613] font-semibold">
                <Share2 className="w-2.5 h-2.5" /> Client
              </span>
            </Link>
            <p className="px-3 pt-1 pb-2 text-[10px] leading-snug text-white/25">
              The only surface a client sees.
            </p>
            <div className="mx-3 mb-1 h-px bg-white/[0.07]" />

            <NavLink item={{ href: `${base}/today`, label: "Today", icon: Sun, badge: nav.today_count }}
                     active={isActive(`${base}/today`)} />
            <NavLink item={{ href: `${base}/overview`, label: "Overview", icon: LayoutDashboard }}
                     active={isActive(`${base}/overview`)} />

            {/* ---- STRATEGY CORE ---------------------------------- */}
            <GroupLabel>Strategy core</GroupLabel>
            <div className="space-y-1">
              {nav.phases.filter((p) => p.phase <= 3).map((p) => (
                <PhaseTree key={p.phase} phase={p} base={base} pathname={pathname} />
              ))}
            </div>

            {/* ---- MONTHLY MANAGEMENT ----------------------------- */}
            <GroupLabel>Monthly management</GroupLabel>
            <div className="space-y-1">
              {nav.phases.filter((p) => p.phase >= 4).map((p) => (
                <PhaseTree key={p.phase} phase={p} base={base} pathname={pathname} />
              ))}
            </div>

            {/* ---- LIBRARY ---------------------------------------- */}
            <GroupLabel>Library</GroupLabel>
            {library.map((i) => <NavLink key={i.href} item={i} active={isActive(i.href)} />)}

            {/* ---- ANALYSIS --------------------------------------- */}
            <GroupLabel>Analysis</GroupLabel>
            {analysis.map((i) => <NavLink key={i.href} item={i} active={isActive(i.href)} />)}
          </>
        ) : (
          <>
            <GroupLabel>Organic</GroupLabel>
            <NavLink item={{ href: "/", label: "Clients", icon: Users }}
                     active={pathname === "/" || pathname.startsWith("/client")} />
            <p className="px-3 pt-1.5 text-[11px] leading-snug text-white/25">
              {nav && !nav.activated
                ? `${nav.name} has no task bank yet. Activate it to open its phases, library and report.`
                : "Pick a store to open its phases, library and report."}
            </p>
          </>
        )}

        {/* ---- AGENCY ------------------------------------------- */}
        <GroupLabel>Agency</GroupLabel>
        {agency.map((i) => (
          <NavLink key={i.href} item={i} active={isAgency && isActive(i.href)} />
        ))}
      </nav>

      <div className="p-4 border-t border-white/[0.06] relative z-10">
        <a
          href="https://dashboard.pinformance-agency.com"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs text-white/40 hover:text-white/70 hover:bg-white/[0.04] transition-colors"
        >
          <LayoutDashboard className="w-3.5 h-3.5" />
          Main dashboard
        </a>
        <div className="text-[10px] text-white/20 text-center mt-2 tracking-wide">
          Powered by Pinformance
        </div>
      </div>
    </aside>
  );
}
