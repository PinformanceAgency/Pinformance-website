/**
 * Stage 4 · compute — port of compute_delivery.py (the delivery-meeting
 * skill). The rules are the approved deck's and are kept exact; what changed
 * is only where the inputs come from:
 *
 *   - week / prev / month figures: Store Ranking (collect.ts), not the frozen
 *     Monday board. So a week can read differently from a deck built by the
 *     old skill; the month matches it to the cent.
 *   - the floors: Store Ranking's `volume_target` (ECB rate of the day), so a
 *     pill on the slide is the pill on the page. The script had fixed
 *     €5,000 / $5,730 / CHF 4,731.
 *
 * Deterministic: same payload in, same deck data out.
 */
import type { BuyerRow } from "./db";
import type { CollectedStore, DeckData, DeckRef, DeckStoreRow, GoalCard, GoalSplit, Target } from "./types";
import { fmtDeck, fmtInt } from "./util";

/** "same" / "up" / "+15%" / a number → spend per day (compute_delivery.py). */
export function spendDay(sd: Target["spend_day"], baseWeekSpend: number): number | null {
  if (sd == null || sd === "") return null;
  if (sd === "same" || sd === "up") return baseWeekSpend / 7;
  if (typeof sd === "string") {
    const m = /^\+(\d+(?:\.\d+)?)%$/.exec(sd.trim());
    if (m) return (baseWeekSpend / 7) * (1 + Number(m[1]) / 100);
    const n = Number(sd);
    return isFinite(n) && n > 0 ? n : null;
  }
  return sd > 0 ? sd : null;
}

export interface PrevGoal {
  monthly: number | null;
  weekly: number | null;
  by_buyer: Record<string, number>;
}

