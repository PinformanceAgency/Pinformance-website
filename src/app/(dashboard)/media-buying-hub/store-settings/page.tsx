"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useOrg } from "@/hooks/use-org";
import { StoreSettingsTable } from "@/components/media-buying/store-settings-table";
import type {
  StoreSettings,
  StoreSettingsRow,
} from "@/lib/media-buying/store-settings-types";

export default function StoreSettingsPage() {
  const { isAgencyAdmin, loading: orgLoading } = useOrg();
  const [rows, setRows] = useState<StoreSettingsRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/media-buying/store-settings");
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Failed to load stores");
        return;
      }
      setRows(data.stores as StoreSettingsRow[]);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function handleRowSaved(orgId: string, updated: StoreSettings) {
    setRows((prev) => {
      if (!prev) return prev;
      return prev.map((r) => {
        if (r.org_id !== orgId) return r;
        const configured =
          updated.department != null && updated.breakeven_roas != null;
        return { ...r, settings: updated, configured };
      });
    });
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Store Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Per-store metadata for the Media Buying Hub — department, niche,
          country, media buyer, and breakeven ROAS. Every connected Pinterest
          store shows up here automatically; anything not fully configured is
          excluded from the zone engine and benchmarks.
        </p>
      </header>

      {(orgLoading || rows === null) && !error && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading stores…
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {rows && !error && (
        <StoreSettingsTable
          rows={rows}
          canEdit={!!isAgencyAdmin}
          onRowSaved={handleRowSaved}
        />
      )}
    </div>
  );
}
