"use client";

import { useCallback, useState } from "react";
import { Loader2 } from "lucide-react";
import { useHubData } from "@/hooks/use-hub-data";
import {
  CompanyOverviewCard,
  GlobalFilterBar,
  EMPTY_FILTERS,
  type HubFilters,
} from "@/components/media-buying/hub-panels";
import { WeeklyComparisonSection } from "@/components/media-buying/hub-charts";
import { StoreDeepDive } from "@/components/media-buying/hub-store-deepdive";

export default function AnalyticOverviewPage() {
  const { hub, error } = useHubData();
  const [filters, setFilters] = useState<HubFilters>(EMPTY_FILTERS);
  const [deepDiveOrgId, setDeepDiveOrgId] = useState<string | null>(null);
  const openStore = useCallback((orgId: string) => setDeepDiveOrgId(orgId), []);
  const closeStore = useCallback(() => setDeepDiveOrgId(null), []);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Analytic Overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Company-level snapshot and weekly bar charts across every configured store, split
          per department and per media buyer.
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
          <CompanyOverviewCard hub={hub} filters={filters} />
          <WeeklyComparisonSection hub={hub} filters={filters} />
        </>
      )}

      {hub && deepDiveOrgId && (
        <StoreDeepDive orgId={deepDiveOrgId} hub={hub} onClose={closeStore} />
      )}
      {/* openStore reserved for future click-through on the WeeklyComparison rows. */}
      <div className="hidden">{openStore.name}</div>
    </div>
  );
}
