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

export default function ZonesPage() {
  const { hub, error } = useHubData();
  const [filters, setFilters] = useState<HubFilters>(EMPTY_FILTERS);
  const [deepDiveOrgId, setDeepDiveOrgId] = useState<string | null>(null);
  const openStore = useCallback((orgId: string) => setDeepDiveOrgId(orgId), []);
  const closeStore = useCallback(() => setDeepDiveOrgId(null), []);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Zones</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Red / orange / green at company, department and media-buyer level — with the
          last four weeks side by side so you can see which weeks flipped and which held.
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
          <ZoneBlocksSection hub={hub} filters={filters} onStoreClick={openStore} />
        </>
      )}

      {hub && deepDiveOrgId && (
        <StoreDeepDive orgId={deepDiveOrgId} hub={hub} onClose={closeStore} />
      )}
    </div>
  );
}
