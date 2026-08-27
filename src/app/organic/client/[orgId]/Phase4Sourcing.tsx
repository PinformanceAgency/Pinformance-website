"use client";

/**
 * Where the month starts: filling the URL pool, and choosing from it.
 *
 * P4.1.1 rendered an empty list on every real store, because nothing ever
 * wrote organic.urls except somebody typing a URL by hand. P4.1.4 then
 * asked the manager to choose from that empty list against a target they
 * had to remember.
 *
 * Both halves are here because they are one motion: import what exists,
 * then pick this month's from it. Neither step writes without a
 * confirmation — the import proposes and the selection proposes, and the
 * manager presses the button.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2, Download, Sparkles, Check, Plus, AlertTriangle, TrendingUp, CalendarClock,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Proposed {
  url: string;
  name: string;
  type: string;
  reason: string;
  note: string;
  already_known: boolean;
  proven_clicks?: number;
  proven_saves?: number;
}

interface MonthlyProposal {
  url_id: string;
  name: string;
  url: string;
  type: string;
  why: string;
  proven_clicks: number;
  proven_saves: number;
  seasonal: boolean;
}

async function callP4(orgId: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/organic/phase4/${orgId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    redirect: "error",
  });
  const raw = await res.text();
  let data: { error?: string } & Record<string, unknown> = {};
  try { data = JSON.parse(raw); } catch { /* keep raw */ }
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status} — ${raw.slice(0, 160)}`);
  return data;
}

export function Phase4Sourcing({ orgId, poolSize }: { orgId: string; poolSize: number }) {
  return (
    <div className="space-y-3">
      <UrlImport orgId={orgId} poolSize={poolSize} />
      <MonthlySelection orgId={orgId} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* P4.1.1 — fill the pool                                              */
/* ------------------------------------------------------------------ */

function UrlImport({ orgId, poolSize }: { orgId: string; poolSize: number }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(poolSize === 0);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<Proposed[] | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  function toggle(url: string) {
    const next = new Set(picked);
    if (next.has(url)) next.delete(url); else next.add(url);
    setPicked(next);
  }

  async function load(source: "sitemap" | "top_pins") {
    setBusy(source); setErr(null);
    try {
      const d = source === "sitemap"
        ? await callP4(orgId, { action: "import_sitemap", limit: 400 })
        : await callP4(orgId, { action: "import_top_pins", days: 90 });
      const list = (d.proposals as Proposed[]) ?? [];
      setRows(list);
      // Pre-select what is new. The import exists to save typing, and
      // unticking a few is faster than ticking a hundred.
      setPicked(new Set(list.filter((p) => !p.already_known).map((p) => p.url)));
      setSummary(source === "sitemap"
        ? `${d.scanned} URLs in the sitemap · ${d.pinnable} pinnable · ` +
          `${d.locale_variants_folded} locale variants folded into one`
        : `${d.pins_read} top pins read · ${list.length} distinct landing pages`);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(null); }
  }

  async function add() {
    if (picked.size === 0) { setErr("Nothing selected."); return; }
    setBusy("add"); setErr(null);
    try {
      const chosen = (rows ?? [])
        .filter((r) => picked.has(r.url))
        .map((r) => ({ url: r.url, name: r.name, type: r.type, reason: r.reason }));
      const d = await callP4(orgId, { action: "accept_urls", urls: chosen });
      const errors = (d.errors as Array<{ url: string; message: string }>) ?? [];
      setRows(null); setPicked(new Set());
      setSummary(`${d.added} URL(s) added to the pool` +
        (errors.length ? ` · ${errors.length} refused: ${errors[0].message}` : ""));
      startTransition(() => router.refresh());
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(null); }
  }

  return (
    <div className="rounded-[10px] border border-o-hairline bg-o-surface overflow-hidden">
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left">
        <span>
          <span className="o-eyebrow block">P4.1.1 · The URL pool</span>
          <span className="text-sm font-medium text-foreground">
            {poolSize === 0
              ? "Empty — import the client's pages before anything else"
              : `${poolSize} URL${poolSize === 1 ? "" : "s"} in the pool`}
          </span>
        </span>
        <span className="text-xs text-muted-foreground shrink-0">{open ? "Hide" : "Import"}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-o-hairline pt-3">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => load("sitemap")} disabled={busy !== null}
              className="o-btn o-btn-primary">
              {busy === "sitemap" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Read the sitemap
            </button>
            <button type="button" onClick={() => load("top_pins")} disabled={busy !== null}
              className="o-btn">
              {busy === "top_pins" ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
              Pages Pinterest already rewards
            </button>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            The sitemap says what pages exist. The top pins say which of them Pinterest has already
            decided it likes — fewer, and worth more. Neither adds anything until you press Add.
          </p>

          {summary && <p className="text-xs text-o-ink-2">{summary}</p>}
          {err && <p className="text-xs text-o-neg break-words" role="alert">{err}</p>}

          {rows && rows.length > 0 && (
            <>
              <div className="max-h-80 overflow-y-auto rounded-lg ring-1 ring-inset ring-o-hairline divide-y divide-o-hairline">
                {rows.map((r) => (
                  <label key={r.url}
                    className={cn("flex items-start gap-3 px-3 py-2.5 cursor-pointer",
                                  r.already_known && "opacity-55")}>
                    <input type="checkbox" checked={picked.has(r.url)} disabled={r.already_known}
                      onChange={() => toggle(r.url)} className="mt-1 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground truncate">{r.name}</span>
                        <span className="o-eyebrow">{r.type.toLowerCase()}</span>
                        {r.already_known && <span className="o-eyebrow text-o-ink-3">already in the pool</span>}
                      </span>
                      <span className="block text-xs text-muted-foreground truncate">{r.url}</span>
                      <span className="block text-xs text-o-ink-2">{r.note}</span>
                    </span>
                  </label>
                ))}
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <button type="button" onClick={add} disabled={busy !== null || picked.size === 0}
                  className="o-btn o-btn-primary">
                  {busy === "add" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Add {picked.size} to the pool
                </button>
                <button type="button" onClick={() => { setRows(null); setPicked(new Set()); }}
                  disabled={busy !== null} className="o-btn">Cancel</button>
              </div>
            </>
          )}

          {rows && rows.length === 0 && (
            <p className="text-sm text-o-ink-2">
              Nothing pinnable came back. Check the domain in client settings, or that the account has
              published organic pins in the last ninety days.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* P4.1.4 — this month's selection                                     */
/* ------------------------------------------------------------------ */

function MonthlySelection({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<{
    target: number; started: number; proposed: MonthlyProposal[]; gaps: string[];
  } | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  async function load() {
    setBusy("load"); setErr(null);
    try {
      const d = await callP4(orgId, { action: "monthly_selection" }) as unknown as {
        target: number; started: number; proposed: MonthlyProposal[]; gaps: string[];
      };
      setData(d);
      // Pre-tick up to what the frequency still asks for. This is the
      // proposal — the manager unticks what the client does not want
      // pushed this month, which is the one thing the ranking cannot know.
      const room = Math.max(0, d.target - d.started);
      setPicked(new Set(d.proposed.slice(0, room).map((p) => p.url_id)));
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(null); }
  }

  function toggle(id: string) {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id); else next.add(id);
    setPicked(next);
  }

  async function start() {
    setBusy("start"); setErr(null);
    try {
      for (const id of picked) await callP4(orgId, { action: "start_cycle", url_id: id });
      setData(null); setPicked(new Set());
      startTransition(() => router.refresh());
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(null); }
  }

  if (!data) {
    return (
      <div className="rounded-[10px] border border-o-hairline bg-o-surface px-4 py-3 flex items-center gap-3 flex-wrap">
        <span className="flex-1 min-w-[14rem]">
          <span className="o-eyebrow block">P4.1.4 · This month&#8217;s URLs</span>
          <span className="text-sm text-o-ink-2">
            Ranked by what has won here, then by what the season is opening.
          </span>
        </span>
        <button type="button" onClick={load} disabled={busy !== null} className="o-btn o-btn-primary">
          {busy === "load" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Propose the selection
        </button>
        {err && <p className="w-full text-xs text-o-neg break-words" role="alert">{err}</p>}
      </div>
    );
  }

  const room = Math.max(0, data.target - data.started);

  return (
    <div className="rounded-[10px] border border-o-hairline bg-o-surface overflow-hidden">
      <div className="px-4 py-3 border-b border-o-hairline flex items-baseline gap-3 flex-wrap">
        <span className="o-eyebrow">P4.1.4 · This month&#8217;s URLs</span>
        <span className="text-sm text-o-ink-2 ml-auto">
          <span className="o-figure text-foreground">{data.started + picked.size}</span> of{" "}
          <span className="o-figure text-foreground">{data.target}</span> · {data.started} already started
          {picked.size > room && <span className="text-o-accent"> · over the monthly frequency</span>}
        </span>
      </div>

      <div className="divide-y divide-o-hairline max-h-96 overflow-y-auto">
        {data.proposed.map((p) => (
          <label key={p.url_id} className="flex items-start gap-3 px-4 py-2.5 cursor-pointer">
            <input type="checkbox" checked={picked.has(p.url_id)}
              onChange={() => toggle(p.url_id)} className="mt-1 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-2 flex-wrap">
                <span className="text-sm font-medium text-foreground truncate">{p.name}</span>
                <span className="o-eyebrow">{p.type.toLowerCase()}</span>
                {p.seasonal && (
                  <span className="o-eyebrow inline-flex items-center gap-1 text-o-accent">
                    <CalendarClock className="w-3 h-3" /> seasonal
                  </span>
                )}
              </span>
              <span className="block text-xs text-o-ink-2">{p.why}</span>
            </span>
          </label>
        ))}
      </div>

      {data.gaps.length > 0 && (
        <p className="px-4 py-2 text-xs text-o-ink-2 border-t border-o-hairline flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px text-o-accent" />
          <span>Ranked without: {data.gaps.join("; ")}</span>
        </p>
      )}

      <div className="px-4 py-3 border-t border-o-hairline flex items-center gap-3 flex-wrap">
        <button type="button" onClick={start} disabled={busy !== null || picked.size === 0}
          className="o-btn o-btn-primary">
          {busy === "start" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Start {picked.size} cycle{picked.size === 1 ? "" : "s"}
        </button>
        <button type="button" onClick={() => setData(null)} disabled={busy !== null} className="o-btn">
          Cancel
        </button>
        {err && <p className="w-full text-xs text-o-neg break-words" role="alert">{err}</p>}
      </div>
    </div>
  );
}
