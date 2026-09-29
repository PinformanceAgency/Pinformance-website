/**
 * The Dutch summary that goes on the monday to-do with the files. Written with
 * *bold* markers, turned into HTML by toUpdateHtml(); no emoji. Per meeting, and first — because Tycho reads it before anything else
 * — the stores his deep dive said nothing about.
 */
import type { RunPayload, RunRow } from "./types";

const list = (xs: string[]) => (xs.length ? xs.join(", ") : "geen");

export function summaryFor(run: RunRow): string {
  const p = run.payload;
  const out: string[] = [];
  const streamLabel = run.stream === "dropship" ? "Dropship" : "Branded";
  out.push(`*${streamLabel} · week ${p.meeting_week}* (resultaten ${p.data_period})`);
  if (run.status === "error" || !p.deck_data) {
    out.push(`Niet klaar: ${run.error ?? `gestopt bij stage ${run.stage}`}`);
    return out.join("\n");
  }

  const f = p.fathom;
  const stores = p.stores ?? [];
  const withFinding = new Set((f?.findings ?? []).filter((x) => x.store_key && x.confidence !== "low").map((x) => x.store_key));
  if (!f || f.deep_dives_found === 0) {
    out.push(`*Voor Tycho:* nog geen deep dive van deze week gevonden in Fathom — de prep is zonder deep-dive-tekst gemaakt.`);
  } else {
    out.push(`*Voor Tycho — geen deep-dive-bevinding:* ${list(stores.filter((s) => !withFinding.has(s.key)).map((s) => s.name))}`);
    const loose = (f.findings ?? []).filter((x) => !x.store_key);
    if (loose.length) {
      out.push(`*Bevindingen zonder store (niet in de PDF):*`);
      for (const x of loose.slice(0, 12)) out.push(`• ${x.text}`);
      if (loose.length > 12) out.push(`• … en nog ${loose.length - 12}`);
    }
  }
  if (!f?.meeting_found) out.push(`Vorige delivery meeting niet gevonden in Fathom — to-do's en targets alleen uit monday.`);

  for (const deck of p.decks ?? []) {
    const d = p.deck_data![deck.key];
    if (!d) continue;
    const [m, w] = d.goal.cards;
    const delta = (c: typeof m) =>
      c.prev == null ? "" : ` (${c.now - c.prev > 0 ? "+" : c.now - c.prev < 0 ? "" : "± "}${c.now - c.prev} t.o.v. vorige week)`;
    out.push("");
    out.push(`*${deck.label}*`);
    out.push(`Maanddoel: *${m.now} / ${m.target}*${delta(m)} · ${m.on_track ? "on track" : "off track"}`);
    out.push(`Weekdoel: *${w.now} / ${w.target}*${delta(w)} · ${w.on_track ? "on track" : "off track"}`);

    // biggest movement: largest revenue (or spend) change on a base worth
    // talking about — a 900% jump from €40 is noise
    const rows = d.stores
      .map((r) => ({ r, s: stores.find((x) => x.key === r.key)! }))
      .filter(({ r, s }) => r.rev_wk_delta != null && (s.spend_account ? s.prev.spend : s.prev.revenue) >= s.week_floor * 0.25);
    const up = [...rows].sort((a, b) => (b.r.rev_wk_delta ?? 0) - (a.r.rev_wk_delta ?? 0))[0];
    const down = [...rows].sort((a, b) => (a.r.rev_wk_delta ?? 0) - (b.r.rev_wk_delta ?? 0))[0];
    const mv = (x: typeof up) =>
      `${x.r.name} ${x.s.spend_account ? "spend" : "omzet"} ${x.r.rev_wk_delta! >= 0 ? "+" : ""}${Math.round(x.r.rev_wk_delta! * 100)}% (${x.r.rev_wk_txt}), ROAS ${x.r.roas_wk_prev} → ${x.r.roas_wk_now}`;
    if (up && (up.r.rev_wk_delta ?? 0) > 0) out.push(`Grootste stijger: ${mv(up)}`);
    if (down && (down.r.rev_wk_delta ?? 0) < 0) out.push(`Grootste daler: ${mv(down)}`);
    out.push(`Geen spend/revenue-target in de log: ${list(d.summary.no_target)}`);
    const low = d.summary.issues.filter((i) => i.includes("below invoice"));
    if (low.length) out.push(`ROAS-target onder invoice (invoice telt): ${low.map((i) => i.split(":")[0]).join(", ")}`);
  }

  const n = p.notices;
  if (n) {
    out.push("");
    if (n.monday_source.length) out.push(`Cijfers uit monday in plaats van het dashboard: ${list(n.monday_source)}`);
    if (n.missing_in_settings.length) out.push(`Active op Clients, niet (goed) in store_settings — niet in de deck: ${list(n.missing_in_settings)}`);
    if (n.inactive_left_out.length) out.push(`Inactive op Clients — overgeslagen: ${list(n.inactive_left_out)}`);
    if (n.not_on_clients?.length) out.push(`Niet gevonden op het Clients-board — overgeslagen (alias toevoegen of store_settings uitzetten): ${list(n.not_on_clients)}`);
    if (n.no_deck.length) out.push(`Geen deck voor deze buyer: ${list(n.no_deck)}`);
    if (n.week_data_missing.length) out.push(`Geen weekdata: ${list(n.week_data_missing)}`);
    if (n.unmatched_logs.length) out.push(`Weekly Store Log niet aan een store gekoppeld: ${list(n.unmatched_logs)}`);
    if (n.config_gaps.length) out.push(`Config: ${n.config_gaps.join("; ")}`);
  }
  for (const i of p.issues ?? []) out.push(`Let op: ${i}`);
  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}

export type { RunPayload };
