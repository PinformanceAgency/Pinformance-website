"use client";

/**
 * Organic per week, on step 5 — the figures the agency looks at every Monday.
 *
 * Reach comes in by itself every night (own image + video pins, never
 * product pins). Revenue and conversions only exist in Conversion Insights,
 * so the row for last week asks for them, with the exact filters next to the
 * boxes. The conversion window is the brand's and is not a field: it is
 * stamped on save, so a week can never be read with a different one. See
 * lib/organic/weekly.ts.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Band, Panel, Label } from "@/components/organic/primitives";
import { Table, TH, TD, Pill } from "@/components/organic/internal";
import {
  conversionInsightsSteps,
  type StoreWeekly,
  type WeekRow,
} from "@/lib/organic/weekly";
import { cn } from "@/lib/utils";

const nf = (v: number | null) =>
  v === null ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: 0 });

function money(v: number | null, currency: string | null): string {
  if (v === null) return "—";
  const sym = currency === "EUR" ? "€" : currency === "USD" ? "$" : currency === "GBP" ? "£" : currency ? `${currency} ` : "";
  return `${sym}${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function weekLabel(start: string): string {
  const d = new Date(start + "T00:00:00Z");
  const end = new Date(d.getTime() + 6 * 86_400_000);
  const f = (x: Date) => x.toLocaleDateString("en-US", { day: "numeric", month: "short", timeZone: "UTC" });
  return `${f(d)} – ${f(end)}`;
}

const hasFigures = (w: WeekRow) =>
  w.revenue_organic !== null || w.checkouts !== null || w.page_visits !== null || w.add_to_cart !== null;

export function WeeklyPanel({ orgId, data }: { orgId: string; data: StoreWeekly }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | null>(
    hasFigures(data.weeks[0]) ? null : data.current_week,
  );
  const steps = conversionInsightsSteps(data.window);
  const mismatched = data.weeks.filter(
    (w) => w.conversion_window_click !== null &&
      (w.conversion_window_click !== data.window.click || w.conversion_window_view !== data.window.view),
  );

  return (
    <Band
      title="Organic per week"
      sub="Monday to Sunday. Reach comes from Pinterest every night; revenue and conversions are copied from Conversion Insights once a week."
    >
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_20rem] gap-4">
        <Table>
          <thead>
            <tr>
              <TH>Week</TH>
              <TH align="right">Impressions</TH>
              <TH align="right">Saves</TH>
              <TH align="right">Outbound clicks</TH>
              <TH align="right">Organic revenue</TH>
              <TH align="right">Checkouts</TH>
              <TH align="right">Page visits</TH>
              <TH align="right">Add to cart</TH>
              <TH />
            </tr>
          </thead>
          <tbody>
            {data.weeks.map((w) =>
              editing === w.week_start ? (
                <EditRow
                  key={w.week_start}
                  orgId={orgId}
                  week={w}
                  currency={data.currency}
                  onDone={(saved) => {
                    setEditing(null);
                    if (saved) startTransition(() => router.refresh());
                  }}
                />
              ) : (
                <tr key={w.week_start} className={cn(w.week_start === data.current_week && "bg-o-sunk")}>
                  <TD>
                    <span className="font-medium text-o-ink">{weekLabel(w.week_start)}</span>
                    {w.is_partial && <span className="ml-2"><Pill tone="warn">still coming in</Pill></span>}
                  </TD>
                  <TD align="right">{nf(w.impressions)}</TD>
                  <TD align="right">{nf(w.pin_saves)}</TD>
                  <TD align="right">{nf(w.outbound_clicks)}</TD>
                  <TD align="right">
                    <span className="font-medium text-o-ink">{money(w.revenue_organic, data.currency)}</span>
                  </TD>
                  <TD align="right">{nf(w.checkouts)}</TD>
                  <TD align="right">{nf(w.page_visits)}</TD>
                  <TD align="right">{nf(w.add_to_cart)}</TD>
                  <TD align="right">
                    <button
                      type="button"
                      onClick={() => setEditing(w.week_start)}
                      className={cn(
                        "text-[length:var(--text-o-label)] underline-offset-2 hover:underline",
                        hasFigures(w) ? "text-o-ink-3" : "text-o-accent font-medium",
                      )}
                    >
                      {hasFigures(w) ? "Edit" : "Enter"}
                    </button>
                  </TD>
                </tr>
              ),
            )}
          </tbody>
        </Table>

        <Panel inset className="p-4 space-y-3 self-start">
          <Label>How to read Conversion Insights</Label>
          <ol className="list-decimal pl-4 space-y-1.5 text-[length:var(--text-o-body)] text-o-ink-2 leading-snug">
            {steps.map((s) => <li key={s}>{s}</li>)}
          </ol>
          {data.window.is_default && (
            <p className="text-[length:var(--text-o-label)] text-o-ink-3">
              This brand has no attribution setting in Store Settings, so the default 30-day click /
              1-day view is used. Set it there if paid uses another.
            </p>
          )}
          {mismatched.length > 0 && (
            <p className="text-[length:var(--text-o-label)] text-o-accent">
              {mismatched.length} week(s) were entered with another window than the brand uses now —
              those are not comparable with the rest.
            </p>
          )}
          <p className="text-[length:var(--text-o-label)] text-o-ink-3">
            Reach counts the store&apos;s own image and video pins only (claimed domain, product pins
            left out). Amounts are in the ad account&apos;s currency{data.currency ? ` (${data.currency})` : ""}.
          </p>
        </Panel>
      </div>
    </Band>
  );
}

function EditRow({
  orgId, week, currency, onDone,
}: {
  orgId: string;
  week: WeekRow;
  currency: string | null;
  onDone: (saved: boolean) => void;
}) {
  const init = (v: number | null) => (v === null ? "" : String(v));
  const [revenue, setRevenue] = useState(init(week.revenue_organic));
  const [checkouts, setCheckouts] = useState(init(week.checkouts));
  const [visits, setVisits] = useState(init(week.page_visits));
  const [carts, setCarts] = useState(init(week.add_to_cart));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const parse = (s: string): number | null => {
    const t = s.trim().replace(/\s/g, "").replace(",", ".");
    return t === "" ? null : Number(t);
  };

  async function save() {
    setErr(null);
    const figures = {
      week_start: week.week_start,
      revenue_organic: parse(revenue),
      checkouts: parse(checkouts),
      page_visits: parse(visits),
      add_to_cart: parse(carts),
    };
    if (Object.values(figures).slice(1).every((v) => v === null)) {
      setErr("Nothing filled in.");
      return;
    }
    if (Object.values(figures).slice(1).some((v) => v !== null && !Number.isFinite(v))) {
      setErr("Numbers only.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/organic/analytics/${orgId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "save_week", figures }),
      });
      const d = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      onDone(true);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const box = "o-input w-24 text-right tabular-nums";
  return (
    <tr className="bg-o-sunk">
      <TD>
        <span className="font-medium text-o-ink">{weekLabel(week.week_start)}</span>
        {err && <div className="mt-1 text-[length:var(--text-o-label)] text-o-accent">{err}</div>}
      </TD>
      <TD align="right" muted>{nf(week.impressions)}</TD>
      <TD align="right" muted>{nf(week.pin_saves)}</TD>
      <TD align="right" muted>{nf(week.outbound_clicks)}</TD>
      <TD align="right">
        <input aria-label={`Organic revenue${currency ? ` (${currency})` : ""}`} inputMode="decimal"
          value={revenue} onChange={(e) => setRevenue(e.target.value)} className={box} placeholder={currency ?? ""} />
      </TD>
      <TD align="right">
        <input aria-label="Checkouts" inputMode="numeric" value={checkouts}
          onChange={(e) => setCheckouts(e.target.value)} className={box} />
      </TD>
      <TD align="right">
        <input aria-label="Page visits" inputMode="numeric" value={visits}
          onChange={(e) => setVisits(e.target.value)} className={box} />
      </TD>
      <TD align="right">
        <input aria-label="Add to cart" inputMode="numeric" value={carts}
          onChange={(e) => setCarts(e.target.value)} className={box} />
      </TD>
      <TD align="right">
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={() => onDone(false)} disabled={busy}
            className="text-[length:var(--text-o-label)] text-o-ink-3 hover:underline">
            Cancel
          </button>
          <button type="button" onClick={save} disabled={busy}
            className="o-btn o-btn-dark inline-flex items-center gap-1">
            {busy && <Loader2 className="w-3 h-3 animate-spin" />} Save
          </button>
        </div>
      </TD>
    </tr>
  );
}
