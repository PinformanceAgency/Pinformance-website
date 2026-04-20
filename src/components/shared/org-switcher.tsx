"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check, Loader2, Building2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Org = { id: string; name: string; slug: string | null };

/**
 * Organisation switcher dropdown. Renders ONLY for agency_admin users.
 * On select, POSTs to /api/auth/switch-org which updates users.active_org_id
 * (server-side role check — non-admins cannot switch even if they hit the endpoint).
 */
export function OrgSwitcher({ currentOrgName }: { currentOrgName?: string | null }) {
  const [open, setOpen] = useState(false);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  async function loadOrgs() {
    if (orgs.length > 0) return;
    setLoading(true);
    try {
      const supabase = createClient();
      // RLS allows agency_admin to read all organisations
      const { data } = await supabase
        .from("organizations")
        .select("id, name, slug")
        .order("name", { ascending: true });
      if (data) setOrgs(data as Org[]);
    } finally {
      setLoading(false);
    }
  }

  async function switchTo(orgId: string) {
    setSwitching(orgId);
    try {
      const res = await fetch("/api/auth/switch-org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: orgId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err?.error || "Failed to switch organisation");
        return;
      }
      // Reload so all server-side data reflects new active org
      window.location.reload();
    } catch (err) {
      alert(String(err));
    } finally {
      setSwitching(null);
    }
  }

  return (
    <div className="mx-4 mb-4 relative" ref={ref}>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          loadOrgs();
        }}
        className="w-full px-3 py-2.5 bg-white/[0.04] rounded-lg border border-white/[0.06] hover:bg-white/[0.06] transition-colors text-left"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-widest text-white/40 font-medium flex items-center gap-1">
              <Building2 className="w-2.5 h-2.5" /> Organisation
            </div>
            <div className="font-medium text-sm text-white/90 truncate mt-0.5">
              {currentOrgName || "Select…"}
            </div>
          </div>
          <ChevronDown className={cn("w-4 h-4 text-white/50 transition-transform", open && "rotate-180")} />
        </div>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-[#1a1a1a] border border-white/10 rounded-lg shadow-2xl overflow-hidden z-50 max-h-80 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-6 text-white/40 text-xs gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
            </div>
          )}
          {!loading && orgs.length === 0 && (
            <div className="py-4 px-3 text-xs text-white/40 text-center">No organisations found</div>
          )}
          {!loading && orgs.map((o) => {
            const isCurrent = o.name === currentOrgName;
            const isSwitching = switching === o.id;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => !isCurrent && !isSwitching && switchTo(o.id)}
                disabled={isCurrent || isSwitching}
                className={cn(
                  "w-full px-3 py-2 text-left text-sm hover:bg-white/[0.06] transition-colors flex items-center gap-2",
                  isCurrent ? "text-white/90 bg-white/[0.02]" : "text-white/70"
                )}
              >
                <span className="flex-1 truncate">{o.name}</span>
                {isSwitching && <Loader2 className="w-3.5 h-3.5 animate-spin text-white/50" />}
                {!isSwitching && isCurrent && <Check className="w-3.5 h-3.5 text-white/70" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
