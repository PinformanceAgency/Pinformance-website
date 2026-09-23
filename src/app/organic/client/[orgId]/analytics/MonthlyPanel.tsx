"use client";

/**
 * C2 / C3 — wat organic per maand oplevert, welke pins het deden, en wat er
 * terug moet in de volgende ronde.
 *
 * Dit paneel bestaat omdat de vorige vraag onbeantwoordbaar was. De
 * analytics-pagina had een live-uitsnede van Pinterest over een zelfgekozen
 * periode, en dat is nuttig — maar "hoe ging september tegenover augustus",
 * "welke vijf pins wonnen" en "doen infographics het beter dan productfoto's"
 * zijn vragen over opgeslagen historie, en die historie bestond niet: de
 * nachtelijke pull viel elke nacht om op een Pinterest-endpoint die onze apps
 * niet mogen gebruiken.
 *
 * Drie dingen staan hier bewust naast elkaar in plaats van opgeteld:
 *
 *   - **Organic omzet** is één bak. Paid-assisted staat ernaast en wordt er
 *     nooit bij geteld, want dan claimt dit rapport omzet die het
 *     paid-rapport ook claimt.
 *   - **Onze pins** en **andermans pins op het geclaimde domein** zijn
 *     verschillende cijfers. Pinterest kan ze scheiden; wij tellen ze niet op.
 *   - **Een leeg veld is leeg.** Geen nul, want nul is een gemeten uitkomst.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trophy, Plus, Trash2 } from "lucide-react";
import { Band, Panel, Label } from "@/components/organic/primitives";
import { Table, TH, TD, Pill, Metric } from "@/components/organic/internal";
import { TrendLine, BarList } from "@/components/organic/charts";
import { FORMAT_LABEL, type CreativeFormat } from "@/lib/organic/formats";
import type { MonthlyDashboard, TopPin, CsvPreviewRow } from "@/lib/organic/monthly";
import { cn } from "@/lib/utils";

const nf = (v: number | null | undefined, digits = 0): string =>
  v === null || v === undefined ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: digits });

const money = (v: number | null | undefined): string =>
  v === null || v === undefined ? "—" : `€ ${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

/** Wat `preview_csv` teruggeeft. `error` kan bij een 200 meekomen: een
 *  onleesbaar bestand is geen serverfout, het is een bevinding over de CSV. */
type CsvPreview = { rows: CsvPreviewRow[]; unknown_columns: string[]; error?: string };

/** Welke kolommen een rij kan dragen, in de volgorde waarin ze worden getoond.
 *  Losgehouden van `CSV_FIELDS` in monthly.ts: daar staan de namen waarop
 *  herkend wordt, hier staat hoe een herkende waarde wordt voorgelezen. */
const CSV_COLUMNS: Array<[string, string]> = [
  ["revenue_organic", "organic"],
  ["revenue_paid_assisted", "paid assisted"],
  ["revenue_paid_unassisted", "paid unassisted"],
  ["conversions", "conversions"],
  ["checkouts", "checkouts"],
  ["add_to_cart", "add to cart"],
  ["page_visits", "page visits"],
  ["ga4_sessions", "sessions"],
  ["conversion_window_click", "click window"],
  ["conversion_window_view", "view window"],
];

const landing = (figures: Record<string, unknown>): string => {
  const parts = CSV_COLUMNS
    .filter(([k]) => figures[k] !== null && figures[k] !== undefined)
    .map(([k, label]) => `${label} ${nf(figures[k] as number, 2)}`);
  return parts.length > 0 ? parts.join(" · ") : "the month, and nothing else";
};

