"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Loader2 } from "lucide-react";
import {
  DEPARTMENTS,
  DEPARTMENT_LABELS,
  NICHE_SUGGESTIONS,
  COUNTRY_OPTIONS,
  DEFAULT_ZONE_THRESHOLDS,
  DEFAULT_GREEN_REVENUE_WEEKLY_FLOOR,
  DEFAULT_ATTRIBUTION_SETTING,
  ATTRIBUTION_OPTIONS,
  type AttributionWindow,
  type Department,
} from "@/lib/media-buying/config";
import type {
  StoreSettings,
  StoreSettingsRow,
  StoreSettingsUpsertInput,
} from "@/lib/media-buying/store-settings-types";

interface Props {
  store: StoreSettingsRow;
  buyerSuggestions: string[];
  onClose: () => void;
  onSaved: (updated: StoreSettings) => void;
}

export function StoreSettingsModal({
  store,
  buyerSuggestions,
  onClose,
  onSaved,
}: Props) {
  const s = store.settings;
  const [department, setDepartment] = useState<Department | "">(s?.department ?? "");
  const [niche, setNiche] = useState(s?.niche ?? "");
  const [country, setCountry] = useState(s?.country ?? "");
  const [mediaBuyer, setMediaBuyer] = useState(s?.media_buyer ?? "");
  const [breakevenRoas, setBreakevenRoas] = useState<string>(
    s?.breakeven_roas != null ? String(s.breakeven_roas) : ""
  );
  const [invoiceRoas, setInvoiceRoas] = useState<string>(
    s?.invoice_roas != null ? String(s.invoice_roas) : ""
  );
  const [attribution, setAttribution] = useState<AttributionWindow>(
    (s?.attribution_setting as AttributionWindow) ?? DEFAULT_ATTRIBUTION_SETTING
  );
  const [minWeeklyRevenue, setMinWeeklyRevenue] = useState<string>(
    s?.zone_thresholds?.min_weekly_revenue != null
      ? String(s.zone_thresholds.min_weekly_revenue)
      : ""
  );
  const [greenRatio, setGreenRatio] = useState<string>(
    s?.zone_thresholds?.green_ratio != null ? String(s.zone_thresholds.green_ratio) : ""
  );
  const [isActive, setIsActive] = useState<boolean>(s?.is_active ?? true);
  const [notes, setNotes] = useState(s?.notes ?? "");
  const [showAdvanced, setShowAdvanced] = useState(
    s?.zone_thresholds?.green_ratio != null ||
      s?.zone_thresholds?.min_weekly_revenue != null
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dismiss on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const berNumber = useMemo(() => {
    if (breakevenRoas === "") return null;
    const n = Number(breakevenRoas);
    return isFinite(n) && n > 0 ? n : NaN;
  }, [breakevenRoas]);
  const invoiceRoasNumber = useMemo(() => {
    if (invoiceRoas === "") return null;
    const n = Number(invoiceRoas);
    return isFinite(n) && n > 0 ? n : NaN;
  }, [invoiceRoas]);

  const canSave =
    department !== "" &&
    berNumber !== null &&
    !Number.isNaN(berNumber) &&
    (invoiceRoasNumber === null || !Number.isNaN(invoiceRoasNumber));

  async function handleSave() {
    setSaving(true);
    setError(null);
    // Build the payload — only send zone_thresholds when the advanced section
    // was actually filled; otherwise clear to null so the store falls back to
    // the global default.
    const payload: StoreSettingsUpsertInput = {
      department: department === "" ? null : department,
      niche: niche.trim() || null,
      country: country || null,
      media_buyer: mediaBuyer.trim() || null,
      breakeven_roas: berNumber,
      invoice_roas: invoiceRoasNumber,
      attribution_setting: attribution,
      is_active: isActive,
      notes: notes.trim() || null,
    };
    const hasGreenRatio = greenRatio.trim() !== "";
    const hasMinWeeklyRev = minWeeklyRevenue.trim() !== "";
    if (hasGreenRatio || hasMinWeeklyRev) {
      const overrides: Partial<import("@/lib/media-buying/config").ZoneThresholds> = {};
      if (hasGreenRatio) {
        const g = Number(greenRatio);
        if (!(isFinite(g) && g > 1)) {
          setError("Green fallback ratio must be > 1.");
          setSaving(false);
          return;
        }
        overrides.green_ratio = g;
      }
      if (hasMinWeeklyRev) {
        const r = Number(minWeeklyRevenue);
        if (!(isFinite(r) && r >= 0)) {
          setError("Minimum weekly revenue must be a non-negative number.");
          setSaving(false);
          return;
        }
        overrides.min_weekly_revenue = r;
      }
      payload.zone_thresholds = overrides;
    } else {
      payload.zone_thresholds = null;
    }

    try {
      const res = await fetch(
        `/api/media-buying/store-settings/${store.org_id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Save failed");
        setSaving(false);
        return;
      }
      onSaved(data.settings as StoreSettings);
    } catch (e) {
      setError(String(e));
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-2xl bg-card border border-border shadow-2xl">
        <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-border bg-card px-5 py-4">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Store settings
            </div>
            <h2 className="text-lg font-semibold mt-0.5">{store.store_name}</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Required fields */}
          <div>
            <label className="text-xs font-medium text-foreground">
              Department <span className="text-primary">*</span>
            </label>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value as Department | "")}
              className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <option value="">— Select department —</option>
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {DEPARTMENT_LABELS[d]}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-foreground">
                Breakeven ROAS <span className="text-primary">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={breakevenRoas}
                onChange={(e) => setBreakevenRoas(e.target.value)}
                placeholder="e.g. 2.5"
                className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                ROAS below this &rarr; <strong>red</strong> (losing money).
              </p>
            </div>
            <div>
              <label className="text-xs font-medium text-foreground">Invoice ROAS</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={invoiceRoas}
                onChange={(e) => setInvoiceRoas(e.target.value)}
                placeholder="e.g. 3.5"
                className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                ROAS at &ge; this <em>and</em> &ge; €
                {DEFAULT_GREEN_REVENUE_WEEKLY_FLOOR.toLocaleString("en-US")} weekly
                revenue &rarr; <strong>green</strong>. Leave empty to fall back to
                BER &times; green ratio.
              </p>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-foreground">
              Pinterest attribution setting
            </label>
            <select
              value={attribution}
              onChange={(e) => setAttribution(e.target.value as AttributionWindow)}
              className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              {ATTRIBUTION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.value} — {o.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Click / view window used when this store&apos;s numbers are pulled from
              Pinterest. Change if this store reports on a non-default window in
              Campaign Manager.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-foreground">Niche</label>
              <input
                type="text"
                list="niche-suggestions"
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                placeholder="home, beauty, …"
                className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <datalist id="niche-suggestions">
                {NICHE_SUGGESTIONS.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="text-xs font-medium text-foreground">Country</label>
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <option value="">— Select —</option>
                {COUNTRY_OPTIONS.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-foreground">Media buyer</label>
            <input
              type="text"
              list="buyer-suggestions"
              value={mediaBuyer}
              onChange={(e) => setMediaBuyer(e.target.value)}
              placeholder="Full name"
              className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <datalist id="buyer-suggestions">
              {buyerSuggestions.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="rounded border-border"
              />
              <span className="text-xs font-medium">Active in management</span>
            </label>
          </div>

          <div>
            <label className="text-xs font-medium text-foreground">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Client context, arrangements, quirks…"
              className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          {/* Advanced: per-store zone override */}
          <div className="border-t border-border pt-3">
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              {showAdvanced ? "▾" : "▸"} Advanced — zone thresholds override
            </button>
            {showAdvanced && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-medium text-foreground">
                    Min weekly revenue (green gate)
                  </label>
                  <input
                    type="number"
                    step="100"
                    min="0"
                    value={minWeeklyRevenue}
                    onChange={(e) => setMinWeeklyRevenue(e.target.value)}
                    placeholder={String(DEFAULT_GREEN_REVENUE_WEEKLY_FLOOR)}
                    className="mt-1 w-full rounded-lg border border-border bg-card px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-foreground">
                    Green fallback ratio (BER ×)
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    min="1.01"
                    value={greenRatio}
                    onChange={(e) => setGreenRatio(e.target.value)}
                    placeholder={String(DEFAULT_ZONE_THRESHOLDS.green_ratio)}
                    className="mt-1 w-full rounded-lg border border-border bg-card px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
                <p className="col-span-2 text-[11px] text-muted-foreground">
                  <strong>Min weekly revenue</strong> — override the default €
                  {DEFAULT_GREEN_REVENUE_WEEKLY_FLOOR.toLocaleString("en-US")} scale
                  gate. <strong>Green fallback ratio</strong> — only used when
                  Invoice ROAS is empty (green target ≈ BER × ratio; default{" "}
                  {DEFAULT_ZONE_THRESHOLDS.green_ratio}).
                </p>
              </div>
            )}
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
              {error}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-border bg-card px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave || saving}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
