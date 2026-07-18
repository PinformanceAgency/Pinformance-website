"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { HubResponse } from "@/lib/media-buying/hub-types";
import {
  ZoneOverview,
  BuyerScorecard,
  DepartmentBreakdown,
  ExceptionsPanel,
  MoversPanel,
  CompanyOverviewCard,
  StoresTable,
  GlobalFilterBar,
  EMPTY_FILTERS,
  type HubFilters,
} from "@/components/media-buying/hub-panels";
import { StoreDeepDive } from "@/components/media-buying/hub-store-deepdive";

export default function MediaBuyingHubPage() {
  const [hub, setHub] = useState<HubResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<HubFilters>(EMPTY_FILTERS);
  const [deepDiveOrgId, setDeepDiveOrgId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/media-buying/hub");
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Failed to load hub");
        return;
      }
      setHub(data as HubResponse);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openStore = useCallback((orgId: string) => setDeepDiveOrgId(orgId), []);
  const closeStore = useCallback(() => setDeepDiveOrgId(null), []);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Media Buying Hub</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Agency-wide view — zones, benchmarks and week-over-week movement across every configured
          store. Unconfigured stores are hidden here; fill them in on{" "}
          <a href="/paid-ads/store-settings" className="underline decoration-dotted">
            Store Settings
          </a>
          .
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

          {/* 1. Company-wide */}
          <CompanyOverviewCard hub={hub} filters={filters} />

          {/* 2. Per department */}
          <DepartmentBreakdown hub={hub} filters={filters} />

          {/* 3. Per media buyer */}
          <BuyerScorecard hub={hub} filters={filters} />

          {/* Zone drilldown + actionable panels */}
          <ZoneOverview hub={hub} filters={filters} onStoreClick={openStore} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ExceptionsPanel hub={hub} onStoreClick={openStore} />
            <MoversPanel hub={hub} onStoreClick={openStore} />
          </div>

          <StoresTable hub={hub} filters={filters} onStoreClick={openStore} />
        </>
      )}

      {hub && deepDiveOrgId && (
        <StoreDeepDive orgId={deepDiveOrgId} hub={hub} onClose={closeStore} />
      )}
    </div>
  );
}
