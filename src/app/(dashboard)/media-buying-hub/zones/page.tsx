"use client";

import { useCallback, useState } from "react";
import { Loader2 } from "lucide-react";
import { useHubData } from "@/hooks/use-hub-data";
import {
  GlobalFilterBar,
  EMPTY_FILTERS,
  type HubFilters,
} from "@/components/media-buying/hub-panels";
import { ZoneBlocksSection } from "@/components/media-buying/hub-charts";
import { StoreDeepDive } from "@/components/media-buying/hub-store-deepdive";
import { cn } from "@/lib/utils";

type ZoneScope = "weekly" | "monthly" | "last-month";

const SCOPE_LABELS: Record<ZoneScope, string> = {
  weekly: "Last 4 weeks",
  monthly: "This month",
  "last-month": "Last month",
};

export default function ZonesPage() {
  const { hub, error } = useHubData();
  const [filters, setFilters] = useState<HubFilters>(EMPTY_FILTERS);
  const [scope, setScope] = useState<ZoneScope>("weekly");
  const [deepDiveOrgId, setDeepDiveOrgId] = useState<string | null>(null);
  const openStore = useCallback((orgId: string) => setDeepDiveOrgId(orgId), []);
  const closeStore = useCallback(() => setDeepDiveOrgId(null), []);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Zones</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Red / orange / green at company, department and media-buyer level.
          The last four weeks show short-term flips, this month shows who is on
          pace, and last month is the finished month with its own numbers on
          every store.
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}
      {!hub && !error && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading hub…
        </div>
      )}

      {hub && (
        <>
          <GlobalFilterBar hub={hub} filters={filters} onChange={setFilters} />
          <div className="inline-flex bg-muted rounded-lg p-1">
            {(["weekly", "monthly", "last-month"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setScope(s)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                  scope === s
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {SCOPE_LABELS[s]}
              </button>
            ))}
          </div>
          <ZoneBlocksSection hub={hub} filters={filters} onStoreClick={openStore} mode={scope} />
        </>
      )}

      {hub && deepDiveOrgId && (
        <StoreDeepDive orgId={deepDiveOrgId} hub={hub} onClose={closeStore} />
      )}
    </div>
  );
}
