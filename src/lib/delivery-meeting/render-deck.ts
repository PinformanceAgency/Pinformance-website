/**
 * Delivery deck — one-to-one port of build_delivery_deck.py (python-pptx) to
 * pptxgenjs. Every coordinate below is the script's, in EMU, converted at the
 * call; change one only with Tristan's approval (the layout is approved).
 *
 * Slide 1 Goals · slide 2 Past week · then per store, off track first, at most
 * eight rows a page, and last the new stores that have no numbers yet (added
 * 30-09-2026 with Tristan's approval: a live store left off the deck gets no
 * plan). ROAS always before revenue. EN for dropship, NL labels
 * for branded.
 */
import PptxGenJS from "pptxgenjs";
import { readFileSync } from "fs";
import { join } from "path";
import type { DeckData, DeckStoreRow } from "./types";

const EMU = 914400;
const u = (emu: number) => emu / EMU;
const SW = 12192000;
const MARGIN = 502920;
const CW = SW - 2 * MARGIN;

const RED = "E8000D";
const ZRED = "E8192C";
const GREEN = "22A047";
const BLUE = "2F80ED";
const WHITE = "FFFFFF";
const GREY = "BBBBBB";
const DGREY = "808080";
const CARD = "141414";
const LINE = "2A2A2A";
const BLACK = "000000";
const LOST = "6B1218";
const LOST_T = "E05A62";

const NL: Record<string, string> = {
  "MONTHLY GOAL  +  WEEKLY GOAL": "MAANDDOEL  +  WEEKDOEL",
  Goals: "Doelen",
  "Monthly goal  ·  stores on track": "Maanddoel  ·  stores on track",
  "Weekly goal  ·  stores in green this week": "Weekdoel  ·  stores groen deze week",
  "green = ROAS ≥ invoice and revenue ≥ €5k": "groen = ROAS ≥ invoice en omzet ≥ €5k",
  "this week": "deze week",
  "last week ": "vorige week ",
  "On track last week": "Vorige week on track",
  "Added this week": "Erbij deze week",
  "Dropped out": "Afgevallen",
  "PAST WEEK": "AFGELOPEN WEEK",
  "Week %s vs week %s": "Week %s vs week %s",
  SPEND: "SPEND",
  REVENUE: "OMZET",
  "STORES THIS WEEK": "STORES DEZE WEEK",
  "PER STORE": "PER STORE",
  WEEK: "WEEK",
  MONTH: "MAAND",
  "ROAS  last → this  (target = invoice)": "ROAS  vorige → deze  (target = invoice)",
  "REVENUE  actual / target": "OMZET  actueel / target",
  "REVENUE MTD": "OMZET MTD",
  "ROAS MTD / TARGET": "ROAS MTD / TARGET",
  "New stores": "Nieuwe stores",
  "No data yet  ·  what is the plan for this store?": "Nog geen data  ·  wat is het plan voor deze store?",
};

type Run = [text: string, bold: boolean, color: string, size?: number];
type Slide = ReturnType<PptxGenJS["addSlide"]>;

let logoData: string | null = null;
function logo(): string | null {
  if (logoData !== null) return logoData || null;
  try {
    const buf = readFileSync(join(process.cwd(), "src/lib/delivery-meeting/assets/logo_red_only.png"));
    logoData = "image/png;base64," + buf.toString("base64");
  } catch {
    logoData = "";
  }
  return logoData || null;
}

