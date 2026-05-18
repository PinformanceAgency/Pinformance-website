"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, Loader2, X, BarChart2, Hash } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DateRangePicker,
  presetToRange,
  type DateRange,
} from "@/components/shared/date-range-picker";
import {
  ConversionSettings,
  CONVERSION_WINDOWS,
  type ConversionWindow,
} from "@/components/shared/conversion-settings";

type ViewMode = "numbers" | "chart" | "both";

interface DimensionOption {
  key: string;
  title: string;
  description: string;
}

const CAMPAIGN_DIMS: DimensionOption[] = [
  { key: "country", title: "Per Country", description: "US, NL, BE, AU, DE, …" },
  { key: "catalog", title: "Catalog vs Non-catalog", description: "CAT vs non-CAT campaigns." },
  {
    key: "performancePlus",
    title: "Performance+ vs Non-Performance+",
    description: "Pinterest automation (P+) vs manually structured (NP+).",
  },
  {
    key: "funnel",
    title: "Prospecting vs Retargeting",
    description: "PROSP (cold) vs RET (warm) audiences.",
  },
  {
    key: "strategy",
    title: "Test / Hero / Category",
    description: "TEST = testing. HERO = scaled winners. CATG = category-focused.",
  },
  {
    key: "objective",
    title: "Conversion vs ROAS",
    description: "CONV = conversion count. ROAS = value-based objective.",
  },
];

const AD_GROUP_DIMS: DimensionOption[] = [
  { key: "gender", title: "Per Gender", description: "F / M / All genders." },
  { key: "age", title: "Per Age Bucket", description: "18-24, 25-34, 18+, …" },
  {
    key: "audience",
    title: "Per Audience",
    description: "Broad, ATC_L180, Eng_L90, ACL_1-5, …",
  },
  {
    key: "funnel",
    title: "Prospecting vs Retargeting",
    description: "When the ad-group name carries PROSP / RET.",
  },
  {
    key: "category",
    title: "Per Category / Product Scope",
    description: "Swim, Bra, BestSellers, Mixed, …",
  },
];

const AD_DIMS: DimensionOption[] = [
  {
    key: "format",
    title: "Per Format",
    description: "Video / Static / Carousel / Collection.",
  },
  {
    key: "contentType",
    title: "Organic-style vs Ad-style",
    description: "Organic-shot creative vs ad-first creative.",
  },
  {
    key: "creatorType",
    title: "Per Creator Type",
    description: "UGC, Shoot, Graphic, Founder, Influencer, Brand.",
  },
  { key: "category", title: "Per Category", description: "Swim, PushUpBra, Shapewear, …" },
  { key: "offer", title: "Per Offer", description: "BAU, 2FOR1, 20OFF, BOGO, Bundle." },
  {
    key: "lpType",
    title: "Per Landing Page Type",
    description: "/product, /collection, /page.",
  },
];

interface CreateReportModalProps {
  defaults: { dateRange: DateRange; conversionWindow: ConversionWindow };
  onClose: () => void;
}

