"use client";

import { useCallback, useEffect, useState } from "react";
import type { HubResponse } from "@/lib/media-buying/hub-types";

/** Shared hub-fetch hook used by every Media Buying Hub sub-page (Analytic
 *  Overview, Zones, Critical Attention). Keeps the fetch in one place so
 *  each page stays focused on rendering. */
export function useHubData() {
  const [hub, setHub] = useState<HubResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return { hub, error, reload: load };
}
