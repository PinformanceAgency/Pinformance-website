/**
 * Stage 1 · collect — the numbers, the store list, the logs and the to-dos
 * for one stream.
 *
 * NUMBERS: Store Ranking is the source, called exactly as the page and
 * /api/media-buying/store-ranking call it, so the deck and the screen cannot
 * disagree. A store with no Pinterest data on the dashboard falls back to the
 * monday Weekly Updates subitems (week = this Monday's cohort, prev = last
 * Monday's, month = this month's cohorts) and is named in the DM as such.
 *
 * WHICH STORES: the monday Clients board decides whether a store is in.
 * Stores come and go every week, so nothing here is a fixed list: a store is
 * in the meeting when its Clients subitem is Active (or Onboarding, or has no
 * status yet) under a live client — and out the moment it is set Inactive,
 * whatever the dashboard still says (Tristan, 29-09-2026: Bootylift is
 * inactive and must be skipped even though store_settings still has it).
 * store_settings then says which deck it goes in (media_buyer + department)
 * and what it is measured against. Both ways a mismatch is named in the DM,
 * never dropped silently: Active on Clients but not configured, or configured
 * but not findable on Clients.
 */
import { computeStoreRanking, storeRankingPeriods, type StoreRankingRow } from "@/lib/media-buying/store-ranking";
import { invoiceRoasTarget, scaleFloorFor, type InvoicingModel } from "@/lib/media-buying/config";
import { loadFxRates, ratePerEur } from "@/lib/media-buying/fx";
import type { Stream } from "./constants";
import { adminClient, loadBuyers, loadMeetingSettings, type BuyerRow, type MeetingSettingsRow } from "./db";
import {
  buildLogNotes,
  loadClientStores,
  loadLogDocs,
  loadLogItems,
  loadTemplateTexts,
  loadWeeklyActiveNames,
  loadWeeklyRows,
  sharedTexts,
  type Block,
  type WeeklyRow,
} from "./monday";
import type { CollectedStore, DeckRef, LogNotes, Money, RunPayload } from "./types";
import { addDays, currencyPrefix, meetingDates, nameKey, nameMatches } from "./util";

const DEPARTMENT: Record<Stream, string> = { dropship: "dropship", branded: "branding" };

interface SettingsRow {
  org_id: string;
  media_buyer: string | null;
  department: string | null;
  is_active: boolean | null;
  invoice_roas: number | null;
  breakeven_roas: number | null;
  invoicing_model: string | null;
  min_monthly_spend: number | null;
  zone_thresholds: Record<string, number> | null;
}

export const buyerLabel = (b: BuyerRow | undefined, buyer: string) =>
  b?.slack_label || buyer.charAt(0).toUpperCase() + buyer.slice(1);