export function computeDeck(opts: {
  deck: DeckRef;
  stream: string;
  stores: CollectedStore[];
  targets: Record<string, Target>;
  buyers: BuyerRow[];
  meetingWeek: number;
  dataWeek: number;
  dataPeriod: string;
  prev: PrevGoal | null;
}): DeckData {
  const { deck, stores, targets, buyers, prev } = opts;
  const deckBuyers = buyers.filter((b) => deck.buyers.includes(b.buyer));
  const label = (b: string) => deckBuyers.find((x) => x.buyer === b)?.slack_label || b[0].toUpperCase() + b.slice(1);

  const rows: (DeckStoreRow & { _sort: [number, number] })[] = [];
  const issues: string[] = [];
  const noTarget: string[] = [];
  const goalStores: [string, string][] = [];
  const weekHit: [string, string][] = [];
  const zc = { now: { on: 0, off: 0 }, prev: { on: 0, off: 0 } };
  const tot = [0, 0, 0, 0];
  const explicitGoal = stores.some((s) => s.weekly_goal);

  for (const s of stores) {
    const { cur, invoice: inv } = s;
    const [rn, sn, rp, sp] = [s.week.revenue, s.week.spend, s.prev.revenue, s.prev.spend];
    const mr = s.month.revenue;
    const msp = s.month.spend;
    const wkThr = s.week_floor;
    const floor = s.month_floor;
    const [wkVal, wkPrev] = s.spend_account ? [sn, sp] : [rn, rp];
    const mtd = s.spend_account ? msp : mr;
    const roNow = sn ? rn / sn : null;
    const roPrev = sp ? rp / sp : null;
    const romtd = msp ? mr / msp : 0;

    // This week's target, set last week. ROAS = invoice, always; the volume
    // target comes from the log, and is the floor when there is none.
    const t = targets[s.key] ?? {};
    const sd = spendDay(t.spend_day, sp);
    const wkTgt = s.spend_account
      ? t.spend_week || (sd ? sd * 7 : wkThr)
      : t.revenue_week || (sd ? sd * 7 * inv : wkThr);
    const tgtSet = !!(t.revenue_week || t.spend_week || sd);
    if (!tgtSet) noTarget.push(s.name);
    if (t.roas != null && t.roas < inv) {
      issues.push(`${s.name}: buyer's ROAS target ${t.roas.toFixed(2)} is below invoice ${inv.toFixed(2)} (invoice counts)`);
    }

    const st: DeckStoreRow = {
      key: s.key,
      name: s.name,
      buyer: label(s.buyer),
      spend_acct: s.spend_account,
      roas_wk_prev: roPrev ? roPrev.toFixed(2) : "—",
      roas_wk_now: roNow ? roNow.toFixed(2) : "—",
      week_delta: roNow && roPrev ? roNow - roPrev : null,
      wk_roas_ok: !!(roNow && roNow >= inv),
      rev_wk_txt: fmtDeck(cur, wkVal),
      rev_wk_tgt_txt: fmtDeck(cur, wkTgt),
      rev_wk_delta: wkPrev ? (wkVal - wkPrev) / wkPrev : null,
      // pill: always against the floor — a lower agreed target never turns a
      // below-floor week green
      wk_rev_ok: wkVal >= wkThr,
      rev_tgt_hit: tgtSet ? wkVal >= wkTgt : null,
      mtd_txt: fmtDeck(cur, mtd),
      mtd_ok: mtd >= floor,
      roas_mtd: romtd.toFixed(2),
      roas_target: inv.toFixed(2),
      roas_mtd_ok: romtd >= inv,
      month_ok: false,
      week_ok: false,
      source: s.source,
    };
    st.month_ok = st.mtd_ok && st.roas_mtd_ok;
    st.week_ok = st.wk_roas_ok && st.wk_rev_ok;

    const green = explicitGoal ? s.weekly_goal : (wkTgt >= wkThr && tgtSet) || st.week_ok;
    if (green) {
      goalStores.push([s.name, s.buyer]);
      if (st.week_ok) weekHit.push([s.name, s.buyer]);
    }
    // on/off track counts for slide 2 (last week judged on the floor rule)
    zc.now[st.week_ok ? "on" : "off"] += 1;
    if (sp) zc.prev[rp / sp >= inv && wkPrev >= wkThr ? "on" : "off"] += 1;
    tot[0] += rn;
    tot[1] += sn;
    tot[2] += rp;
    tot[3] += sp;
    rows.push({ ...st, _sort: [st.month_ok ? 1 : 0, floor ? mtd / floor : 0] });
  }

  // (month_ok, mtd / floor) ascending — exactly the script's sort
  rows.sort((a, b) => a._sort[0] - b._sort[0] || a._sort[1] - b._sort[1]);
  const storeRows: DeckStoreRow[] = rows.map(({ _sort, ...r }) => r);
  const onTrack = storeRows.filter((r) => r.month_ok).length;

  // NB: summed across currencies, as the approved deck does (slide 2).
  const [rn, sn, rp, sp] = tot;
  const d = (a: number, b: number) => (b ? (a - b) / b : null);
  const roasNow = sn ? rn / sn : 0;
  const roasPrev = sp ? rp / sp : 0;
  const signedPct = (x: number | null) => (x == null ? "—" : `${x >= 0 ? "+" : ""}${Math.round(x * 100)}%`);
  const week_data: DeckData["week_data"] = {
    spend: { now: fmtInt(sn), prev: fmtInt(sp), delta: d(sn, sp), delta_txt: signedPct(d(sn, sp)) },
    roas: {
      now: roasNow.toFixed(2),
      prev: roasPrev.toFixed(2),
      delta: roasNow - roasPrev,
      delta_txt: `${roasNow - roasPrev >= 0 ? "+" : ""}${(roasNow - roasPrev).toFixed(2)}`,
    },
    rev: { now: fmtInt(rn), prev: fmtInt(rp), delta: d(rn, rp), delta_txt: signedPct(d(rn, rp)) },
    status: { on: { now: zc.now.on, prev: zc.prev.on }, off: { now: zc.now.off, prev: zc.prev.off } },
  };

  const target = deckBuyers.reduce((a, b) => a + b.monthly_target_on_track, 0);
  const multi = deckBuyers.length > 1;
  const splitMonth = (): GoalSplit[] =>
    deckBuyers.map((b) => {
      const now = stores.filter((s) => s.buyer === b.buyer && storeRows.find((r) => r.key === s.key)?.month_ok).length;
      return {
        name: label(b.buyer),
        now,
        target: b.monthly_target_on_track,
        prev: prev?.by_buyer[b.buyer] ?? null,
        on_track: now >= b.monthly_target_on_track,
      };
    });
  const splitWeek = (): GoalSplit[] =>
    deckBuyers.map((b) => {
      const tg = goalStores.filter(([, x]) => x === b.buyer).length;
      const now = weekHit.filter(([, x]) => x === b.buyer).length;
      return { name: label(b.buyer), now, target: tg, prev: null, on_track: now >= tg };
    });
  const cards: GoalCard[] = [
    {
      name: "Monthly goal  ·  stores on track",
      target,
      prev: prev?.monthly ?? null,
      now: onTrack,
      on_track: onTrack >= target,
      split: multi ? splitMonth() : null,
    },
    {
      name: "Weekly goal  ·  stores in green this week",
      target: goalStores.length,
      prev: prev?.weekly ?? null,
      now: weekHit.length,
      on_track: weekHit.length >= goalStores.length,
      note: "green = ROAS ≥ invoice and revenue ≥ €5k",
      split: multi ? splitWeek() : null,
    },
  ];

  return {
    key: deck.key,
    stream: opts.stream,
    language: deck.language,
    week: String(opts.meetingWeek),
    data_week: String(opts.dataWeek),
    prev_week: String(opts.dataWeek - 1),
    data_period: opts.dataPeriod,
    week_data,
    stores: storeRows,
    goal: { cards },
    summary: {
      on_track: onTrack,
      weekly_goal_stores: goalStores.map(([n]) => n),
      green_this_week: weekHit.map(([n]) => n),
      no_target: noTarget,
      issues,
    },
  };
}

/** Last week's goal numbers, from last week's run row. */
export function prevGoalFrom(deck: DeckData | undefined): PrevGoal | null {
  if (!deck) return null;
  const [m, w] = deck.goal.cards;
  const by: Record<string, number> = {};
  for (const s of m?.split ?? []) by[s.name.toLowerCase()] = s.now;
  return { monthly: m?.now ?? null, weekly: w?.now ?? null, by_buyer: by };
}