export function CreateReportModal({ defaults, onClose }: CreateReportModalProps) {
  const [dateRange, setDateRange] = useState<DateRange>(defaults.dateRange);
  const [conversionWindow, setConversionWindow] = useState<ConversionWindow>(
    defaults.conversionWindow
  );
  const [reportName, setReportName] = useState<string>(
    `Media Buying Report — ${defaults.dateRange.start} to ${defaults.dateRange.end}`
  );
  const [reportNameTouched, setReportNameTouched] = useState(false);

  // Section toggles
  const [overviewKpis, setOverviewKpis] = useState(true);
  const [overviewLandingPages, setOverviewLandingPages] = useState(true);

  // Per-dimension state — keys mapped to { enabled, viewMode }
  const [campaignDims, setCampaignDims] = useState<
    Record<string, { enabled: boolean; viewMode: ViewMode }>
  >(() => initDims(CAMPAIGN_DIMS));
  const [adGroupDims, setAdGroupDims] = useState<
    Record<string, { enabled: boolean; viewMode: ViewMode }>
  >(() => initDims(AD_GROUP_DIMS));
  const [adDims, setAdDims] = useState<
    Record<string, { enabled: boolean; viewMode: ViewMode }>
  >(() => initDims(AD_DIMS));

  // Top ads table on Ad Level
  const [topAdsCount, setTopAdsCount] = useState<number>(10);
  const [topAdsSort, setTopAdsSort] = useState<"spend" | "roas" | "revenue" | "conversions">(
    "spend"
  );

  const [notes, setNotes] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function initDims(dims: DimensionOption[]): Record<
    string,
    { enabled: boolean; viewMode: ViewMode }
  > {
    const out: Record<string, { enabled: boolean; viewMode: ViewMode }> = {};
    for (const d of dims) out[d.key] = { enabled: true, viewMode: "numbers" };
    return out;
  }

  useEffect(() => {
    if (reportNameTouched) return;
    setReportName(`Media Buying Report — ${dateRange.start} to ${dateRange.end}`);
  }, [dateRange.start, dateRange.end, reportNameTouched]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !generating) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, generating]);

  const hasAnythingChecked = useMemo(() => {
    if (overviewKpis || overviewLandingPages) return true;
    if (Object.values(campaignDims).some((d) => d.enabled)) return true;
    if (Object.values(adGroupDims).some((d) => d.enabled)) return true;
    if (Object.values(adDims).some((d) => d.enabled)) return true;
    if (topAdsCount > 0) return true;
    return false;
  }, [overviewKpis, overviewLandingPages, campaignDims, adGroupDims, adDims, topAdsCount]);

  async function generate() {
    setError(null);
    setGenerating(true);
    try {
      const cw = CONVERSION_WINDOWS.find((w) => w.key === conversionWindow)!;
      const enabledDims = (
        s: Record<string, { enabled: boolean; viewMode: ViewMode }>
      ) =>
        Object.entries(s)
          .filter(([, v]) => v.enabled)
          .map(([key, v]) => ({ key, viewMode: v.viewMode }));

      const sections: Record<string, unknown> = {};
      if (overviewKpis || overviewLandingPages) {
        sections.overview = {
          kpis: overviewKpis,
          landingPages: overviewLandingPages,
        };
      }
      const campDims = enabledDims(campaignDims);
      if (campDims.length > 0) sections.campaignLevel = { dimensions: campDims };
      const agDims = enabledDims(adGroupDims);
      if (agDims.length > 0) sections.adGroupLevel = { dimensions: agDims };
      const adsDimsList = enabledDims(adDims);
      if (adsDimsList.length > 0 || topAdsCount > 0) {
        const adLevel: Record<string, unknown> = { dimensions: adsDimsList };
        if (topAdsCount > 0) {
          adLevel.topAds = { count: topAdsCount, sortKey: topAdsSort };
        }
        sections.adLevel = adLevel;
      }

      const res = await fetch("/api/pinterest/media-buying/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start_date: dateRange.start,
          end_date: dateRange.end,
          click_window: cw.click,
          view_window: cw.view,
          report_name: reportName.trim(),
          notes,
          sections,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] || "Media-Buying-Report.docx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={() => !generating && onClose()}
    >
      <div
        className="bg-card border border-border rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-card z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold">Create Media Buying Report</h2>
              <p className="text-xs text-muted-foreground">
                Custom .docx report — pick which sections and dimensions to include.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={generating}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-muted text-muted-foreground disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Report name */}
          <div>
            <div className="text-xs font-medium text-foreground mb-1.5">Report name</div>
            <input
              type="text"
              value={reportName}
              onChange={(e) => {
                setReportName(e.target.value);
                setReportNameTouched(true);
              }}
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          {/* Period */}
          <div className="border-t border-border pt-4">
            <div className="text-xs font-medium text-foreground mb-2">Period</div>
            <div className="flex items-center gap-2 flex-wrap">
              <DateRangePicker value={dateRange} onChange={setDateRange} align="left" />
              <ConversionSettings
                value={conversionWindow}
                onChange={setConversionWindow}
              />
            </div>
          </div>

          {/* Account Overview */}
          <div className="border-t border-border pt-4">
            <div className="text-sm font-semibold mb-3">Account Overview</div>
            <div className="space-y-2">
              <CheckboxRow
                checked={overviewKpis}
                onChange={setOverviewKpis}
                label="KPI strip"
                description="Spend, Revenue, Conversions, ROAS, CPA + previous-period deltas."
              />
              <CheckboxRow
                checked={overviewLandingPages}
                onChange={setOverviewLandingPages}
                label="Landing Page Performance"
                description="All landing pages your ads point to in this period, with totals."
              />
            </div>
          </div>

          {/* Campaign Level */}
          <DimensionGroup
            title="Campaign Level"
            options={CAMPAIGN_DIMS}
            state={campaignDims}
            setState={setCampaignDims}
          />

          {/* Ad Group Level */}
          <DimensionGroup
            title="Ad Group Level"
            options={AD_GROUP_DIMS}
            state={adGroupDims}
            setState={setAdGroupDims}
          />

          {/* Ad Level */}
          <DimensionGroup
            title="Ad Level"
            options={AD_DIMS}
            state={adDims}
            setState={setAdDims}
          />

          {/* Top ads table */}
          <div className="border-t border-border pt-4">
            <div className="text-sm font-semibold mb-2">Top Ads table (Ad Level)</div>
            <p className="text-xs text-muted-foreground mb-3">
              Optional ranked-ads table at the start of the Ad Level section. Set count to 0
              to omit.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[11px] text-muted-foreground mb-1.5">Count</div>
                <select
                  value={topAdsCount}
                  onChange={(e) => setTopAdsCount(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  {[0, 5, 10, 15, 20, 25, 50].map((n) => (
                    <option key={n} value={n}>
                      {n === 0 ? "Omit table" : `${n} ads`}
                    </option>
                  ))}
                </select>
              </div>
              <div className={topAdsCount === 0 ? "opacity-40 pointer-events-none" : ""}>
                <div className="text-[11px] text-muted-foreground mb-1.5">Rank by</div>
                <select
                  value={topAdsSort}
                  onChange={(e) =>
                    setTopAdsSort(e.target.value as typeof topAdsSort)
                  }
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <option value="spend">Spend</option>
                  <option value="revenue">Revenue</option>
                  <option value="conversions">Conversions</option>
                  <option value="roas">ROAS</option>
                </select>
              </div>
            </div>
          </div>

          {/* Notes — Recommendation for Clients */}
          <div className="border-t border-border pt-4">
            <div className="text-sm font-semibold mb-1.5">Recommendation for Clients</div>
            <p className="text-xs text-muted-foreground mb-2">
              Free-form notes added at the end of the document — what worked, what's next, any
              context Pinterest doesn't capture.
            </p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Push+ scaling looked great this period — recommend doubling budget on US Hero ROAS. Pause the AU TEST campaign, ROAS hasn't recovered after 14 days."
              rows={6}
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground resize-y focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          {/* Chart-in-doc heads-up */}
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-800">
            <strong>Note:</strong> Per-dimension Chart / Both views currently render the same
            data as the Numbers table — server-side chart-image rendering is coming in a
            follow-up. Your view-mode preference is saved with the report and will switch on
            when chart rendering ships.
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-700 dark:text-red-400">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-5 border-t border-border sticky bottom-0 bg-card">
          <button
            onClick={onClose}
            disabled={generating}
            className="px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-card hover:bg-muted transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={generate}
            disabled={generating || !hasAnythingChecked}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {generating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {generating ? "Generating…" : "Generate report"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CheckboxRow({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (b: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer p-2 -m-2 rounded hover:bg-muted/30 transition-colors">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 w-4 h-4 rounded border-border accent-primary cursor-pointer"
      />
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground">{label}</div>
        {description && (
          <div className="text-[11px] text-muted-foreground mt-0.5">{description}</div>
        )}
      </div>
    </label>
  );
}

function DimensionGroup({
  title,
  options,
  state,
  setState,
}: {
  title: string;
  options: DimensionOption[];
  state: Record<string, { enabled: boolean; viewMode: ViewMode }>;
  setState: React.Dispatch<
    React.SetStateAction<Record<string, { enabled: boolean; viewMode: ViewMode }>>
  >;
}) {
  const allOn = options.every((o) => state[o.key]?.enabled);
  const noneOn = options.every((o) => !state[o.key]?.enabled);
  function toggleAll() {
    setState((prev) => {
      const next = { ...prev };
      const target = !allOn;
      for (const o of options) next[o.key] = { ...next[o.key], enabled: target };
      return next;
    });
  }
  function toggleOne(key: string) {
    setState((prev) => ({
      ...prev,
      [key]: { ...prev[key], enabled: !prev[key]?.enabled },
    }));
  }
  function setMode(key: string, mode: ViewMode) {
    setState((prev) => ({
      ...prev,
      [key]: { ...prev[key], viewMode: mode },
    }));
  }
  return (
    <div className="border-t border-border pt-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold">{title}</div>
        <button
          onClick={toggleAll}
          className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
        >
          {allOn ? "Uncheck all" : noneOn ? "Check all" : "Check all"}
        </button>
      </div>
      <div className="space-y-1.5">
        {options.map((o) => {
          const s = state[o.key];
          const enabled = !!s?.enabled;
          return (
            <div
              key={o.key}
              className={cn(
                "flex items-center gap-3 p-2 rounded transition-colors",
                enabled ? "bg-muted/20" : "opacity-60"
              )}
            >
              <input
                type="checkbox"
                checked={enabled}
                onChange={() => toggleOne(o.key)}
                className="w-4 h-4 rounded border-border accent-primary cursor-pointer flex-shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-foreground">{o.title}</div>
                <div className="text-[11px] text-muted-foreground">{o.description}</div>
              </div>
              <div
                className={cn(
                  "inline-flex items-center rounded-md border border-border bg-card overflow-hidden flex-shrink-0",
                  !enabled && "opacity-40 pointer-events-none"
                )}
              >
                <ViewModeButton
                  active={s?.viewMode === "numbers"}
                  onClick={() => setMode(o.key, "numbers")}
                  icon={<Hash className="w-3 h-3" />}
                  label="N"
                  title="Numbers only"
                />
                <ViewModeButton
                  active={s?.viewMode === "chart"}
                  onClick={() => setMode(o.key, "chart")}
                  icon={<BarChart2 className="w-3 h-3" />}
                  label="C"
                  title="Chart only"
                />
                <ViewModeButton
                  active={s?.viewMode === "both"}
                  onClick={() => setMode(o.key, "both")}
                  icon={null}
                  label="N+C"
                  title="Numbers + Chart"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ViewModeButton({
  active,
  onClick,
  icon,
  label,
  title,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted"
      )}
    >
      {icon}
      {label}
    </button>
  );
}