export async function collect(stream: Stream, meetingDate: string): Promise<RunPayload> {
  const supabase = adminClient();
  const dates = meetingDates(meetingDate);
  // "now" is the meeting Tuesday, so a re-run on Wednesday computes the same
  // periods: week = the data week, month = to the Sunday.
  const periods = storeRankingPeriods(dates.data_start, new Date(meetingDate + "T08:00:00Z"));

  const [ranking, buyersAll, meetingSettings, settingsRes, orgsRes, fx] = await Promise.all([
    computeStoreRanking(supabase, periods),
    loadBuyers(),
    loadMeetingSettings(),
    supabase.from("store_settings").select("*"),
    supabase.from("organizations").select("id, name"),
    loadFxRates(supabase),
  ]);
  if (settingsRes.error) throw new Error(`store_settings: ${settingsRes.error.message}`);
  if (orgsRes.error) throw new Error(`organizations: ${orgsRes.error.message}`);

  const buyers = buyersAll.filter((b) => b.stream === stream);
  const issues: string[] = [];
  if (buyers.length === 0) throw new Error(`delivery_meeting_buyers has no buyer for ${stream} — run the seed script`);
  const buyerIds = new Set(buyers.map((b) => b.buyer));
  const buyerMondayIds = new Set(buyers.map((b) => b.monday_user_id).filter((x): x is number => !!x));

  const orgName = new Map((orgsRes.data ?? []).map((o) => [o.id as string, (o.name as string) ?? ""]));
  const rankByOrg = new Map<string, StoreRankingRow>(ranking.map((r) => [r.org_id, r]));
  const all = (settingsRes.data ?? []) as SettingsRow[];

  const notices = {
    missing_in_settings: [] as string[],
    inactive_left_out: [] as string[],
    not_on_clients: [] as string[],
    no_deck: [] as string[],
    new_stores: [] as string[],
    monday_source: [] as string[],
    week_data_missing: [] as string[],
    unmatched_logs: [] as string[],
    config_gaps: [] as string[],
  };

  const ms = (org: string): MeetingSettingsRow | undefined => meetingSettings.get(org);
  const keysFor = (org: string) => {
    const m = ms(org);
    return [orgName.get(org), m?.display_name, m?.monday_store_name, ...(m?.monday_aliases ?? [])]
      .map(nameKey)
      .filter(Boolean);
  };
  // ---- The Clients board: who is in ---------------------------------------
  const [clients, weeklyActive] = await Promise.all([
    loadClientStores().catch((e) => {
      issues.push(`Clients board not read (${e instanceof Error ? e.message : e}) — fell back to store_settings.is_active`);
      return null;
    }),
    loadWeeklyActiveNames().catch((e) => {
      issues.push(`Weekly Updates not read (${e instanceof Error ? e.message : e}) — new stores without settings are left out`);
      return null;
    }),
  ]);
  const liveClient = (c: { status: string; parent_group: string | null }) =>
    c.status !== "Inactive" && !/inactive/i.test(c.parent_group ?? "");
  type ClientState = "live" | "inactive" | "absent";
  const clientState = (org: string): ClientState => {
    if (!clients) return "live";
    const hits = clients.filter((c) => nameMatches(c.name, keysFor(org)));
    // one live subitem is enough: "May Cosmetics NL" is Active next to an
    // Inactive "May Cosmetics DE / WW", and the org is the NL store
    if (hits.some(liveClient)) return "live";
    return hits.length ? "inactive" : "absent";
  };

  const candidates: SettingsRow[] = [];
  const skippedKeys: string[] = []; // stores left out: their logs are not "unmatched"
  for (const s of all) {
    const name = ms(s.org_id)?.display_name || orgName.get(s.org_id) || s.org_id;
    if (s.department !== DEPARTMENT[stream]) continue;
    const state = clientState(s.org_id);
    // a store that is not on Clients at all and switched off in store_settings
    // is simply history — not worth a line in the DM
    if (state === "absent" && s.is_active === false) continue;
    if (!clients && s.is_active === false) continue;
    if (!s.media_buyer || !buyerIds.has(s.media_buyer)) {
      // A live store whose buyer has no deck in this stream would fall out of
      // every meeting without a word.
      const other = buyersAll.find((b) => b.buyer === s.media_buyer);
      if (state === "live" && (!other || stream === "branded")) {
        notices.no_deck.push(`${name} (buyer ${s.media_buyer ?? "none"}, ${s.department})`);
      }
      continue;
    }
    if (state === "inactive") {
      // only worth a line while the dashboard still counts it as live; a store
      // off in both places is history
      if (s.is_active !== false) notices.inactive_left_out.push(name);
      skippedKeys.push(...keysFor(s.org_id));
      continue;
    }
    if (state === "absent") {
      notices.not_on_clients.push(name);
      continue;
    }
    // Live on Clients wins over is_active = false in store_settings: the Clients
    // board decides who is in (Tristan, 30-09-2026), and a store left off the
    // deck gets no plan.
    candidates.push(s);
  }

  // Active on Clients, with one of this stream's buyers, and no configured
  // store_settings row to put it in a deck with: a new store nobody set up yet.
  // When it is also in Weekly Updates' active group it is live for the agency
  // and goes on the deck WITHOUT numbers — "we need a plan for that store"
  // (Tristan, 30-09-2026, about SOOS Atelier, which the first decks left out).
  const newStores: CollectedStore[] = [];
  const buyerByMondayId = new Map(buyers.filter((b) => b.monday_user_id).map((b) => [Number(b.monday_user_id), b.buyer]));
  for (const c of clients ?? []) {
    if (!liveClient(c) || !c.person_ids.some((p) => buyerMondayIds.has(p))) continue;
    if (candidates.some((s) => nameMatches(c.name, keysFor(s.org_id)))) continue;
    const s = all.find((x) => nameMatches(c.name, keysFor(x.org_id)));
    if (s && s.department && s.department !== DEPARTMENT[stream]) continue; // set up for the other stream
    const inWeekly = !!weeklyActive?.some((w) => nameMatches(w, [nameKey(c.name)]));
    const org = s?.org_id ?? [...orgName.entries()].find(([, n]) => nameMatches(c.name, [nameKey(n)]))?.[0];
    if (!inWeekly) {
      notices.missing_in_settings.push(`${c.name} (${c.client}${s ? ", niet geconfigureerd" : ""}, niet in Weekly Updates)`);
      continue;
    }
    const buyer = c.person_ids.map((p) => buyerByMondayId.get(p)).find(Boolean)!;
    const name = (org && (ms(org)?.display_name || orgName.get(org))) || c.name;
    const key = org ?? `new:${nameKey(c.name)}`;
    if (newStores.some((x) => x.key === key)) continue;
    const zero = { spend: 0, revenue: 0 };
    newStores.push({
      key,
      name,
      org_ids: org ? [org] : [],
      buyer,
      deck: stream === "dropship" ? "dropship" : buyer,
      cur: "€",
      currency: null,
      invoice: 0,
      ber: null,
      spend_account: false,
      multiplier: 1,
      week: zero,
      prev: zero,
      month: zero,
      week_floor: 0,
      month_floor: 0,
      source: "none",
      weekly_goal: false,
      match_keys: [...new Set([nameKey(c.name), ...(org ? keysFor(org) : [])])].filter(Boolean),
      week_missing: false,
      new_store: true,
    });
    notices.new_stores.push(`${name} (${buyer})`);
  }

  // ---- Numbers --------------------------------------------------------------
  const needMonday = candidates.filter((s) => {
    const r = rankByOrg.get(s.org_id);
    const empty = !r || (r.week.spend === 0 && r.prev_week.spend === 0 && r.month.spend === 0);
    return empty && (ms(s.org_id)?.monday_weekly_update_ids.length ?? 0) > 0;
  });
  const thisMonday = addDays(meetingDate, -1);
  const lastMonday = addDays(meetingDate, -8);
  // this month's cohorts: the Mondays after the 1st, up to this Monday
  const monthMondays: string[] = [];
  for (let d = thisMonday; d > periods.month_start; d = addDays(d, -7)) monthMondays.push(d);
  let weekly: WeeklyRow[] = [];
  if (needMonday.length) {
    weekly = await loadWeeklyRows([thisMonday, lastMonday, ...monthMondays]);
  }

  const floorsFor = (s: SettingsRow, currency: string | null) => {
    const opts = {
      invoicingModel: (s.invoicing_model as InvoicingModel | null) ?? "revenue_fee",
      minMonthlySpend: s.min_monthly_spend ?? null,
      overrides: s.zone_thresholds as never,
      scaleBasis: "range" as const,
      fxPerEur: ratePerEur(fx, currency),
    };
    const w = scaleFloorFor({ ...opts, rangeDays: 7 });
    const m = scaleFloorFor({ ...opts, rangeDays: periods.month_days });
    return { week: w.floor, month: m.floor, spend: w.metric === "spend" };
  };

  interface Single extends Omit<CollectedStore, "key" | "org_ids" | "deck" | "match_keys"> {
    org_id: string;
    blend: string | null;
  }
  const singles: Single[] = [];
  const zero = (): Money => ({ spend: 0, revenue: 0 });

  for (const s of candidates) {
    const m = ms(s.org_id);
    const mult = m?.revenue_multiplier ?? 1;
    const name = m?.display_name || orgName.get(s.org_id) || s.org_id;
    const invoice = invoiceRoasTarget(s.invoice_roas, s.breakeven_roas, s.zone_thresholds as never);
    if (invoice == null) {
      notices.config_gaps.push(`${name}: no invoice ROAS or BER`);
      continue;
    }
    const r = rankByOrg.get(s.org_id);
    let week: Money, prev: Money, month: Money, currency: string | null, source: Single["source"];
    let weekMissing = false;
    let weekFloor: number, monthFloor: number, spendAccount: boolean;

    if (needMonday.includes(s)) {
      const ids = new Set(m!.monday_weekly_update_ids.map(String));
      const rows = weekly.filter((w) => ids.has(w.parent_id));
      const sum = (pred: (w: WeeklyRow) => boolean) =>
        rows.filter(pred).reduce(
          (a, w) => ({ spend: a.spend + (w.spend ?? 0), revenue: a.revenue + (w.revenue ?? 0) }),
          zero(),
        );
      week = sum((w) => w.send_date === thisMonday);
      prev = sum((w) => w.send_date === lastMonday);
      month = sum((w) => monthMondays.includes(w.send_date));
      weekMissing = !rows.some((w) => w.send_date === thisMonday && (w.spend != null || w.revenue != null));
      const label = rows.find((w) => w.currency_label)?.currency_label ?? null;
      currency = label === "€" ? "EUR" : label === "$" ? "USD" : label === "£" ? "GBP" : label || null;
      if (!currency) notices.config_gaps.push(`${name}: no currency on the Weekly Updates board`);
      source = "monday";
      const f = floorsFor(s, currency);
      weekFloor = f.week;
      monthFloor = f.month;
      spendAccount = f.spend;
    } else if (r) {
      week = { spend: r.week.spend, revenue: r.week.revenue };
      prev = { spend: r.prev_week.spend, revenue: r.prev_week.revenue };
      month = { spend: r.month.spend, revenue: r.month.revenue };
      currency = r.currency;
      source = "dashboard";
      // Store Ranking's own floors, so the pills on the slide are the pills on
      // the page. It converts the euro floor at the latest ECB rate (€5,000 →
      // $5,689 on 29-09-2026), where compute_delivery.py had fixed $5,730.
      weekFloor = r.week.volume_target;
      monthFloor = r.month.volume_target;
      spendAccount = r.spend_account;
      weekMissing = r.week.spend === 0 && r.week.revenue === 0 && r.prev_week.spend === 0;
    } else {
      // configured, active, but neither on the dashboard nor on the board
      week = zero();
      prev = zero();
      month = zero();
      currency = null;
      source = "monday";
      weekMissing = true;
      const f = floorsFor(s, null);
      weekFloor = f.week;
      monthFloor = f.month;
      spendAccount = f.spend;
      notices.config_gaps.push(`${name}: no Pinterest data and no Weekly Updates ids`);
    }

    const scale = (x: Money): Money => ({ spend: x.spend, revenue: x.revenue * mult });
    singles.push({
      org_id: s.org_id,
      blend: m?.blend_group ?? null,
      name,
      buyer: s.media_buyer!,
      cur: currencyPrefix(currency),
      currency,
      invoice,
      ber: s.breakeven_roas,
      spend_account: spendAccount,
      multiplier: mult,
      week: scale(week),
      prev: scale(prev),
      month: scale(month),
      week_floor: weekFloor,
      month_floor: monthFloor,
      source,
      weekly_goal: !!m?.weekly_goal,
      week_missing: weekMissing,
    });
  }

  // ---- Blends: one row, summed ------------------------------------------------
  const stores: CollectedStore[] = [];
  const blends = new Map<string, Single[]>();
  for (const s of singles) {
    if (s.blend) blends.set(s.blend, [...(blends.get(s.blend) ?? []), s]);
    else {
      stores.push({
        ...s,
        key: s.org_id,
        org_ids: [s.org_id],
        deck: stream === "dropship" ? "dropship" : s.buyer,
        match_keys: keysFor(s.org_id),
      });
    }
  }
  for (const [name, members] of blends) {
    members.sort((a, b) => a.name.localeCompare(b.name));
    const first = members[0];
    const add = (k: "week" | "prev" | "month") =>
      members.reduce((a, m) => ({ spend: a.spend + m[k].spend, revenue: a.revenue + m[k].revenue }), {
        spend: 0,
        revenue: 0,
      });
    if (new Set(members.map((m) => m.cur)).size > 1) {
      notices.config_gaps.push(`${name}: members bill in different currencies — summed anyway`);
    }
    if (new Set(members.map((m) => m.invoice)).size > 1) {
      notices.config_gaps.push(`${name}: members have different invoice ROAS — ${first.name}'s is used`);
    }
    const sources = new Set(members.map((m) => m.source));
    stores.push({
      ...first,
      key: `blend:${name}`,
      name,
      org_ids: members.map((m) => m.org_id),
      deck: stream === "dropship" ? "dropship" : first.buyer,
      week: add("week"),
      prev: add("prev"),
      month: add("month"),
      source: sources.size > 1 ? "mixed" : first.source,
      weekly_goal: members.some((m) => m.weekly_goal),
      week_missing: members.every((m) => m.week_missing),
      match_keys: members.flatMap((m) => keysFor(m.org_id)),
    });
  }
  stores.push(...newStores);
  for (const s of singles) if (s.source === "monday") notices.monday_source.push(s.name);
  for (const s of stores) if (s.week_missing) notices.week_data_missing.push(s.name);

  // ---- Logs ---------------------------------------------------------------
  const logs: Record<string, LogNotes> = {};
  const logItems = await loadLogItems(dates.data_friday, dates.meeting_friday);
  const matched: { store: CollectedStore; item: (typeof logItems)[number] }[] = [];
  for (const item of logItems) {
    const store = stores.find((s) => nameMatches(item.store, s.match_keys));
    if (store) matched.push({ store, item });
    else if (item.person_ids.some((p) => buyerMondayIds.has(p)) && item.store && !nameMatches(item.store, skippedKeys)) {
      notices.unmatched_logs.push(`${item.store} (${item.kind === "archived" ? "data week" : "live"} log)`);
    }
  }
  const docs = await loadLogDocs(matched.map((m) => m.item.item_id));
  const template = await loadTemplateTexts();
  const shared = sharedTexts([...docs.values()]);
  for (const s of stores) {
    const mine = matched.filter((m) => m.store.key === s.key);
    const pick = (kind: "archived" | "live"): Block[][] =>
      mine.filter((m) => m.item.kind === kind && docs.has(m.item.item_id)).map((m) => docs.get(m.item.item_id)!);
    const notes = buildLogNotes(pick("archived"), pick("live"), template, shared);
    if (notes.archived || notes.live_section1) logs[s.key] = notes;
  }

  // ---- Decks ----------------------------------------------------------------
  const NN = String(dates.meeting_week).padStart(2, "0");
  let decks: DeckRef[];
  if (stream === "dropship") {
    decks = [
      {
        key: "dropship",
        label: "Dropship",
        language: "EN",
        buyers: buyers.map((b) => b.buyer),
        file: `Delivery_Dropship_wk${NN}.pptx`,
      },
    ];
  } else {
    decks = buyers
      .map((b) => ({ b, n: stores.filter((s) => s.buyer === b.buyer).length }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n || a.b.buyer.localeCompare(b.b.buyer))
      .map(({ b }) => ({
        key: b.buyer,
        label: buyerLabel(b, b.buyer),
        language: "NL" as const,
        buyers: [b.buyer],
        file: `Delivery_Branded_${buyerLabel(b, b.buyer)}_wk${NN}.pptx`,
      }));
  }

  return {
    meeting_date: meetingDate,
    meeting_week: dates.meeting_week,
    data_week: dates.data_week,
    data_period: dates.data_period,
    periods,
    decks,
    stores,
    logs,
    notices,
    issues,
  };
}
