"use client";

import { useMemo, useState } from "react";
import { Search, Pencil, AlertCircle, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DEPARTMENTS,
  DEPARTMENT_LABELS,
  COUNTRY_OPTIONS,
} from "@/lib/media-buying/config";
import type {
  StoreSettings,
  StoreSettingsRow,
} from "@/lib/media-buying/store-settings-types";
import { StoreSettingsModal } from "./store-settings-modal";

interface Props {
  rows: StoreSettingsRow[];
  canEdit: boolean;
  onRowSaved: (orgId: string, updated: StoreSettings) => void;
}

type SortKey = "name" | "department" | "country" | "buyer" | "ber" | "status";

const COUNTRY_LABEL: Record<string, string> = COUNTRY_OPTIONS.reduce(
  (acc, c) => ({ ...acc, [c.code]: c.label }),
  {}
);

export function StoreSettingsTable({ rows, canEdit, onRowSaved }: Props) {
  const [query, setQuery] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState<string>("");
  const [countryFilter, setCountryFilter] = useState<string>("");
  const [buyerFilter, setBuyerFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<
    "" | "needs_setup" | "configured" | "inactive"
  >("");
  const [sortKey, setSortKey] = useState<SortKey>("status");
  const [editing, setEditing] = useState<StoreSettingsRow | null>(null);

  const buyerSuggestions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      if (r.settings?.media_buyer) set.add(r.settings.media_buyer);
    }
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !r.store_name.toLowerCase().includes(q)) return false;
      if (departmentFilter && r.settings?.department !== departmentFilter) return false;
      if (countryFilter && r.settings?.country !== countryFilter) return false;
      if (buyerFilter && r.settings?.media_buyer !== buyerFilter) return false;
      if (statusFilter === "needs_setup" && r.configured) return false;
      if (statusFilter === "configured" && !r.configured) return false;
      if (statusFilter === "inactive" && r.settings?.is_active !== false) return false;
      return true;
    });
  }, [rows, query, departmentFilter, countryFilter, buyerFilter, statusFilter]);

  const sorted = useMemo(() => {
    const out = [...filtered];
    // "status" sort puts needs-setup rows first, then everything else.
    out.sort((a, b) => {
      if (sortKey === "status") {
        // Needs-setup rows first (spec §1.3), then inactive, then configured.
        const rank = (r: StoreSettingsRow) => {
          if (!r.configured) return 0;
          if (r.settings?.is_active === false) return 2;
          return 1;
        };
        const ra = rank(a);
        const rb = rank(b);
        if (ra !== rb) return ra - rb;
        return a.store_name.localeCompare(b.store_name);
      }
      const getVal = (r: StoreSettingsRow): string | number => {
        switch (sortKey) {
          case "name":
            return r.store_name.toLowerCase();
          case "department":
            return r.settings?.department ?? "";
          case "country":
            return r.settings?.country ?? "";
          case "buyer":
            return r.settings?.media_buyer ?? "";
          case "ber":
            return r.settings?.breakeven_roas ?? -1;
        }
      };
      const av = getVal(a);
      const bv = getVal(b);
      if (typeof av === "number" && typeof bv === "number") return bv - av;
      return String(av).localeCompare(String(bv));
    });
    return out;
  }, [filtered, sortKey]);

  const needsSetupCount = rows.filter((r) => !r.configured).length;

  return (
    <>
      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search store…"
            className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 w-56"
          />
        </div>
        <select
          value={departmentFilter}
          onChange={(e) => setDepartmentFilter(e.target.value)}
          className="text-xs rounded-lg border border-border bg-card px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          <option value="">All departments</option>
          {DEPARTMENTS.map((d) => (
            <option key={d} value={d}>
              {DEPARTMENT_LABELS[d]}
            </option>
          ))}
        </select>
        <select
          value={countryFilter}
          onChange={(e) => setCountryFilter(e.target.value)}
          className="text-xs rounded-lg border border-border bg-card px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          <option value="">All countries</option>
          {COUNTRY_OPTIONS.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </select>
        <select
          value={buyerFilter}
          onChange={(e) => setBuyerFilter(e.target.value)}
          className="text-xs rounded-lg border border-border bg-card px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          <option value="">All buyers</option>
          {buyerSuggestions.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="text-xs rounded-lg border border-border bg-card px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          <option value="">All statuses</option>
          <option value="needs_setup">Needs setup</option>
          <option value="configured">Configured</option>
          <option value="inactive">Inactive</option>
        </select>
        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <span>Sort:</span>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="text-xs rounded-lg border border-border bg-card px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="status">Status (needs-setup first)</option>
            <option value="name">Store name (A → Z)</option>
            <option value="department">Department</option>
            <option value="country">Country</option>
            <option value="buyer">Media buyer</option>
            <option value="ber">Breakeven ROAS (high → low)</option>
          </select>
        </div>
      </div>

      {/* Needs-setup banner */}
      {needsSetupCount > 0 && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>
            <strong>{needsSetupCount}</strong>{" "}
            {needsSetupCount === 1 ? "store still needs" : "stores still need"} setup.
            They&apos;re excluded from the zone engine and benchmarks until{" "}
            department and breakeven ROAS are filled in.
          </span>
        </div>
      )}

      {/* Table */}
      <section className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-muted-foreground">
              <tr>
                <Th onClick={() => setSortKey("name")}>Store</Th>
                <Th onClick={() => setSortKey("department")}>Department</Th>
                <th className="text-left font-medium px-3 py-2">Niche</th>
                <Th onClick={() => setSortKey("country")}>Country</Th>
                <Th onClick={() => setSortKey("buyer")}>Media buyer</Th>
                <Th onClick={() => setSortKey("ber")} align="right">
                  BER
                </Th>
                <Th onClick={() => setSortKey("status")}>Status</Th>
                {canEdit && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr>
                  <td
                    colSpan={canEdit ? 8 : 7}
                    className="px-3 py-8 text-center text-muted-foreground"
                  >
                    No stores match these filters.
                  </td>
                </tr>
              )}
              {sorted.map((r) => {
                const s = r.settings;
                const inactive = s?.is_active === false;
                return (
                  <tr
                    key={r.org_id}
                    className={cn(
                      "border-b border-border/60 last:border-b-0",
                      inactive && "opacity-60"
                    )}
                  >
                    <td className="px-3 py-2 font-medium">{r.store_name}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {s?.department ? DEPARTMENT_LABELS[s.department] : "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {s?.niche ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {s?.country ? COUNTRY_LABEL[s.country] ?? s.country : "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {s?.media_buyer ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {s?.breakeven_roas != null
                        ? `${Number(s.breakeven_roas).toFixed(2)}x`
                        : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge configured={r.configured} inactive={inactive} />
                    </td>
                    {canEdit && (
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => setEditing(r)}
                          className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs hover:bg-muted"
                        >
                          <Pencil className="w-3 h-3" />
                          Edit
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {editing && (
        <StoreSettingsModal
          store={editing}
          buyerSuggestions={buyerSuggestions}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            onRowSaved(editing.org_id, updated);
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

function Th({
  children,
  onClick,
  align = "left",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  align?: "left" | "right";
}) {
  return (
    <th
      className={cn(
        "font-medium px-3 py-2",
        align === "right" ? "text-right" : "text-left",
        onClick && "cursor-pointer hover:text-foreground"
      )}
      onClick={onClick}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {onClick && <ArrowUpDown className="w-3 h-3 opacity-50" />}
      </span>
    </th>
  );
}

function StatusBadge({
  configured,
  inactive,
}: {
  configured: boolean;
  inactive: boolean;
}) {
  if (inactive) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
        Inactive
      </span>
    );
  }
  if (!configured) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
        Needs setup
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
      Configured
    </span>
  );
}
