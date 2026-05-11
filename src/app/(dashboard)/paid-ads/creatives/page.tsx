"use client";

import { useMemo, useState } from "react";
import { Sparkles, TrendingUp, Rocket, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

type TimeFrame = "7" | "14" | "30";
type RecentLimit = 5 | 10 | 15;
type SortDir = "asc" | "desc";

interface PaidPinRow {
  pin_id: string;
  title: string;
  image_url: string;
  launched_at: string;
  spend: number;
  revenue: number;
  purchases: number;
}

function computeMetrics(row: PaidPinRow) {
  const roas = row.spend > 0 ? row.revenue / row.spend : 0;
  const cpa = row.purchases > 0 ? row.spend / row.purchases : 0;
  return { roas, cpa };
}

// Placeholder data — to be replaced with Pinterest Ads API once connected.
const MOCK_TOP_PINS: Record<TimeFrame, PaidPinRow[]> = {
  "7": [
    { pin_id: "p1", title: "Cozy autumn living room", image_url: "", launched_at: "2026-05-04", spend: 412.50, revenue: 3120.00, purchases: 48 },
    { pin_id: "p2", title: "Minimal nordic bedroom decor", image_url: "", launched_at: "2026-05-05", spend: 289.10, revenue: 2065.00, purchases: 31 },
    { pin_id: "p3", title: "Boho kitchen styling tips", image_url: "", launched_at: "2026-05-06", spend: 510.20, revenue: 3210.00, purchases: 52 },
    { pin_id: "p4", title: "Outdoor patio inspiration", image_url: "", launched_at: "2026-05-02", spend: 175.40, revenue: 980.00, purchases: 16 },
    { pin_id: "p5", title: "DIY shelf organisation hack", image_url: "", launched_at: "2026-05-07", spend: 320.00, revenue: 1830.00, purchases: 27 },
    { pin_id: "p6", title: "Modern home office setup", image_url: "", launched_at: "2026-05-08", spend: 220.75, revenue: 1190.00, purchases: 18 },
    { pin_id: "p7", title: "Pastel nursery ideas", image_url: "", launched_at: "2026-05-03", spend: 142.00, revenue: 695.00, purchases: 11 },
    { pin_id: "p8", title: "Cottage core bedroom mood", image_url: "", launched_at: "2026-05-04", spend: 390.00, revenue: 1755.00, purchases: 24 },
    { pin_id: "p9", title: "Wall gallery layout guide", image_url: "", launched_at: "2026-05-06", spend: 215.30, revenue: 940.00, purchases: 13 },
    { pin_id: "p10", title: "Velvet sofa styling", image_url: "", launched_at: "2026-05-09", spend: 480.00, revenue: 2040.00, purchases: 27 },
  ],
  "14": [
    { pin_id: "p11", title: "Statement mirror styling", image_url: "", launched_at: "2026-04-29", spend: 980.50, revenue: 7642.00, purchases: 108 },
    { pin_id: "p12", title: "Reading nook ideas", image_url: "", launched_at: "2026-04-30", spend: 612.30, revenue: 4358.00, purchases: 65 },
    { pin_id: "p13", title: "Earthy tone bedroom", image_url: "", launched_at: "2026-05-01", spend: 740.10, revenue: 4960.00, purchases: 76 },
    { pin_id: "p14", title: "Open shelf kitchen", image_url: "", launched_at: "2026-04-28", spend: 1120.00, revenue: 6720.00, purchases: 102 },
    { pin_id: "p15", title: "Linen bedding aesthetic", image_url: "", launched_at: "2026-05-02", spend: 388.40, revenue: 2235.00, purchases: 33 },
    { pin_id: "p16", title: "Plant corner inspiration", image_url: "", launched_at: "2026-05-03", spend: 540.00, revenue: 2916.00, purchases: 44 },
    { pin_id: "p17", title: "Tile backsplash ideas", image_url: "", launched_at: "2026-05-04", spend: 290.20, revenue: 1490.00, purchases: 21 },
    { pin_id: "p18", title: "Layered rug styling", image_url: "", launched_at: "2026-05-05", spend: 710.50, revenue: 3480.00, purchases: 49 },
    { pin_id: "p19", title: "Coastal grandma decor", image_url: "", launched_at: "2026-04-27", spend: 425.00, revenue: 1953.00, purchases: 28 },
    { pin_id: "p20", title: "Vintage dresser refresh", image_url: "", launched_at: "2026-05-01", spend: 612.00, revenue: 2630.00, purchases: 36 },
  ],
  "30": [
    { pin_id: "p21", title: "Statement mirror styling", image_url: "", launched_at: "2026-04-29", spend: 1820.50, revenue: 14620.00, purchases: 210 },
    { pin_id: "p22", title: "Reading nook ideas", image_url: "", launched_at: "2026-04-30", spend: 1240.30, revenue: 8990.00, purchases: 132 },
    { pin_id: "p23", title: "Earthy tone bedroom", image_url: "", launched_at: "2026-05-01", spend: 1485.10, revenue: 10120.00, purchases: 156 },
    { pin_id: "p24", title: "Open shelf kitchen", image_url: "", launched_at: "2026-04-28", spend: 2180.00, revenue: 13420.00, purchases: 198 },
    { pin_id: "p25", title: "Linen bedding aesthetic", image_url: "", launched_at: "2026-05-02", spend: 780.40, revenue: 4612.00, purchases: 68 },
    { pin_id: "p26", title: "Plant corner inspiration", image_url: "", launched_at: "2026-05-03", spend: 1180.00, revenue: 6420.00, purchases: 95 },
    { pin_id: "p27", title: "Tile backsplash ideas", image_url: "", launched_at: "2026-05-04", spend: 612.20, revenue: 3120.00, purchases: 45 },
    { pin_id: "p28", title: "Layered rug styling", image_url: "", launched_at: "2026-05-05", spend: 1450.50, revenue: 7180.00, purchases: 102 },
    { pin_id: "p29", title: "Coastal grandma decor", image_url: "", launched_at: "2026-04-27", spend: 920.00, revenue: 4280.00, purchases: 62 },
    { pin_id: "p30", title: "Vintage dresser refresh", image_url: "", launched_at: "2026-05-01", spend: 1280.00, revenue: 5760.00, purchases: 79 },
  ],
};

const MOCK_RECENT_PINS: PaidPinRow[] = [
  { pin_id: "r1", title: "Velvet sofa styling", image_url: "", launched_at: "2026-05-10", spend: 612.00, revenue: 1820.00, purchases: 24 },
  { pin_id: "r2", title: "Modern home office setup", image_url: "", launched_at: "2026-05-10", spend: 480.50, revenue: 2150.00, purchases: 31 },
  { pin_id: "r3", title: "DIY shelf organisation hack", image_url: "", launched_at: "2026-05-09", spend: 720.00, revenue: 3180.00, purchases: 48 },
  { pin_id: "r4", title: "Pastel nursery ideas", image_url: "", launched_at: "2026-05-09", spend: 295.30, revenue: 1240.00, purchases: 17 },
  { pin_id: "r5", title: "Outdoor patio inspiration", image_url: "", launched_at: "2026-05-08", spend: 540.20, revenue: 2980.00, purchases: 42 },
  { pin_id: "r6", title: "Boho kitchen styling tips", image_url: "", launched_at: "2026-05-08", spend: 820.00, revenue: 4310.00, purchases: 62 },
  { pin_id: "r7", title: "Cozy autumn living room", image_url: "", launched_at: "2026-05-07", spend: 412.50, revenue: 1690.00, purchases: 24 },
  { pin_id: "r8", title: "Minimal nordic bedroom decor", image_url: "", launched_at: "2026-05-07", spend: 380.00, revenue: 1820.00, purchases: 27 },
  { pin_id: "r9", title: "Cottage core bedroom mood", image_url: "", launched_at: "2026-05-06", spend: 670.00, revenue: 2410.00, purchases: 32 },
  { pin_id: "r10", title: "Wall gallery layout guide", image_url: "", launched_at: "2026-05-06", spend: 315.00, revenue: 1080.00, purchases: 14 },
  { pin_id: "r11", title: "Plant corner inspiration", image_url: "", launched_at: "2026-05-05", spend: 1180.00, revenue: 4920.00, purchases: 73 },
  { pin_id: "r12", title: "Layered rug styling", image_url: "", launched_at: "2026-05-05", spend: 220.40, revenue: 1180.00, purchases: 17 },
  { pin_id: "r13", title: "Earthy tone bedroom", image_url: "", launched_at: "2026-05-04", spend: 510.00, revenue: 2080.00, purchases: 28 },
  { pin_id: "r14", title: "Linen bedding aesthetic", image_url: "", launched_at: "2026-05-04", spend: 145.00, revenue: 612.00, purchases: 9 },
  { pin_id: "r15", title: "Tile backsplash ideas", image_url: "", launched_at: "2026-05-03", spend: 425.00, revenue: 1820.00, purchases: 26 },
];

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(n);
const fmtNum = (n: number) => new Intl.NumberFormat("en-US").format(n);
const fmtRoas = (n: number) => `${n.toFixed(2)}x`;

export default function PaidAdsCreativesPage() {
  const [timeFrame, setTimeFrame] = useState<TimeFrame>("30");
  const [recentLimit, setRecentLimit] = useState<RecentLimit>(10);
  const [recentSort, setRecentSort] = useState<SortDir>("desc");

  const topPins = useMemo(() => {
    return [...MOCK_TOP_PINS[timeFrame]]
      .map((p) => ({ ...p, ...computeMetrics(p) }))
      .sort((a, b) => b.roas - a.roas)
      .slice(0, 10);
  }, [timeFrame]);

  const recentPins = useMemo(() => {
    return [...MOCK_RECENT_PINS]
      .sort((a, b) => (recentSort === "desc" ? b.spend - a.spend : a.spend - b.spend))
      .slice(0, recentLimit)
      .map((p) => ({ ...p, ...computeMetrics(p) }));
  }, [recentLimit, recentSort]);

  return (
    <div className="max-w-6xl">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-[#E30613]/10 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-[#E30613]" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Paid Ads — Creatives</h1>
            <p className="text-sm text-white/50 mt-0.5">
              Track performance of pins running in paid Pinterest campaigns.
            </p>
          </div>
        </div>
      </div>

      {/* Top performing pins */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-white/60" />
            <h2 className="text-lg font-medium">Top performing pins</h2>
            <span className="text-xs text-white/40">— sorted by ROAS</span>
          </div>
          <TimeFrameToggle value={timeFrame} onChange={setTimeFrame} />
        </div>
        <PinPerformanceTable pins={topPins} />
      </section>

      {/* Recently launched */}
      <section>
        <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Rocket className="w-4 h-4 text-white/60" />
            <h2 className="text-lg font-medium">Recently launched</h2>
            <span className="text-xs text-white/40">— top spend</span>
          </div>
          <div className="flex items-center gap-2">
            <LimitToggle value={recentLimit} onChange={setRecentLimit} />
            <SortToggle value={recentSort} onChange={setRecentSort} />
          </div>
        </div>
        <PinPerformanceTable pins={recentPins} />
      </section>
    </div>
  );
}

function TimeFrameToggle({
  value,
  onChange,
}: {
  value: TimeFrame;
  onChange: (v: TimeFrame) => void;
}) {
  const opts: { key: TimeFrame; label: string }[] = [
    { key: "7", label: "Last 7 days" },
    { key: "14", label: "Last 14 days" },
    { key: "30", label: "Last 30 days" },
  ];
  return (
    <div className="inline-flex rounded-lg border border-white/[0.08] bg-white/[0.02] p-0.5">
      {opts.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={cn(
            "px-3 py-1.5 text-xs rounded-md transition-colors",
            value === o.key
              ? "bg-white/[0.08] text-white"
              : "text-white/50 hover:text-white/80"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function LimitToggle({
  value,
  onChange,
}: {
  value: RecentLimit;
  onChange: (v: RecentLimit) => void;
}) {
  const opts: RecentLimit[] = [5, 10, 15];
  return (
    <div className="inline-flex rounded-lg border border-white/[0.08] bg-white/[0.02] p-0.5">
      {opts.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={cn(
            "px-3 py-1.5 text-xs rounded-md transition-colors",
            value === o
              ? "bg-white/[0.08] text-white"
              : "text-white/50 hover:text-white/80"
          )}
        >
          {o} pins
        </button>
      ))}
    </div>
  );
}

function SortToggle({
  value,
  onChange,
}: {
  value: SortDir;
  onChange: (v: SortDir) => void;
}) {
  return (
    <button
      onClick={() => onChange(value === "desc" ? "asc" : "desc")}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-white/[0.08] bg-white/[0.02] text-white/70 hover:text-white hover:bg-white/[0.04] transition-colors"
    >
      <ArrowUpDown className="w-3.5 h-3.5" />
      Spend {value === "desc" ? "high → low" : "low → high"}
    </button>
  );
}

function PinPerformanceTable({ pins }: { pins: (PaidPinRow & { roas: number; cpa: number })[] }) {
  if (pins.length === 0) {
    return (
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-10 text-center text-sm text-white/50">
        No pins to show.
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.06] text-[11px] uppercase tracking-wider text-white/40">
              <th className="text-left font-medium px-4 py-3">Pin</th>
              <th className="text-right font-medium px-4 py-3">ROAS</th>
              <th className="text-right font-medium px-4 py-3">CPA</th>
              <th className="text-right font-medium px-4 py-3">Revenue</th>
              <th className="text-right font-medium px-4 py-3">Spend</th>
              <th className="text-right font-medium px-4 py-3">Purchases</th>
            </tr>
          </thead>
          <tbody>
            {pins.map((p) => (
              <tr key={p.pin_id} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-white/[0.05] flex-shrink-0 overflow-hidden flex items-center justify-center">
                      {p.image_url ? (
                        <img src={p.image_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5 text-white/30" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-white/90 truncate">{p.title}</div>
                      <div className="text-[11px] text-white/40">Launched {p.launched_at}</div>
                    </div>
                  </div>
                </td>
                <td className={cn("px-4 py-3 text-right font-medium tabular-nums", p.roas >= 3 ? "text-emerald-400" : p.roas >= 1.5 ? "text-white/90" : "text-amber-400")}>
                  {fmtRoas(p.roas)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-white/80">{fmtCurrency(p.cpa)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-white/80">{fmtCurrency(p.revenue)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-white/80">{fmtCurrency(p.spend)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-white/80">{fmtNum(p.purchases)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
