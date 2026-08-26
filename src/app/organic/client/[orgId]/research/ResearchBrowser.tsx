"use client";

import { useMemo, useState } from "react";
import { Search, ExternalLink, Paperclip } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ResearchRecord } from "@/lib/organic/research";

/**
 * One filter across everything, rather than a tab per table.
 *
 * The moment this exists to serve is narrow: you are choosing a board or
 * writing a caption, you half-remember something from the research three
 * months ago, and you want it now. Tabs make you know which table it was
 * in before you can look — which is exactly the thing you have forgotten.
 * So one box filters every section at once and the empty ones fold away.
 */
export function ResearchBrowser({ record }: { record: ResearchRecord }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const hit = useMemo(
    () => (...parts: Array<string | null | undefined | string[]>) => {
      if (!needle) return true;
      return parts.flat().filter(Boolean).join(" ").toLowerCase().includes(needle);
    },
    [needle]
  );

  const answers = record.answers.filter((a) => hit(a.question, a.answer, a.reasoning, a.task_name, a.task_id));
  const notes = record.notes.filter((n) => hit(n.notes, n.task_name, n.task_id));
  const docs = record.documents.filter((d) => hit(d.title, d.type, d.task_id));
  const grid = record.grid.filter((g) => hit(g.keyword, g.look, g.overlay, g.formats, g.colors));
  const comps = record.competitors.filter((c) => hit(c.name, c.handle, c.fit));
  const compPins = record.competitor_pins.filter((p) => hit(p.title, p.board_name, p.competitor));
  const market = record.market.filter((m) => hit(m.title, m.detail, m.kind, m.status));
  const clusters = record.clusters.filter((c) => hit(c.name, c.axis, c.topic));
  const opps = record.board_opportunities.filter((o) => hit(o.board_name, o.category, o.source));

  const tasteEntries = Object.entries(record.taste ?? {}).filter(([k, v]) => hit(k, v));
  const brandEntries = Object.entries(record.brand ?? {}).filter(([k, v]) => hit(k, v as string | string[]));
  const intakeEntries = Object.entries(record.intake ?? {}).filter(([k, v]) => hit(k, v as string | string[]));
  const baselineEntries = Object.entries(record.baseline ?? {}).filter(([k, v]) => hit(k, String(v)));

  const total =
    answers.length + notes.length + docs.length + grid.length + comps.length +
    compPins.length + market.length + clusters.length + opps.length +
    tasteEntries.length + brandEntries.length + intakeEntries.length + baselineEntries.length;

  return (
    <div className="space-y-5">
      <div className="o-card px-5 py-4">
        <div className="flex items-center gap-3">
          <Search className="w-4 h-4 text-o-ink-3 shrink-0" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search every answer, note, document and finding from phases 1 to 3…"
            className="o-input flex-1"
          />
        </div>
        {needle && (
          <p className="mt-2.5 text-sm text-muted-foreground">
            {total === 0
              ? <>Nothing in the research mentions <span className="font-medium text-foreground">{q}</span>.</>
              : <>{total} match{total === 1 ? "" : "es"} for <span className="font-medium text-foreground">{q}</span>.</>}
          </p>
        )}
      </div>

      <Section title="Answers" count={answers.length} sub="Every question answered in phases 1 to 3, with the reasoning behind it.">
        <ul className="divide-y divide-o-hairline">
          {answers.map((a, i) => (
            <li key={`${a.task_id}-${i}`} className="px-5 py-4">
              <div className="flex items-baseline gap-2.5 flex-wrap">
                <span className="o-figure text-[11px] text-o-ink-3">{a.task_id}</span>
                <span className="text-xs text-muted-foreground">{a.task_name}</span>
              </div>
              <p className="mt-1 text-sm font-medium text-foreground">
                {a.question}
                {a.retired && (
                  <span className="ml-2 align-middle rounded bg-o-sunk px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-wide text-o-ink-3 ring-1 ring-inset ring-o-hairline-firm">
                    question retired
                  </span>
                )}
              </p>
              <p className="mt-1 text-sm">
                <span className={cn(
                  "inline-block rounded px-1.5 py-[1px] text-[11px] font-semibold mr-2 align-middle",
                  a.answer === "No" ? "bg-o-accent text-white" : "bg-o-sunk text-o-ink-2 ring-1 ring-inset ring-o-hairline-firm"
                )}>{a.answer || "—"}</span>
                {a.reasoning && <span className="text-o-ink-2">{a.reasoning}</span>}
              </p>
              {a.file_url && (
                <a href={a.file_url} target="_blank" rel="noreferrer"
                   className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
                  <Paperclip className="w-3 h-3" /> {a.file_title || a.file_url}
                </a>
              )}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Notes" count={notes.length} sub="Free-form notes recorded against a task.">
        <ul className="divide-y divide-o-hairline">
          {notes.map((n, i) => (
            <li key={i} className="px-5 py-3.5">
              <span className="o-figure text-[11px] text-o-ink-3">{n.task_id}</span>
              <span className="ml-2 text-xs text-muted-foreground">{n.task_name}</span>
              <p className="mt-1 text-sm text-o-ink-2 whitespace-pre-wrap">{n.notes}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Documents" count={docs.length} sub="Everything collected and attached during onboarding and research.">
        <ul className="divide-y divide-o-hairline">
          {docs.map((d, i) => (
            <li key={i} className="px-5 py-3 flex items-center gap-3">
              <Paperclip className="w-3.5 h-3.5 text-o-ink-3 shrink-0" />
              <a href={d.url} target="_blank" rel="noreferrer" className="flex-1 min-w-0 text-sm text-primary hover:underline truncate">{d.title}</a>
              {d.task_id && <span className="o-figure text-[11px] text-o-ink-3 shrink-0">{d.task_id}</span>}
              <span className="text-[11px] text-muted-foreground shrink-0">{d.uploaded_at.slice(0, 10)}</span>
              <ExternalLink className="w-3.5 h-3.5 text-o-ink-3 shrink-0" />
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Grid analysis" count={grid.length} sub="What page one rewards, per seed keyword (P2.1.3 / P2.1.4).">
        <div className="overflow-x-auto">
          <table className="o-table w-full text-sm">
            <thead><tr>
              <th>Keyword</th><th>Dominant formats</th><th>CTAs</th><th>Text overlay</th><th>Colours</th><th>Look and feel</th>
            </tr></thead>
            <tbody>
              {grid.map((g, i) => (
                <tr key={i}>
                  <td className="font-medium text-foreground whitespace-nowrap">{g.keyword}</td>
                  <td>{g.formats.join(", ") || "—"}</td>
                  <td>{g.ctas === null ? "—" : g.ctas ? "Yes" : "No"}</td>
                  <td>{g.overlay ?? "—"}</td>
                  <td>
                    <span className="inline-flex gap-1">
                      {g.colors.map((c) => (
                        <span key={c} title={c} className="w-4 h-4 rounded ring-1 ring-inset ring-o-hairline-firm"
                              style={{ background: c }} />
                      ))}
                    </span>
                  </td>
                  <td className="text-o-ink-2">{g.look ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Competitors" count={comps.length} sub="Who we are up against, and how fast they publish (P2.1.5 / P2.4.1).">
        <div className="overflow-x-auto">
          <table className="o-table w-full text-sm">
            <thead><tr><th>Name</th><th>Handle</th><th>Niche fit</th><th>Pins/day</th><th>Pins imported</th></tr></thead>
            <tbody>
              {comps.map((c, i) => (
                <tr key={i}>
                  <td className="font-medium text-foreground">
                    <a href={c.profile_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">{c.name ?? "—"}</a>
                  </td>
                  <td>{c.handle ? `@${c.handle}` : "—"}</td>
                  <td>{c.fit ?? "—"}</td>
                  <td className="o-figure">{c.pins_per_day ?? "—"}</td>
                  <td className="o-figure">{c.pins_imported.toLocaleString("en-US")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Competitor pins" count={compPins.length}
               sub="Their best-saving pins, imported in P2.1.6. Capped at 200 here — the per-competitor totals are in the table above.">
        <div className="overflow-x-auto">
          <table className="o-table w-full text-sm">
            <thead><tr><th>Competitor</th><th>Title</th><th>Board</th><th>Saves</th><th>Clicks</th></tr></thead>
            <tbody>
              {compPins.map((p, i) => (
                <tr key={i}>
                  <td className="whitespace-nowrap">{p.competitor ?? "—"}</td>
                  <td><a href={p.pin_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">{p.title ?? p.pin_url}</a></td>
                  <td>{p.board_name ?? "—"}</td>
                  <td className="o-figure">{p.saves?.toLocaleString("en-US") ?? "—"}</td>
                  <td className="o-figure">{p.clicks?.toLocaleString("en-US") ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Market analysis" count={market.length} sub="Steal List, Board Gaps and content angles — approved and rejected (P2.2.2).">
        <ul className="divide-y divide-o-hairline">
          {market.map((m, i) => (
            <li key={i} className="px-5 py-3.5">
              <div className="flex items-baseline gap-2.5 flex-wrap">
                <span className="o-eyebrow">{m.kind.replace(/_/g, " ")}</span>
                <span className={cn(
                  "rounded px-1.5 py-[1px] text-[10px] font-semibold uppercase",
                  m.status === "APPROVED" ? "bg-o-ink text-white" : "bg-o-sunk text-o-ink-2 ring-1 ring-inset ring-o-hairline-firm"
                )}>{m.status}</span>
                <span className="text-sm font-medium text-foreground">{m.title}</span>
              </div>
              {m.detail && <p className="mt-1 text-sm text-o-ink-2">{m.detail}</p>}
              {m.reject_reason && <p className="mt-1 text-sm text-o-accent">Rejected: {m.reject_reason}</p>}
            </li>
          ))}
        </ul>
      </Section>

      <KeyValues title="Taste graph" sub="The seven fields and the three-by-three (P2.3.1 / P2.3.3)." entries={tasteEntries} />
      <KeyValues title="Brand rules" sub="From the brand book (P1.1.6). These constrain copy and design." entries={brandEntries} />
      <KeyValues title="Client intake" sub="What the client told us about themselves (P1.1.1)." entries={intakeEntries} />

      <Section title="Keyword clusters" count={clusters.length} sub="Classified in P3.1.">
        <ul className="divide-y divide-o-hairline">
          {clusters.map((c, i) => (
            <li key={i} className="px-5 py-3 text-sm">
              <span className="font-medium text-foreground">{c.name}</span>
              {c.axis && <span className="ml-2 text-muted-foreground">axis: {c.axis}</span>}
              {c.topic && <span className="ml-2 text-muted-foreground">topic: {c.topic}</span>}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Board opportunities" count={opps.length} sub="Surfaced during research, and whether they became a board.">
        <ul className="divide-y divide-o-hairline">
          {opps.map((o, i) => (
            <li key={i} className="px-5 py-3 text-sm flex items-baseline gap-2.5 flex-wrap">
              <span className="font-medium text-foreground">{o.board_name}</span>
              {o.category && <span className="text-muted-foreground">{o.category}</span>}
              <span className={cn("o-eyebrow", o.converted ? "text-o-ink-2" : "text-o-accent")}>
                {o.converted ? "built" : "not built yet"}
              </span>
              {o.source && <span className="w-full text-o-ink-2">{o.source}</span>}
            </li>
          ))}
        </ul>
      </Section>

      <KeyValues title="Analytics baseline" sub="Thirteen KPIs over three months before we started (P1.2.13). What everything since is measured against." entries={baselineEntries} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Section({ title, sub, count, children }: {
  title: string; sub: string; count: number; children: React.ReactNode;
}) {
  // An empty section under a filter is noise; an empty section with no
  // filter is a real gap in the research and worth seeing.
  if (count === 0) return null;
  return (
    <section className="o-card overflow-hidden">
      <div className="o-card-head px-5 py-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="o-h3 text-foreground">{title}</h2>
          <span className="o-figure text-[11px] text-o-ink-3">{count}</span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{sub}</p>
      </div>
      {children}
    </section>
  );
}

function KeyValues({ title, sub, entries }: {
  title: string; sub: string; entries: Array<[string, unknown]>;
}) {
  if (entries.length === 0) return null;
  return (
    <Section title={title} sub={sub} count={entries.length}>
      <dl className="divide-y divide-o-hairline">
        {entries.map(([k, v]) => (
          <div key={k} className="px-5 py-3 grid sm:grid-cols-[13rem_1fr] gap-1.5 sm:gap-4">
            <dt className="o-eyebrow pt-0.5">{k.replace(/_/g, " ")}</dt>
            <dd className="text-sm text-o-ink-2">
              {Array.isArray(v) ? (
                <span className="flex flex-wrap gap-1.5">
                  {(v as string[]).map((x) => (
                    <span key={x} className="rounded bg-o-sunk px-2 py-[2px] text-xs ring-1 ring-inset ring-o-hairline">{x}</span>
                  ))}
                </span>
              ) : String(v)}
            </dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}