const monthLabel = (iso: string): string =>
  new Date(`${iso.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short", year: "numeric", timeZone: "UTC",
  });

export function MonthlyPanel({ orgId, data }: { orgId: string; data: MonthlyDashboard }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function call(body: Record<string, unknown>, key: string) {
    setErr(null); setNote(null); setBusy(key);
    try {
      const res = await fetch(`/api/organic/analytics/${orgId}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json() as { error?: string; imported?: number; skipped?: number };
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      if (typeof d.imported === "number") {
        setNote(`${d.imported} month(s) imported${d.skipped ? `, ${d.skipped} row(s) skipped` : ""}.`);
      }
      startTransition(() => router.refresh());
      return true;
    } catch (e) { setErr((e as Error).message); return false; }
    finally { setBusy(null); }
  }

  /**
   * De CSV eerst laten zien, dan pas wegschrijven.
   *
   * `import_csv` leest de tekst server-side opnieuw met dezelfde parser, dus
   * wat hier op het scherm komt is wat er straks landt — er gaan geen rijen
   * vanuit de browser terug. Wie de tekst daarna nog aanraakt, raakt het
   * voorbeeld kwijt: importeren wat niemand heeft gezien is precies wat deze
   * stap moet voorkomen.
   */
  async function previewCsv(csv: string): Promise<CsvPreview | null> {
    setErr(null); setNote(null); setBusy("preview");
    try {
      const res = await fetch(`/api/organic/analytics/${orgId}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "preview_csv", csv }),
      });
      const d = await res.json() as CsvPreview & { error?: string };
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      return d;
    } catch (e) { setErr((e as Error).message); return null; }
    finally { setBusy(null); }
  }

  const { current, previous, months, deltas } = data;
  const series = [...months].reverse();

  return (
    <div className="space-y-10">
      <Band
        title="This month"
        sub={
          current
            ? `${monthLabel(current.month)} against ${previous ? monthLabel(previous.month) : "nothing before it"}` +
              (current.is_partial ? " — the month is still running" : "")
            : "No month has been measured yet."
        }
      >
        {!current ? (
          <p className="text-sm text-o-ink-2">
            Nothing stored for this store yet. The nightly pull fills impressions, saves and clicks;
            revenue and conversions are entered below, because Pinterest&rsquo;s API does not return
            them for organic.
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {deltas.map((d) => (
                <Metric
                  key={String(d.key)}
                  label={d.label}
                  value={d.key === "revenue_organic" ? money(d.value) : nf(d.value)}
                  tone={d.pct === null ? undefined : d.pct >= 0 ? "good" : "bad"}
                  hint={
                    d.pct === null
                      ? d.previous === null ? "no month before this one" : "not measured"
                      : `${d.pct >= 0 ? "+" : ""}${d.pct.toFixed(0)}% on ${previous ? monthLabel(previous.month) : "last month"}`
                  }
                />
              ))}
            </div>

            {/* Andermans pins op ons domein. Apart, en met de reden erbij dat het
                apart staat — anders leest het als een cijfer dat wij misten. */}
            {(current.other_impressions ?? 0) > 0 && (
              <p className="mt-3 text-[length:var(--text-o-label)] text-o-ink-3">
                Other people pinned this domain {nf(current.other_impressions)} times over
                ({nf(current.other_saves)} saves). That is reach we did not make, so it is counted
                apart and never added in.
              </p>
            )}

            {data.caveats.length > 0 && (
              <div className="mt-4 rounded-lg bg-o-accent/[0.07] ring-1 ring-inset ring-o-clay/25 px-3.5 py-3">
                <p className="text-sm font-medium text-foreground">About these figures</p>
                <ul className="mt-1 space-y-1 text-sm text-o-ink-2 list-disc pl-4">
                  {data.caveats.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              </div>
            )}
          </>
        )}
      </Band>

      {series.length >= 2 && (
        <Band title="Six months" sub="Impressions, saves and outbound clicks as stored — not a live read.">
          <div className="grid gap-5 lg:grid-cols-3">
            {([
              ["Impressions", "impressions", "teal"],
              ["Saves", "pin_saves", "slate"],
              ["Outbound clicks", "outbound_clicks", "clay"],
            ] as const).map(([label, key, color]) => (
              <Panel key={key}>
                <TrendLine
                  label={label}
                  color={color}
                  points={series.map((m) => ({
                    x: monthLabel(m.month),
                    y: (m[key] as number | null) ?? null,
                  }))}
                />
              </Panel>
            ))}
          </div>
        </Band>
      )}

      <Band
        title="What won"
        sub="Top five on outbound clicks and on saves, from the daily figures we hold. Marking a winner is what carries it into next month's design brief."
      >
        <div className="grid gap-5 lg:grid-cols-2">
          <TopPinTable
            title="Most outbound clicks" pins={data.top_by_clicks} metric="outbound_clicks"
            busy={busy} onMark={(p, n) => call({ action: "mark_winner", pin_id: p.pin_id, is_winner: !p.is_winner, note: n }, p.pin_id)}
          />
          <TopPinTable
            title="Most saves" pins={data.top_by_saves} metric="saves"
            busy={busy} onMark={(p, n) => call({ action: "mark_winner", pin_id: p.pin_id, is_winner: !p.is_winner, note: n }, p.pin_id)}
          />
        </div>
      </Band>

      <Band
        title="By format"
        sub="Per pin, not as a total: a format with four pins always beats one with a single pin, and that says nothing about the format."
      >
        {data.formats.length === 0 ? (
          <p className="text-sm text-o-ink-2">Nothing published yet.</p>
        ) : data.formats.every((f) => f.format === null) ? (
          <p className="text-sm text-o-ink-2">
            None of the {data.formats[0].pins} published pins has a format on it yet, so this cannot
            compare anything. The format is set per design in P4.2.3 — from then on this table fills.
          </p>
        ) : (
          <>
            <BarList
              color="teal"
              valueSuffix=" clicks/pin"
              data={data.formats.map((f) => ({
                label: f.format ? FORMAT_LABEL[f.format as CreativeFormat] : "no format set",
                value: f.clicks_per_pin,
                note: `${f.pins} pin${f.pins === 1 ? "" : "s"}`,
              }))}
            />
            <Table className="mt-4">
              <thead>
                <tr>
                  <TH>Format</TH>
                  <TH align="right">Pins</TH>
                  <TH align="right">Impressions</TH>
                  <TH align="right">Saves/pin</TH>
                  <TH align="right">Clicks/pin</TH>
                </tr>
              </thead>
              <tbody>
                {data.formats.map((f) => (
                  <tr key={f.format ?? "none"}>
                    <TD>{f.format ? FORMAT_LABEL[f.format as CreativeFormat] : <span className="text-o-ink-3">no format set</span>}</TD>
                    <TD align="right" muted>{f.pins}</TD>
                    <TD align="right" muted>{nf(f.impressions)}</TD>
                    <TD align="right" muted>{nf(f.saves_per_pin, 1)}</TD>
                    <TD align="right" muted>{nf(f.clicks_per_pin, 1)}</TD>
                  </tr>
                ))}
              </tbody>
            </Table>
          </>
        )}
      </Band>

      <FiguresForm
        orgId={orgId}
        months={months.map((m) => m.month)}
        busy={busy}
        onSave={(figures) => call({ action: "save_figures", figures }, "figures")}
        onCsv={(csv) => call({ action: "import_csv", csv }, "csv")}
        onPreviewCsv={previewCsv}
        current={current}
      />

      <TrendsPanel
        trends={data.trends}
        busy={busy}
        onAdd={(t) => call({ action: "save_trend", ...t }, "trend")}
        onDelete={(id) => call({ action: "delete_trend", id }, id)}
      />

      {err && <p className="text-xs text-o-neg break-words" role="alert">{err}</p>}
      {note && <p className="text-xs text-emerald-700">{note}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function TopPinTable({
  title, pins, metric, busy, onMark,
}: {
  title: string;
  pins: TopPin[];
  metric: "outbound_clicks" | "saves";
  busy: string | null;
  onMark: (p: TopPin, note: string) => void;
}) {
  const [asking, setAsking] = useState<string | null>(null);
  const [why, setWhy] = useState("");

  return (
    <Panel>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {pins.length === 0 ? (
        <p className="mt-1.5 text-sm text-o-ink-2">
          Nothing has {metric === "saves" ? "been saved" : "had an outbound click"} yet in what we
          measure. Pins published in the last days often sit at zero for a week.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-o-hairline">
          {pins.map((p) => (
            <li key={p.pin_id} className="py-2.5">
              <div className="flex items-start gap-3">
                {p.image_url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={p.image_url} alt="" className="w-10 h-14 object-cover rounded shrink-0 bg-o-sunk" />
                  : <div className="w-10 h-14 rounded shrink-0 bg-o-sunk" />}
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground truncate">
                    {p.pin_url
                      ? <a href={p.pin_url} target="_blank" rel="noreferrer noopener" className="hover:text-o-accent">
                          {p.cycle} · D{p.design_number}
                        </a>
                      : <>{p.cycle} · D{p.design_number}</>}
                    {p.is_winner && <span className="ml-2"><Pill tone="good">winner</Pill></span>}
                  </p>
                  <p className="text-[length:var(--text-o-label)] text-o-ink-3 truncate">
                    {p.board ?? "—"}
                    {" · "}
                    {p.format ? FORMAT_LABEL[p.format as CreativeFormat] : "no format set"}
                    {" · "}
                    {p.route === "AI_GENERATED" ? "generated" : "uploaded"}
                    {p.published_on ? ` · ${p.published_on}` : ""}
                  </p>
                  <p className="text-[length:var(--text-o-label)] text-o-ink-2 tabular-nums">
                    {nf(p.outbound_clicks)} clicks · {nf(p.saves)} saves · {nf(p.impressions)} impressions
                  </p>
                  {p.winner_note && (
                    <p className="text-[length:var(--text-o-label)] text-o-ink-3">{p.winner_note}</p>
                  )}
                </div>
                {p.is_winner ? (
                  <button type="button" disabled={busy !== null}
                    onClick={() => onMark(p, "")}
                    className="shrink-0 text-[length:var(--text-o-label)] text-muted-foreground hover:text-foreground">
                    {busy === p.pin_id ? "…" : "Unmark"}
                  </button>
                ) : (
                  <button type="button" disabled={busy !== null}
                    onClick={() => { setAsking(p.pin_id); setWhy(""); }}
                    className="shrink-0 inline-flex items-center gap-1 text-[length:var(--text-o-label)] font-semibold
                               px-2 py-1 rounded-md border border-o-hairline hover:bg-o-sunk">
                    <Trophy className="w-3.5 h-3.5" /> Winner
                  </button>
                )}
              </div>

              {asking === p.pin_id && (
                <div className="mt-2 pl-[3.25rem]">
                  <input
                    value={why}
                    onChange={(e) => setWhy(e.target.value)}
                    placeholder="What worked here — this is what next month's brief reuses"
                    className="w-full rounded-md border border-o-hairline bg-background px-2.5 py-1.5 text-sm
                               placeholder:text-o-ink-3 focus:outline-none focus:ring-1 focus:ring-o-accent/40"
                  />
                  <div className="mt-1.5 flex items-center gap-2">
                    <button type="button" disabled={busy !== null || !why.trim()}
                      onClick={() => { onMark(p, why); setAsking(null); }}
                      className="text-[length:var(--text-o-label)] font-semibold px-2.5 py-1.5 rounded-md
                                 bg-foreground text-background hover:opacity-90 disabled:opacity-50">
                      {busy === p.pin_id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Mark as winner"}
                    </button>
                    <button type="button" onClick={() => setAsking(null)}
                      className="text-[length:var(--text-o-label)] text-muted-foreground hover:text-foreground">
                      Cancel
                    </button>
                    {!why.trim() && (
                      <span className="text-[length:var(--text-o-label)] text-o-ink-3">a note is required</span>
                    )}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */

const CLICK_WINDOWS = [1, 7, 30, 60];
const VIEW_WINDOWS = [1, 7];

function FiguresForm({
  months, busy, onSave, onCsv, onPreviewCsv, current,
}: {
  orgId: string;
  months: string[];
  busy: string | null;
  onSave: (f: Record<string, unknown>) => void;
  onCsv: (csv: string) => Promise<boolean>;
  onPreviewCsv: (csv: string) => Promise<CsvPreview | null>;
  current: MonthlyDashboard["current"];
}) {
  const [month, setMonth] = useState(
    (current?.month ?? new Date().toISOString().slice(0, 10)).slice(0, 7)
  );
  const [organic, setOrganic] = useState("");
  const [assisted, setAssisted] = useState("");
  const [unassisted, setUnassisted] = useState("");
  const [conversions, setConversions] = useState("");
  const [checkouts, setCheckouts] = useState("");
  const [atc, setAtc] = useState("");
  const [visits, setVisits] = useState("");
  const [clickWindow, setClickWindow] = useState(30);
  const [viewWindow, setViewWindow] = useState(1);
  const [sessions, setSessions] = useState("");
  const [figNote, setFigNote] = useState("");
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<CsvPreview | null>(null);

  const num = (v: string): number | null => {
    const t = v.trim().replace(/[€\s]/g, "").replace(",", ".");
    if (!t) return null;
    const p = Number(t);
    return Number.isFinite(p) ? p : null;
  };

  const field = (label: string, value: string, set: (v: string) => void, hint?: string) => (
    <label className="block">
      <Label>{label}</Label>
      <input value={value} onChange={(e) => set(e.target.value)} inputMode="decimal"
        className="mt-1 w-full rounded-md border border-o-hairline bg-background px-2.5 py-1.5 text-sm
                   focus:outline-none focus:ring-1 focus:ring-o-accent/40" />
      {hint && <span className="mt-0.5 block text-[length:var(--text-o-label)] text-o-ink-3">{hint}</span>}
    </label>
  );

  return (
    <Band
      title="Revenue and conversions"
      sub={
        "Pinterest's API returns no revenue or conversion figures for organic — only impressions, " +
        "saves, clicks and engagement. So these come out of Conversion Insights by hand, or as a CSV."
      }
    >
      <Panel>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <Label>Month</Label>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
              className="mt-1 w-full rounded-md border border-o-hairline bg-background px-2.5 py-1.5 text-sm" />
            {months.includes(`${month}-01`) && (
              <span className="mt-0.5 block text-[length:var(--text-o-label)] text-o-ink-3">
                this month already has figures; blanks leave them as they are
              </span>
            )}
          </label>
          {field("Organic conversion revenue", organic, setOrganic, "the only bucket that counts as organic")}
          {field("Paid-assisted revenue", assisted, setAssisted, "shown apart, never added to organic")}
          {field("Paid-unassisted revenue", unassisted, setUnassisted, "paid only")}
          {field("Conversions", conversions, setConversions)}
          {field("Checkouts", checkouts, setCheckouts)}
          {field("Add to cart", atc, setAtc)}
          {field("Page visits", visits, setVisits)}
          <label className="block">
            <Label>Click window</Label>
            <select value={clickWindow} onChange={(e) => setClickWindow(Number(e.target.value))}
              className="mt-1 w-full rounded-md border border-o-hairline bg-background px-2.5 py-1.5 text-sm">
              {CLICK_WINDOWS.map((d) => <option key={d} value={d}>{d} days</option>)}
            </select>
            <span className="mt-0.5 block text-[length:var(--text-o-label)] text-o-ink-3">
              stored with the figure, so two months can be told apart
            </span>
          </label>
          <label className="block">
            <Label>View window</Label>
            <select value={viewWindow} onChange={(e) => setViewWindow(Number(e.target.value))}
              className="mt-1 w-full rounded-md border border-o-hairline bg-background px-2.5 py-1.5 text-sm">
              {VIEW_WINDOWS.map((d) => <option key={d} value={d}>{d} day{d === 1 ? "" : "s"}</option>)}
            </select>
          </label>
          {field("GA4 sessions from Pinterest", sessions, setSessions, "optional, by hand — no GA4 link yet")}
          {field("Note", figNote, setFigNote, "where these came from, if it matters")}
        </div>

        <button type="button" disabled={busy !== null}
          onClick={() => onSave({
            month,
            revenue_organic: num(organic),
            revenue_paid_assisted: num(assisted),
            revenue_paid_unassisted: num(unassisted),
            conversions: num(conversions),
            checkouts: num(checkouts),
            add_to_cart: num(atc),
            page_visits: num(visits),
            conversion_window_click: clickWindow,
            conversion_window_view: viewWindow,
            ga4_sessions: num(sessions),
            note: figNote.trim() || null,
            source: "MANUAL",
          })}
          className="mt-4 inline-flex items-center gap-1.5 text-[length:var(--text-o-label)] font-semibold
                     px-2.5 py-1.5 rounded-md bg-foreground text-background hover:opacity-90 disabled:opacity-50">
          {busy === "figures" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          {busy === "figures" ? "Saving…" : "Save these figures"}
        </button>
        <p className="mt-2 text-[length:var(--text-o-label)] text-o-ink-3">
          Blank fields are left as they are, so you can fill in the revenue today and the checkouts
          tomorrow. Nothing here is ever overwritten by the nightly pull.
        </p>
      </Panel>

      <Panel className="mt-4">
        <p className="text-sm font-medium text-foreground">Or paste a CSV</p>
        <p className="mt-1 text-[length:var(--text-o-label)] text-o-ink-3">
          One row per month. The columns are matched by name — month, organic revenue, paid assisted,
          paid unassisted, conversions, checkouts, add to cart, page visits, click window, view window.
          Semicolons and commas both work. You see what the file says before anything is written: a row
          missing its month or its attribution window is named and skipped rather than guessed at.
        </p>
        <textarea value={csv} onChange={(e) => { setCsv(e.target.value); setPreview(null); }} rows={4}
          placeholder="month;organic revenue;paid assisted;click window&#10;2026-08;12450;3100;30"
          className="mt-2 w-full rounded-md border border-o-hairline bg-background px-2.5 py-2 font-mono text-xs
                     focus:outline-none focus:ring-1 focus:ring-o-accent/40" />

        {preview === null ? (
          <button type="button" disabled={busy !== null || !csv.trim()}
            onClick={async () => { const p = await onPreviewCsv(csv); if (p) setPreview(p); }}
            className="mt-2 inline-flex items-center gap-1.5 text-[length:var(--text-o-label)] font-semibold
                       px-2.5 py-1.5 rounded-md border border-o-hairline hover:bg-o-sunk disabled:opacity-50">
            {busy === "preview" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            {busy === "preview" ? "Reading…" : "Read this file"}
          </button>
        ) : (
          <CsvPreviewTable
            preview={preview}
            busy={busy}
            onCancel={() => setPreview(null)}
            onConfirm={async () => { if (await onCsv(csv)) { setCsv(""); setPreview(null); } }}
          />
        )}
      </Panel>
    </Band>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Wat er gaat landen, voordat het landt.
 *
 * Een rij met een probleem wordt getoond en niet geïmporteerd — `importMonthlyCsv`
 * slaat dezelfde rijen over, dus dit scherm belooft niets wat de import niet
 * doet. Een niet-herkende kolom staat er apart onder: die wordt genegeerd, en
 * stilzwijgend negeren is hoe je een maand omzet kwijtraakt aan een kolomnaam.
 */
function CsvPreviewTable({
  preview, busy, onCancel, onConfirm,
}: {
  preview: CsvPreview;
  busy: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (preview.error) {
    return (
      <div className="mt-3">
        <p className="text-sm text-o-neg" role="alert">{preview.error}</p>
        <button type="button" onClick={onCancel}
          className="mt-2 text-[length:var(--text-o-label)] font-semibold underline underline-offset-2">
          Try another file
        </button>
      </div>
    );
  }

  const clean = preview.rows.filter((r) => r.problems.length === 0);
  const skipped = preview.rows.length - clean.length;

  return (
    <div className="mt-3">
      <p className="text-[length:var(--text-o-label)] text-o-ink-2">
        {clean.length} month{clean.length === 1 ? "" : "s"} will be written
        {skipped > 0 ? `, ${skipped} row${skipped === 1 ? "" : "s"} will be skipped` : ""}.
        Nothing has been saved yet.
      </p>

      <Table className="mt-2">
        <thead>
          <tr>
            <TH>Month</TH>
            <TH>What lands</TH>
            <TH>Skipped because</TH>
          </tr>
        </thead>
        <tbody>
          {preview.rows.map((r, i) => (
            <tr key={`${r.month || "?"}-${i}`}>
              <TD>{r.month ? monthLabel(r.month) : <span className="text-o-ink-3">—</span>}</TD>
              <TD muted={r.problems.length > 0}>
                {r.problems.length > 0
                  ? <span className="text-o-ink-3">not imported</span>
                  : landing(r.figures as unknown as Record<string, unknown>)}
              </TD>
              <TD>
                {r.problems.length > 0
                  ? <span className="text-o-neg">{r.problems.join("; ")}</span>
                  : <span className="text-o-ink-3">—</span>}
              </TD>
            </tr>
          ))}
        </tbody>
      </Table>

      {preview.unknown_columns.length > 0 && (
        <p className="mt-2 text-[length:var(--text-o-label)] text-o-ink-3">
          Not recognised, so ignored: {preview.unknown_columns.join(", ")}.
        </p>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button type="button" disabled={busy !== null || clean.length === 0}
          onClick={onConfirm}
          className="inline-flex items-center gap-1.5 text-[length:var(--text-o-label)] font-semibold
                     px-2.5 py-1.5 rounded-md bg-foreground text-background hover:opacity-90 disabled:opacity-50">
          {busy === "csv" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          {busy === "csv"
            ? "Importing…"
            : `Import ${clean.length} month${clean.length === 1 ? "" : "s"}`}
        </button>
        <button type="button" disabled={busy !== null} onClick={onCancel}
          className="text-[length:var(--text-o-label)] font-semibold px-2.5 py-1.5 rounded-md
                     border border-o-hairline hover:bg-o-sunk disabled:opacity-50">
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const DIRECTIONS = [
  ["RISING", "rising"],
  ["SEASONAL_PEAK", "seasonal peak"],
  ["FALLING", "falling"],
] as const;

function TrendsPanel({
  trends, busy, onAdd, onDelete,
}: {
  trends: MonthlyDashboard["trends"];
  busy: string | null;
  onAdd: (t: { month: string; term: string; direction: string; note: string | null }) => void;
  onDelete: (id: string) => void;
}) {
  const [term, setTerm] = useState("");
  const [direction, setDirection] = useState<string>("RISING");
  const [tnote, setTnote] = useState("");
  const month = new Date().toISOString().slice(0, 7);

  return (
    <Band
      title="Trends to carry forward"
      sub="Search terms Pinterest Trends shows moving. Typed here because that tool cannot be read through the API, and recorded per month so the next content round picks them up instead of losing them in a chat."
    >
      <Panel>
        <div className="flex flex-wrap items-end gap-2">
          <label className="block grow min-w-[12rem]">
            <Label>Term</Label>
            <input value={term} onChange={(e) => setTerm(e.target.value)}
              className="mt-1 w-full rounded-md border border-o-hairline bg-background px-2.5 py-1.5 text-sm" />
          </label>
          <label className="block">
            <Label>Direction</Label>
            <select value={direction} onChange={(e) => setDirection(e.target.value)}
              className="mt-1 rounded-md border border-o-hairline bg-background px-2.5 py-1.5 text-sm">
              {DIRECTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="block grow min-w-[12rem]">
            <Label>Note</Label>
            <input value={tnote} onChange={(e) => setTnote(e.target.value)}
              placeholder="optional — where you saw it, how fast"
              className="mt-1 w-full rounded-md border border-o-hairline bg-background px-2.5 py-1.5 text-sm
                         placeholder:text-o-ink-3" />
          </label>
          <button type="button" disabled={busy !== null || !term.trim()}
            onClick={() => { onAdd({ month, term, direction, note: tnote.trim() || null }); setTerm(""); setTnote(""); }}
            className={cn(
              "inline-flex items-center gap-1.5 text-[length:var(--text-o-label)] font-semibold",
              "px-2.5 py-1.5 rounded-md bg-foreground text-background hover:opacity-90 disabled:opacity-50"
            )}>
            {busy === "trend" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Add
          </button>
        </div>

        {trends.length > 0 && (
          <Table className="mt-4">
            <thead>
              <tr>
                <TH>Term</TH>
                <TH>Direction</TH>
                <TH>Noted</TH>
                <TH>Used</TH>
                <TH> </TH>
              </tr>
            </thead>
            <tbody>
              {trends.map((t) => (
                <tr key={t.id}>
                  <TD>
                    {t.term}
                    {t.note && <span className="block text-[length:var(--text-o-label)] text-o-ink-3">{t.note}</span>}
                  </TD>
                  <TD>
                    <Pill tone={t.direction === "FALLING" ? "warn" : "good"}>
                      {t.direction.toLowerCase().replace("_", " ")}
                    </Pill>
                  </TD>
                  <TD muted>{monthLabel(t.month)}</TD>
                  <TD muted>{t.used_at ? t.used_at.slice(0, 10) : "—"}</TD>
                  <TD align="right">
                    <button type="button" disabled={busy !== null} onClick={() => onDelete(t.id)}
                      className="text-o-ink-3 hover:text-o-neg" aria-label={`Remove ${t.term}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </TD>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
    </Band>
  );
}