export async function renderDeck(d: DeckData): Promise<Buffer> {
  const lang = d.language;
  const T = (s: string) => (lang === "NL" ? NL[s] ?? s : s);
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE"; // 13.333 × 7.5 in = 12192000 × 6858000 EMU
  const SHAPE = pptx.ShapeType;

  const rect = (
    s: Slide,
    x: number,
    y: number,
    w: number,
    h: number,
    fill: string | null,
    line: string | null = null,
    shape: "rect" | "round" | "oval" = "rect",
  ) => {
    const W = Math.max(w, 1);
    s.addShape(shape === "round" ? SHAPE.roundRect : shape === "oval" ? SHAPE.ellipse : SHAPE.rect, {
      x: u(x),
      y: u(y),
      w: u(W),
      h: u(h),
      fill: fill ? { color: fill } : { type: "none" },
      line: line ? { color: line, width: 0.75 } : { type: "none" },
      // python-pptx's default rounded-rectangle corner: adj 0.16667
      ...(shape === "round" ? { rectRadius: u(Math.min(W, h)) * 0.16667 } : {}),
    });
  };

  const txt = (
    s: Slide,
    x: number,
    y: number,
    w: number,
    h: number,
    runs: string | Run[],
    size = 12,
    bold = false,
    color = WHITE,
    align: "left" | "center" | "right" = "left",
    valign: "top" | "middle" = "top",
    objectName?: string,
  ) => {
    const list: Run[] = typeof runs === "string" ? [[runs, bold, color, size]] : runs;
    s.addText(
      list.map(([t, b, c, sz]) => ({
        text: t,
        options: { bold: b, color: c, fontSize: sz ?? size, fontFace: "Calibri" },
      })),
      {
        x: u(x),
        y: u(y),
        w: u(w),
        h: u(h),
        margin: 0,
        align,
        valign,
        wrap: true,
        fontFace: "Calibri",
        fontSize: size,
        ...(objectName ? { objectName } : {}),
      },
    );
  };

  const pill = (s: Slide, x: number, y: number, w: number, h: number, text: string, fill: string, size = 10) => {
    s.addText(text, {
      shape: SHAPE.roundRect,
      x: u(x),
      y: u(y),
      w: u(w),
      h: u(h),
      fill: { color: fill },
      line: { type: "none" },
      rectRadius: u(Math.min(w, h)) * 0.16667,
      margin: 0,
      align: "center",
      valign: "middle",
      fontFace: "Calibri",
      fontSize: size,
      bold: true,
      color: WHITE,
    });
  };

  const dot = (s: Slide, x: number, y: number, c = DGREY, dd = 170000) => rect(s, x, y, dd, dd, c, null, "oval");

  const legend = (s: Slide, x: number, y: number, items: [string, string][], gap = 2200000, size = 10) => {
    for (const [c, label] of items) {
      dot(s, x, y + 55000, c, 150000);
      txt(s, x + 240000, y, gap - 300000, 280000, label, size, false, GREY);
      x += gap;
    }
  };

  // Store Ranking's % change: plain text in the pill colours, no arrow
  // (Tristan, 02-10-2026 — the deck follows the page). Nothing when there is
  // no period before to compare with.
  const pctRun = (p: number | null | undefined): Run[] =>
    p == null ? [] : [[`  ${p > 0 ? "+" : ""}${p}%`, true, p > 0 ? GREEN : p < 0 ? ZRED : DGREY, 10]];

  // A cell is 1.33in wide, and with the % at the end the week revenue cell
  // ("€12,345  / €10,000  +23%") no longer fits at its own sizes — it would
  // wrap onto a second line and run into the row below. So the runs are
  // measured (Calibri advance widths, in em, with a margin for bold) and the
  // whole cell is scaled down just enough to stay on one line.
  const EM: Record<string, number> = { " ": 0.226, ".": 0.252, ",": 0.25, "/": 0.386, "+": 0.498, "-": 0.306, "%": 0.715, "→": 0.8, "✓": 0.8, "✗": 0.8, "—": 0.9 };
  const runWidthPt = (runs: Run[], base: number) =>
    runs.reduce((w, [t, b, , sz]) => {
      let em = 0;
      for (const ch of t) em += EM[ch] ?? (/[0-9€$£]/.test(ch) ? 0.507 : 0.52);
      return w + em * (sz ?? base) * (b ? 1.04 : 1);
    }, 0);
  // The factor is taken per column per slide, so the rows under one header
  // keep one size instead of each row shrinking by its own amount.
  const fitFactor = (runs: Run[], base: number, wEmu: number) =>
    Math.min(1, ((wEmu / 12700) * 0.97) / runWidthPt(runs, base)); // EMU → pt, with a little air
  const cell = (s: Slide, x: number, y: number, w: number, runs: Run[], base: number, f: number) => {
    const sc = (n: number) => (f >= 1 ? n : Math.floor(n * f * 2) / 2);
    txt(s, x, y, w, 300000, runs.map(([t, b, c, sz]) => [t, b, c, sc(sz ?? base)] as Run), sc(base), false, WHITE, "left", "middle");
  };

  const arrow = (delta: number | null | undefined): [string, string] => {
    if (delta == null) return ["—", DGREY];
    if (delta > 0) return ["▲", GREEN];
    if (delta < 0) return ["▼", ZRED];
    return ["●", DGREY];
  };

  // group per month status: off track first, then on track; max 8 rows per
  // page, split evenly
  const MAXR = 8;
  type GroupKey = "off" | "on" | "new";
  const groups: [GroupKey, number, number, number, DeckStoreRow[]][] = [];
  for (const key of ["off", "on", "new"] as const) {
    const grp = d.stores.filter((st) => (st.new_store ? "new" : st.month_ok ? "on" : "off") === key);
    if (!grp.length) continue;
    const nP = Math.ceil(grp.length / MAXR);
    const per = Math.ceil(grp.length / nP);
    for (let j = 0; j < nP; j++) groups.push([key, j + 1, nP, grp.length, grp.slice(j * per, (j + 1) * per)]);
  }
  const total = 2 + groups.length;
  const foot = `DELIVERY MEETING  ·  WEEK ${d.week}`;
  let pg = 0;
  let lastSlide: Slide | null = null;

  const base = (): Slide => {
    const s = pptx.addSlide();
    lastSlide = s;
    s.background = { color: BLACK };
    pg += 1;
    rect(s, 0, 0, SW, 88900, RED);
    const l = logo();
    if (l) s.addImage({ data: l, x: u(11567160), y: u(137160), w: u(475488), h: u(475488) });
    txt(s, MARGIN, 256032, 5486400, 274320, "Pinformance", 11, true, WHITE);
    txt(s, MARGIN, 6355080, 6486400, 365760, foot, 10, true, DGREY);
    txt(s, 10332720, 6355080, 1371600, 365760, `${String(pg).padStart(2, "0")} / ${String(total).padStart(2, "0")}`, 10, false, DGREY, "right");
    return s;
  };

  // ---------- 1 · goals ----------
  {
    const s = base();
    txt(s, MARGIN, 700000, CW, 330000, T("MONTHLY GOAL  +  WEEKLY GOAL"), 13, true, RED, "center");
    txt(s, MARGIN, 1020000, CW, 620000, T("Goals"), 36, true, WHITE, "center");
    const cards = d.goal.cards;
    const top = 1850000;
    const area = 3950000;
    const pitch = area / cards.length;
    cards.forEach((r, ri) => {
      const y = top + ri * pitch;
      const h = pitch - 180000;
      rect(s, MARGIN, y, CW, h, CARD, LINE);
      rect(s, MARGIN, y, 45000, h, RED);
      txt(s, MARGIN + 260000, y + 160000, 6000000, 400000, T(r.name), 20, true, WHITE);
      if (r.note) txt(s, MARGIN + 260000, y + 560000, 6000000, 300000, T(r.note), 12, false, GREY);
      if (r.split) {
        let sx = MARGIN + 260000;
        for (const sp of r.split) {
          dot(s, sx, y + 985000, sp.on_track == null ? DGREY : sp.on_track ? GREEN : ZRED, 170000);
          txt(s, sx + 240000, y + 930000, 2300000, 280000, `${sp.name}  ${sp.now} / ${sp.target}`, 14, true, WHITE);
          sx += 2600000;
        }
      }
      const { target: tgt, prev, now } = r;
      const runs: Run[] = [[`${now} / ${tgt}   `, true, WHITE, 32]];
      if (prev != null) {
        const diff = now - prev;
        const tw = T("this week");
        const dtxt = diff > 0 ? `+${diff} ${tw}` : diff < 0 ? `${diff} ${tw}` : `± 0 ${tw}`;
        runs.push([dtxt, true, diff > 0 ? BLUE : diff < 0 ? LOST_T : DGREY, 14]);
      }
      txt(s, MARGIN + CW - 6200000, y + 110000, 5940000, 700000, runs, 18, false, WHITE, "right");
      if (r.on_track != null) {
        pill(s, MARGIN + CW - 2100000 - 260000, y + 700000, 2100000, 280000, r.on_track ? "ON TRACK" : "OFF TRACK", r.on_track ? GREEN : ZRED, 10);
      }
      const bx = MARGIN + 260000;
      const bw = CW - 520000;
      const bh = 260000;
      const by = y + h - bh - 200000;
      rect(s, bx, by, bw, bh, LINE, null, "round");
      if (tgt) {
        const f = (v: number) => bw * Math.min(Math.max(v, 0) / tgt, 1);
        if (prev == null) {
          if (now) rect(s, bx, by, f(now), bh, RED, null, "round");
        } else if (now - prev >= 0) {
          if (now) rect(s, bx, by, f(now), bh, BLUE, null, "round");
          if (prev) rect(s, bx, by, f(prev), bh, RED, null, "round");
        } else {
          rect(s, bx, by, f(prev), bh, LOST, null, "round");
          if (now) rect(s, bx, by, f(now), bh, RED, null, "round");
        }
      }
    });
    legend(
      s,
      MARGIN,
      5930000,
      [
        [RED, T("On track last week")],
        [BLUE, T("Added this week")],
        [LOST, T("Dropped out")],
      ],
      3000000,
      9,
    );
  }

  // ---------- 2 · past week ----------
  {
    const w = d.week_data;
    const s = base();
    txt(s, MARGIN, 700000, CW, 330000, T("PAST WEEK") + (d.data_period ? "  ·  " + d.data_period : ""), 13, true, RED, "center");
    txt(s, MARGIN, 1020000, CW, 620000, T("Week %s vs week %s").replace("%s", d.data_week).replace("%s", d.prev_week), 36, true, WHITE, "center");
    const cw = (CW - 2 * 200000) / 3;
    const blocks: [string, "spend" | "roas" | "rev"][] = [
      ["SPEND", "spend"],
      ["ROAS", "roas"],
      [T("REVENUE"), "rev"],
    ];
    blocks.forEach(([lab, key], i) => {
      const x = MARGIN + i * (cw + 200000);
      const k = w[key];
      rect(s, x, 1950000, cw, 1850000, CARD, LINE);
      rect(s, x, 1950000, cw, 50000, RED);
      txt(s, x + 240000, 2150000, cw - 480000, 280000, lab, 11, true, RED);
      txt(s, x + 240000, 2480000, cw - 480000, 560000, k.now, 30, true, WHITE);
      const [a, c] = arrow(k.delta);
      txt(s, x + 240000, 3080000, cw - 480000, 320000, [[a + "  ", true, c, 14], [k.delta_txt ?? "—", true, c, 13]], 13);
      txt(s, x + 240000, 3430000, cw - 480000, 280000, T("last week ") + k.prev, 11, false, GREY);
    });
    txt(s, MARGIN, 4050000, CW, 280000, T("STORES THIS WEEK"), 11, true, RED);
    const tw2 = (CW - 200000) / 2;
    const zs: [string, "on" | "off", string][] = [
      ["On track", "on", GREEN],
      ["Off track", "off", ZRED],
    ];
    zs.forEach(([lab, key, colr], i) => {
      const x = MARGIN + i * (tw2 + 200000);
      const z = w.status[key];
      rect(s, x, 4380000, tw2, 1750000, CARD, LINE);
      dot(s, x + 260000, 4640000, colr, 340000);
      txt(s, x + 760000, 4560000, 2500000, 280000, lab.toUpperCase(), 11, true, colr);
      txt(s, x + 760000, 4800000, 2500000, 600000, String(z.now), 32, true, WHITE);
      const diff = z.now - z.prev;
      const good = key === "on" ? diff : -diff;
      const [a, c] = arrow(good);
      txt(s, x + 260000, 5620000, tw2 - 520000, 300000, [[a + "  ", true, c, 11], [T("last week ") + String(z.prev), false, GREY, 11]], 11);
    });
  }

  // ---------- 3+ · per store: WEEK (left) | MONTH (right) ----------
  const TITLE: Record<GroupKey, [string, string]> = { off: ["Off track", ZRED], on: ["On track", GREEN], new: [T("New stores"), WHITE] };
  const xStore = MARGIN + 200000;
  const wStore = 1900000;
  const xBuyer = xStore + wStore;
  const wBuyer = 650000;
  const blkX = xBuyer + wBuyer + 80000;
  const blkW = (MARGIN + CW - blkX - 120000) / 2;
  const subW = blkW / 2;
  const PW = 700000;
  const pill2 = (s: Slide, x: number, y: number, ok: boolean) =>
    pill(s, x, y, PW, 250000, ok ? "ON TRACK" : "OFF TRACK", ok ? GREEN : ZRED, 9);

  for (const [key, j, nP, nGrp, rows] of groups) {
    const s = base();
    const [title, tcol] = TITLE[key];
    txt(s, MARGIN, 620000, CW, 330000, "PER STORE" + (nP > 1 ? `   ${j} / ${nP}` : ""), 13, true, RED, "center");
    txt(s, MARGIN, 900000, CW, 520000, [[title, true, tcol, 30], [`   ${nGrp} store${nGrp === 1 ? "" : "s"}`, true, DGREY, 20]], 30, false, WHITE, "center");
    const top = 1480000;
    ["WEEK", T("MONTH")].forEach((lab, bi) => {
      const bx = blkX + bi * (blkW + 120000);
      rect(s, bx, top, blkW, 260000, CARD);
      rect(s, bx, top, blkW, 30000, RED);
      txt(s, bx, top + 40000, blkW, 220000, lab, 11, true, WHITE, "center", "middle");
    });
    const hy = top + 320000;
    txt(s, xStore, hy, wStore, 200000, "STORE", 9, true, DGREY);
    txt(s, xBuyer, hy, wBuyer, 200000, "BUYER", 9, true, DGREY);
    const subs = [
      [T("ROAS  last → this  (target = invoice)"), T("REVENUE  actual / target")],
      ["ROAS MTD / TARGET", T("REVENUE MTD")],
    ];
    for (let bi = 0; bi < 2; bi++) {
      for (let si = 0; si < 2; si++) {
        const sx = blkX + bi * (blkW + 120000) + si * subW;
        txt(s, sx + 60000, hy, subW - 120000, 200000, subs[bi][si], 9, true, DGREY);
      }
    }
    rect(s, MARGIN, hy + 240000, CW, 9000, LINE);
    const dvx = blkX + blkW + 60000;
    const rh = 470000;
    const y0 = hy + 300000;
    rect(s, dvx - 6000, top, 12000, 320000 + 300000 + rh * rows.length, RED);
    const tw = subW - PW - 140000;
    // the four cells of a row, ROAS before revenue, week before month
    const cellsOf = (st: DeckStoreRow): [Run[], number][] => [
      [[[(st.roas_wk_prev ?? "—") + " → ", false, DGREY, 12], [st.roas_wk_now ?? "—", true, WHITE, 14], ...pctRun(st.roas_wk_pct)], 14],
      [
        [
          [(st.rev_wk_txt ?? "—").replace("CHF ", "CHF"), true, WHITE, 13],
          [st.rev_wk_tgt_txt ? "  / " + st.rev_wk_tgt_txt.replace("CHF ", "") : "", false, DGREY, 9],
          ...pctRun(st.rev_wk_pct),
        ],
        13,
      ],
      [[[st.roas_mtd ?? "—", true, WHITE, 14], ["  /  " + (st.roas_target ?? "—"), false, DGREY, 12], ...pctRun(st.roas_mtd_pct)], 14],
      [[[st.mtd_txt ?? "—", true, WHITE, 14], [st.spend_acct ? " spend" : "", false, GREY, 10], ...pctRun(st.mtd_pct)], 14],
    ];
    const colF = [0, 1, 2, 3].map((ci) =>
      Math.min(1, ...rows.filter((st) => !st.new_store).map((st) => fitFactor(cellsOf(st)[ci][0], cellsOf(st)[ci][1], tw))),
    );
    rows.forEach((st, i) => {
      const y = y0 + i * rh;
      const h = rh - 50000;
      if (i % 2 === 0) rect(s, MARGIN, y, CW, h, CARD);
      rect(s, MARGIN, y, 40000, h, st.new_store ? DGREY : st.month_ok ? GREEN : ZRED);
      const cy = y + (h - 300000) / 2;
      const py = y + (h - 250000) / 2;
      txt(s, xStore, cy, wStore - 60000, 300000, st.name, 15, true, WHITE, "left", "middle");
      txt(s, xBuyer, cy, wBuyer - 40000, 300000, st.buyer ?? "", 13, false, GREY, "left", "middle");
      if (st.new_store) {
        txt(s, blkX + 60000, cy, 2 * blkW + 120000 - 120000, 300000, T("No data yet  ·  what is the plan for this store?"), 14, false, GREY, "left", "middle");
        return;
      }
      const cs = cellsOf(st);
      const xs = [blkX, blkX + subW, blkX + blkW + 120000, blkX + blkW + 120000 + subW];
      const oks = [st.wk_roas_ok, st.wk_rev_ok, st.roas_mtd_ok, st.mtd_ok];
      xs.forEach((x, ci) => {
        cell(s, x + 60000, cy, tw, cs[ci][0], cs[ci][1], colF[ci]);
        pill2(s, x + subW - PW - 40000, py, oks[ci]);
      });
    });
  }

  // The deck data, off-slide on the last slide (shape PINF_DATA), as the
  // script embedded it: the old skill reads last week's month status from it.
  // The cron itself reads last week from its own run row.
  if (lastSlide) txt(lastSlide, SW + 200000, 0, 3000000, 300000, JSON.stringify(d), 1, false, DGREY, "left", "top", "PINF_DATA");

  const out = await pptx.write({ outputType: "nodebuffer" });
  return out as Buffer;
}
