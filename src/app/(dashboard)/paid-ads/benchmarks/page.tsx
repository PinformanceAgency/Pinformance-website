"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
  Send,
  Sparkles,
  Filter as FilterIcon,
  MessageSquare,
} from "lucide-react";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { cn } from "@/lib/utils";
import {
  BENCHMARK_KPIS,
  type BenchmarkKpi,
  type BenchmarkResult,
} from "@/lib/media-buying/benchmark-query";
import { DEPARTMENT_LABELS, COUNTRY_OPTIONS } from "@/lib/media-buying/config";

const COUNTRY_LABEL: Record<string, string> = COUNTRY_OPTIONS.reduce(
  (acc, c) => ({ ...acc, [c.code]: c.label }),
  {}
);

interface Filter {
  department: string;
  niche: string;
  country: string;
  media_buyer: string;
  kpi: BenchmarkKpi;
  days: number;
}

const DEFAULT_FILTER: Filter = {
  department: "",
  niche: "",
  country: "",
  media_buyer: "",
  kpi: "roas",
  days: 30,
};

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

export default function BenchmarksPage() {
  const [filter, setFilter] = useState<Filter>(DEFAULT_FILTER);
  const [data, setData] = useState<BenchmarkResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        kpi: filter.kpi,
        days: String(filter.days),
      });
      if (filter.department) qs.set("department", filter.department);
      if (filter.niche) qs.set("niche", filter.niche);
      if (filter.country) qs.set("country", filter.country);
      if (filter.media_buyer) qs.set("media_buyer", filter.media_buyer);
      const res = await fetch(`/api/media-buying/benchmarks?${qs}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? "Failed to load");
        return;
      }
      setData(json as BenchmarkResult);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

  const kpiMeta = BENCHMARK_KPIS.find((k) => k.key === filter.kpi)!;

  // Filter option lists come from `data.stores` (which reflects the current
  // filter), so buyers/niches with no stores in scope don't clutter dropdowns.
  const nicheOptions = useMemo(() => uniqueStrings(data?.stores, "niche"), [data]);
  const buyerOptions = useMemo(() => uniqueStrings(data?.stores, "media_buyer"), [data]);
  const countryOptions = useMemo(() => uniqueStrings(data?.stores, "country"), [data]);

  async function sendChat() {
    const q = chatInput.trim();
    if (!q || chatBusy) return;
    const nextChat: ChatMsg[] = [...chat, { role: "user", content: q }];
    setChat(nextChat);
    setChatInput("");
    setChatBusy(true);
    try {
      const res = await fetch("/api/media-buying/benchmarks/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, history: chat }),
      });
      const json = await res.json();
      if (!res.ok) {
        setChat([...nextChat, { role: "assistant", content: `Error: ${json?.error ?? "unknown"}` }]);
      } else {
        setChat([...nextChat, { role: "assistant", content: json.answer ?? "(no answer)" }]);
      }
    } catch (e) {
      setChat([...nextChat, { role: "assistant", content: `Error: ${String(e)}` }]);
    } finally {
      setChatBusy(false);
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Benchmarks</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Slice metrics across the book. Filter by department, niche, country
          and buyer, pick a KPI, and the headline updates in place. Ask the AI
          panel questions in plain English for anything the filters can&apos;t
          express.
        </p>
      </header>

      {/* Filter bar */}
      <section className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <FilterIcon className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-base font-semibold">Filters</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <SelectField
            label="Department"
            value={filter.department}
            onChange={(v) => setFilter({ ...filter, department: v })}
            options={[
              { value: "", label: "All departments" },
              ...Object.entries(DEPARTMENT_LABELS).map(([v, l]) => ({ value: v, label: l })),
            ]}
          />
          <SelectField
            label="Niche"
            value={filter.niche}
            onChange={(v) => setFilter({ ...filter, niche: v })}
            options={[
              { value: "", label: "All niches" },
              ...nicheOptions.map((n) => ({ value: n, label: n })),
            ]}
          />
          <SelectField
            label="Country"
            value={filter.country}
            onChange={(v) => setFilter({ ...filter, country: v })}
            options={[
              { value: "", label: "All countries" },
              ...countryOptions.map((c) => ({
                value: c,
                label: COUNTRY_LABEL[c] ?? c,
              })),
            ]}
          />
          <SelectField
            label="Media buyer"
            value={filter.media_buyer}
            onChange={(v) => setFilter({ ...filter, media_buyer: v })}
            options={[
              { value: "", label: "All buyers" },
              ...buyerOptions.map((b) => ({ value: b, label: b })),
            ]}
          />
          <SelectField
            label="KPI"
            value={filter.kpi}
            onChange={(v) => setFilter({ ...filter, kpi: v as BenchmarkKpi })}
            options={BENCHMARK_KPIS.map((k) => ({ value: k.key, label: k.label }))}
          />
          <SelectField
            label="Window"
            value={String(filter.days)}
            onChange={(v) => setFilter({ ...filter, days: Number(v) })}
            options={[
              { value: "7", label: "Last 7 days" },
              { value: "14", label: "Last 14 days" },
              { value: "30", label: "Last 30 days" },
            ]}
          />
        </div>
      </section>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Main grid — stats/chart on the left, AI chat on the right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <HeadlineCard data={data} loading={loading} kpiMeta={kpiMeta} />
          <TrendChart data={data} kpiMeta={kpiMeta} />
          <ContributingStores data={data} kpiMeta={kpiMeta} />
        </div>
        <div className="lg:col-span-1">
          <ChatPanel
            chat={chat}
            input={chatInput}
            setInput={setChatInput}
            onSend={sendChat}
            busy={chatBusy}
            chatEndRef={chatEndRef}
          />
        </div>
      </div>
    </div>
  );
}

function uniqueStrings(
  rows: BenchmarkResult["stores"] | undefined,
  key: "niche" | "country" | "media_buyer"
): string[] {
  if (!rows) return [];
  const set = new Set<string>();
  for (const r of rows) {
    const v = r[key];
    if (v) set.add(v);
  }
  return Array.from(set).sort();
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-border bg-card px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function formatKpi(
  value: number | null | undefined,
  fmt: "currency" | "ratio" | "percent" | "count"
): string {
  if (value == null || !isFinite(value)) return "—";
  switch (fmt) {
    case "ratio":
      return `${value.toFixed(2)}x`;
    case "currency":
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: value >= 1000 ? 0 : 2,
      }).format(value);
    case "percent":
      return `${value.toFixed(2)}%`;
    case "count":
      return new Intl.NumberFormat("en-US").format(Math.round(value));
  }
}

function HeadlineCard({
  data,
  loading,
  kpiMeta,
}: {
  data: BenchmarkResult | null;
  loading: boolean;
  kpiMeta: (typeof BENCHMARK_KPIS)[number];
}) {
  return (
    <section className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
            {kpiMeta.label} benchmark
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{kpiMeta.description}</p>
        </div>
        {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
      </div>

      {!data ? null : !data.sufficient ? (
        <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
          Insufficient data — {data.n_stores} store{data.n_stores === 1 ? "" : "s"} in this
          filter. Benchmarks need at least 3 stores to be meaningful.
        </div>
      ) : (
        <>
          <div className="mt-3 flex items-baseline gap-3 flex-wrap">
            <div className="text-4xl font-semibold tabular-nums">
              {formatKpi(data.headline, kpiMeta.format)}
            </div>
            <div className="text-sm text-muted-foreground">
              across <strong>{data.n_stores}</strong> stores · last <strong>{data.filter.days}</strong> days
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-3">
            <MiniStat label="Min" value={formatKpi(data.distribution.min, kpiMeta.format)} />
            <MiniStat label="P25" value={formatKpi(data.distribution.p25, kpiMeta.format)} />
            <MiniStat label="Median" value={formatKpi(data.distribution.median, kpiMeta.format)} big />
            <MiniStat label="P75" value={formatKpi(data.distribution.p75, kpiMeta.format)} />
            <MiniStat label="Max" value={formatKpi(data.distribution.max, kpiMeta.format)} />
          </div>
          <div className="mt-4 border-t border-border pt-3 grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
            <MiniStat label="Spend" value={formatKpi(data.totals.spend, "currency")} />
            <MiniStat label="Revenue" value={formatKpi(data.totals.revenue, "currency")} />
            <MiniStat label="Conversions" value={formatKpi(data.totals.conversions, "count")} />
            <MiniStat label="Impressions" value={formatKpi(data.totals.impressions, "count")} />
            <MiniStat label="Clicks" value={formatKpi(data.totals.clicks, "count")} />
          </div>
        </>
      )}
    </section>
  );
}

function MiniStat({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
        {label}
      </div>
      <div className={cn("mt-0.5 font-semibold tabular-nums", big ? "text-lg" : "text-sm")}>
        {value}
      </div>
    </div>
  );
}

function TrendChart({
  data,
  kpiMeta,
}: {
  data: BenchmarkResult | null;
  kpiMeta: (typeof BENCHMARK_KPIS)[number];
}) {
  if (!data || data.daily.length === 0) return null;
  const chartData = data.daily.map((d) => ({
    date: d.date.slice(5), // MM-DD
    value: d.value,
  }));
  return (
    <section className="bg-card border border-border rounded-2xl p-5">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
        {kpiMeta.label} — daily
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="currentColor" />
            <YAxis
              tick={{ fontSize: 11 }}
              stroke="currentColor"
              tickFormatter={(v) => formatKpi(v as number, kpiMeta.format)}
            />
            <Tooltip
              formatter={(v) => formatKpi(v as number, kpiMeta.format)}
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#E30613"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function ContributingStores({
  data,
  kpiMeta,
}: {
  data: BenchmarkResult | null;
  kpiMeta: (typeof BENCHMARK_KPIS)[number];
}) {
  if (!data || data.stores.length === 0) return null;
  return (
    <section className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
          Contributing stores
        </div>
        <div className="text-[11px] text-muted-foreground">
          Sorted by {kpiMeta.label} (best → worst)
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-muted-foreground text-xs">
            <tr>
              <th className="text-left font-medium py-2">Store</th>
              <th className="text-left font-medium py-2">Niche</th>
              <th className="text-left font-medium py-2">Country</th>
              <th className="text-left font-medium py-2">Buyer</th>
              <th className="text-right font-medium py-2">Spend</th>
              <th className="text-right font-medium py-2">Revenue</th>
              <th className="text-right font-medium py-2">{kpiMeta.label}</th>
            </tr>
          </thead>
          <tbody>
            {data.stores.map((s) => (
              <tr key={s.org_id} className="border-b border-border/60 last:border-b-0">
                <td className="py-1.5 font-medium">{s.store_name}</td>
                <td className="py-1.5 text-muted-foreground text-xs">{s.niche ?? "—"}</td>
                <td className="py-1.5 text-muted-foreground text-xs">
                  {s.country ? COUNTRY_LABEL[s.country] ?? s.country : "—"}
                </td>
                <td className="py-1.5 text-muted-foreground text-xs">{s.media_buyer ?? "—"}</td>
                <td className="py-1.5 text-right tabular-nums">
                  {formatKpi(s.spend, "currency")}
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  {formatKpi(s.revenue, "currency")}
                </td>
                <td className="py-1.5 text-right tabular-nums font-medium">
                  {formatKpi(s.value, kpiMeta.format)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const SUGGESTED_QUESTIONS = [
  "Which niche has the best ROAS this month?",
  "How does CPM in the US compare to NL?",
  "Which media buyer is running the cheapest CPC?",
  "Which store has the biggest gap between ROAS and its invoice ROAS?",
];

function ChatPanel({
  chat,
  input,
  setInput,
  onSend,
  busy,
  chatEndRef,
}: {
  chat: ChatMsg[];
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
  busy: boolean;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <section className="bg-card border border-border rounded-2xl p-5 flex flex-col h-[720px] sticky top-4">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="w-4 h-4 text-primary" />
        <h2 className="text-base font-semibold">Ask the hub</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Natural-language questions over the last 30 days across every configured
        store. Uses Claude with the live per-store table as context.
      </p>

      <div className="flex-1 overflow-y-auto space-y-3 border-t border-border pt-3 -mx-1 px-1">
        {chat.length === 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-2">
              Try
            </div>
            <ul className="space-y-1.5">
              {SUGGESTED_QUESTIONS.map((q) => (
                <li key={q}>
                  <button
                    onClick={() => setInput(q)}
                    className="w-full text-left text-xs rounded-lg border border-border/50 bg-background hover:bg-muted px-3 py-1.5"
                  >
                    {q}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {chat.map((m, i) => (
          <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap",
                m.role === "user"
                  ? "bg-primary text-white rounded-br-sm"
                  : "bg-muted rounded-bl-sm"
              )}
            >
              {m.content}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm text-muted-foreground inline-flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Thinking…
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      <div className="mt-3 border-t border-border pt-3 flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          rows={2}
          placeholder="Ask about ROAS, CPM, niches, buyers…"
          className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <button
          onClick={onSend}
          disabled={busy || !input.trim()}
          className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </section>
  );
}
