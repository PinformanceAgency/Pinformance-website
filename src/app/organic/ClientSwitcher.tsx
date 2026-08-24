"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { ChevronDown, Check, Building2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SwitchableClient } from "@/lib/organic/nav";

/**
 * Client switcher, visually identical to the dashboard's OrgSwitcher.
 *
 * It differs in what it does, and that difference is deliberate. The
 * dashboard switcher mutates users.active_org_id server-side and reloads,
 * because there the organisation is session state. Here the client is in
 * the URL, so switching navigates — and it keeps you on the same screen
 * rather than dumping you back at an overview, because a manager
 * comparing boards across two stores wants the boards page for the next
 * one, not a fresh start.
 *
 * Organic routes bypass auth (the hostname rewrite returns before
 * updateSession), so there is no useOrg() here. The list arrives from the
 * server.
 */
export function ClientSwitcher({
  clients, currentOrgId, currentName,
}: {
  clients: SwitchableClient[];
  currentOrgId: string | null;
  currentName: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  // Sixty-odd stores is past the point where scanning works.
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? clients.filter((c) => c.name.toLowerCase().includes(t)) : clients;
  }, [clients, q]);

  function switchTo(orgId: string) {
    // Preserve the current sub-route where it makes sense. A store that is
    // not activated has none of these screens, so those land on its
    // overview and get the activation prompt.
    const suffix = currentOrgId && pathname.startsWith(`/client/${currentOrgId}/`)
      ? pathname.slice(`/client/${currentOrgId}`.length)
      : "";
    const target = clients.find((c) => c.org_id === orgId);
    setOpen(false);
    router.push(target?.activated ? `/client/${orgId}${suffix}` : `/client/${orgId}`);
  }

  const activated = filtered.filter((c) => c.activated);
  const rest = filtered.filter((c) => !c.activated);

  return (
    <div className="mx-4 mb-4 relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-3 py-2.5 bg-white/[0.04] rounded-lg border border-white/[0.06] hover:bg-white/[0.06] transition-colors text-left"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-widest text-white/40 font-medium flex items-center gap-1">
              <Building2 className="w-2.5 h-2.5" /> Client
            </div>
            <div className="font-medium text-sm text-white/90 truncate mt-0.5">
              {currentName || "All clients"}
            </div>
          </div>
          <ChevronDown className={cn("w-4 h-4 text-white/50 transition-transform", open && "rotate-180")} />
        </div>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-[#1a1a1a] border border-white/10 rounded-lg shadow-2xl overflow-hidden z-50">
          <div className="p-2 border-b border-white/[0.06]">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search stores…"
                className="w-full bg-white/[0.04] border border-white/[0.06] rounded-md pl-7 pr-2 py-1.5 text-sm text-white/90 placeholder:text-white/30 focus:outline-none focus:border-white/20"
              />
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto">
            <button
              type="button"
              onClick={() => { setOpen(false); router.push("/"); }}
              className="w-full px-3 py-2 text-left text-sm text-white/70 hover:bg-white/[0.06] transition-colors"
            >
              All clients
            </button>

            {activated.length > 0 && (
              <div className="text-[10px] uppercase tracking-widest text-white/30 px-3 pt-2.5 pb-1 font-medium">
                Activated
              </div>
            )}
            {activated.map((c) => (
              <Row key={c.org_id} c={c} current={c.org_id === currentOrgId} onPick={switchTo} />
            ))}

            {rest.length > 0 && (
              <div className="text-[10px] uppercase tracking-widest text-white/30 px-3 pt-2.5 pb-1 font-medium">
                Not activated
              </div>
            )}
            {rest.map((c) => (
              <Row key={c.org_id} c={c} current={c.org_id === currentOrgId} onPick={switchTo} />
            ))}

            {filtered.length === 0 && (
              <div className="py-4 px-3 text-xs text-white/40 text-center">
                No store matches &ldquo;{q}&rdquo;
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({
  c, current, onPick,
}: {
  c: SwitchableClient; current: boolean; onPick: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => !current && onPick(c.org_id)}
      disabled={current}
      className={cn(
        "w-full px-3 py-2 text-left text-sm hover:bg-white/[0.06] transition-colors flex items-center gap-2",
        current ? "text-white/90 bg-white/[0.02]" : c.activated ? "text-white/70" : "text-white/40"
      )}
    >
      <span className="flex-1 truncate">{c.name}</span>
      {current && <Check className="w-3.5 h-3.5 text-white/70" />}
    </button>
  );
}
