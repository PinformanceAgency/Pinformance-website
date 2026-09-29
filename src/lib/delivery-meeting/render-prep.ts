/**
 * Tycho's prep — port of build_prep.py. The script rendered HTML with
 * WeasyPrint; there is no headless browser on Vercel, so this draws the same
 * page with pdf-lib, at the script's own measurements (in mm, from its CSS).
 *
 * Landscape 16:9 (338.67 × 190.5 mm), black, red bar, logo, "Off track" /
 * "On track" (green) titles, two stores a page. Per store: name · buyer ·
 * WEEK ON/OFF TRACK pill, the numbers line, then LAST WEEK / RESULT / ASK
 * (bold) / DEEP DIVE.
 *
 * Nothing is cut off: a card whose text does not fit at 13 pt is set again a
 * size smaller, down to 9 pt, and only then shortened — and a shortened card
 * is reported, never silent.
 */
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFileSync } from "fs";
import { join } from "path";
import type { PrepStore } from "./briefs";

const MM = 72 / 25.4;
const W = 338.67 * MM;
const H = 190.5 * MM;
const hex = (h: string) => {
  const n = parseInt(h.replace("#", ""), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};
const BG = hex("#000000");
const CARD = hex("#141414");
const RED = hex("#E8192C");
const GREEN = hex("#1DB954");
const GREY = hex("#808080");
const LIGHT = hex("#BBBBBB");
const WHITE = hex("#FFFFFF");
const PILL_NONE = hex("#2A2A2A");

// No subsetting: pdf-lib's subsetter dropped glyphs from Carlito ("Pn rm n"
// for "Pinformance"). No ligatures: fontkit's "ti"/"ft" ligatures were drawn
// with the width of two glyphs, leaving a gap ("starti ng").
const FONT_OPTS = { subset: false, features: { liga: false, clig: false, dlig: false, rlig: false } };

const asset = (f: string) => readFileSync(join(process.cwd(), "src/lib/delivery-meeting/assets", f));

export interface PrepSection {
  kicker: string;
  stores: PrepStore[];
}

interface Fonts {
  reg: PDFFont;
  bold: PDFFont;
}

type Seg = { t: string; font: PDFFont; size: number; color: ReturnType<typeof rgb>; gapAfter?: number };

function drawSegs(page: PDFPage, segs: Seg[], x: number, baseline: number) {
  let cx = x;
  for (const s of segs) {
    if (s.t) page.drawText(s.t, { x: cx, y: baseline, size: s.size, font: s.font, color: s.color });
    cx += s.font.widthOfTextAtSize(s.t, s.size) + (s.gapAfter ?? 0);
  }
  return cx;
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\n+/)) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? line + " " + word : word;
      if (font.widthOfTextAtSize(next, size) <= width || !line) line = next;
      else {
        out.push(line);
        line = word;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

/** Characters the embedded font cannot draw are swapped, never dropped. */
const charsets = new WeakMap<PDFFont, Set<number>>();
function safe(font: PDFFont, s: string): string {
  let set = charsets.get(font);
  if (!set) {
    set = new Set(font.getCharacterSet());
    charsets.set(font, set);
  }
  const swaps: Record<string, string> = { "→": "->", "–": "-", "—": "-", "’": "'", "‘": "'", "“": '"', "”": '"', "…": "...", "≥": ">=", "✓": "v", "✗": "x" };
  let out = "";
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (set.has(cp) || ch === " ") out += ch;
    else out += swaps[ch] ?? (/\s/.test(ch) ? " " : "");
  }
  return out;
}

export async function renderPrep(opts: {
  sections: PrepSection[];
  footer: string;
}): Promise<{ pdf: Buffer; shortened: string[] }> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fonts: Fonts = {
    reg: await doc.embedFont(asset("Carlito-Regular.ttf"), FONT_OPTS),
    bold: await doc.embedFont(asset("Carlito-Bold.ttf"), FONT_OPTS),
  };
  let logo: Awaited<ReturnType<PDFDocument["embedPng"]>> | null = null;
  try {
    logo = await doc.embedPng(asset("logo_red_only.png"));
  } catch {
    logo = null;
  }
  const S = (f: PDFFont, s: string) => safe(f, s);
  const shortened: string[] = [];

  // pages: per section, off track then on track, two stores a page — the
  // script's grouping, kept inside each deck's section so the branded prep
  // runs Rens's deck order, then Louiza's
  const pages: { kicker: string; title: string; count: number; chunk: PrepStore[] }[] = [];
  for (const sec of opts.sections) {
    for (const [title, list] of [
      ["Off track", sec.stores.filter((s) => !s.month_ok)],
      ["On track", sec.stores.filter((s) => s.month_ok)],
    ] as const) {
      for (let i = 0; i < list.length; i += 2) pages.push({ kicker: sec.kicker, title, count: list.length, chunk: list.slice(i, i + 2) });
    }
  }

  pages.forEach((pg, pi) => {
    const page = doc.addPage([W, H]);
    const top = (mm: number) => H - mm * MM;
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: BG });
    page.drawRectangle({ x: 0, y: top(2.2), width: W, height: 2.2 * MM, color: RED });
    page.drawText("Pinformance", { x: 9 * MM, y: top(6) - 10 * 0.95, size: 10, font: fonts.bold, color: WHITE });
    if (logo) page.drawImage(logo, { x: W - 8 * MM - 11 * MM, y: top(4.5) - 11 * MM, width: 11 * MM, height: 11 * MM });

    // kicker + title, centered
    const kicker = S(fonts.bold, pg.kicker);
    page.drawText(kicker, {
      x: (W - fonts.bold.widthOfTextAtSize(kicker, 10)) / 2,
      y: top(12) - 10 * 0.95,
      size: 10,
      font: fonts.bold,
      color: RED,
    });
    const tcol = pg.title === "On track" ? GREEN : RED;
    const tSegs: Seg[] = [
      { t: pg.title, font: fonts.bold, size: 26, color: tcol, gapAfter: 3 * MM },
      { t: `${pg.count} stores`, font: fonts.bold, size: 16, color: LIGHT },
    ];
    const tw = tSegs.reduce((a, s) => a + s.font.widthOfTextAtSize(s.t, s.size) + (s.gapAfter ?? 0), 0);
    const titleTop = 12 * MM + 10 * 1.22;
    drawSegs(page, tSegs, (W - tw) / 2, H - titleTop - 26 * 0.95);

    // from the top, in pt — measured against the WeasyPrint original: its
    // title box is shorter than 1.22 × 26 pt, so the first card sits 3.4 mm
    // higher than the naive sum
    let y = titleTop + 26 * 1.22 + 0.6 * MM;
    for (const st of pg.chunk) {
      y += 3.5 * MM;
      drawCard(page, fonts, st, 14 * MM, H - y, W - 28 * MM, 63 * MM, shortened);
      y += 63 * MM;
    }

    const foot = S(fonts.bold, opts.footer);
    page.drawText(foot, { x: 14 * MM, y: 6 * MM, size: 8, font: fonts.bold, color: GREY });
    const num = `${String(pi + 1).padStart(2, "0")} / ${String(pages.length).padStart(2, "0")}`;
    page.drawText(num, { x: W - 14 * MM - fonts.bold.widthOfTextAtSize(num, 8), y: 6 * MM, size: 8, font: fonts.bold, color: GREY });
  });

  return { pdf: Buffer.from(await doc.save()), shortened };
}

/** A filled rectangle with rounded corners (the pill's border-radius: 1mm). */
function roundRect(page: PDFPage, x: number, y: number, w: number, h: number, r: number, color: ReturnType<typeof rgb>) {
  // drawSvgPath's origin is the top-left of the path, y growing downward
  const d = `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`;
  page.drawSvgPath(d, { x, y: y + h, color, borderWidth: 0 });
}

function drawCard(
  page: PDFPage,
  fonts: Fonts,
  st: PrepStore,
  x: number,
  yTop: number,
  w: number,
  h: number,
  shortened: string[],
) {
  const S = (f: PDFFont, s: string) => safe(f, s);
  page.drawRectangle({ x, y: yTop - h, width: w, height: h, color: CARD });
  page.drawRectangle({ x, y: yTop - h, width: 1.2 * MM, height: h, color: st.month_ok ? GREEN : RED });
  const cx = x + 1.2 * MM + 6 * MM;
  const cw = w - 1.2 * MM - 12 * MM;
  let cy = yTop - 4 * MM; // top of the content box

  // head: name, buyer, pill
  const headH = 16 * 1.22;
  drawSegs(
    page,
    [
      { t: S(fonts.bold, st.name), font: fonts.bold, size: 16, color: WHITE, gapAfter: 3 * MM },
      { t: S(fonts.reg, st.buyer), font: fonts.reg, size: 11, color: LIGHT },
    ],
    cx,
    cy - 16 * 0.95,
  );
  const pillText = st.status === "on" ? "WEEK ON TRACK" : st.status === "off" ? "WEEK OFF TRACK" : "NO DATA";
  const pw = fonts.bold.widthOfTextAtSize(pillText, 8) + 5.2 * MM;
  const ph = 8 * 1.2 + 1.2 * MM;
  const px = cx + cw - pw;
  const py = cy - headH / 2 - ph / 2;
  roundRect(page, px, py, pw, ph, 1 * MM, st.status === "on" ? GREEN : st.status === "off" ? RED : PILL_NONE);
  page.drawText(pillText, { x: px + 2.6 * MM, y: py + 0.6 * MM + 8 * 0.3, size: 8, font: fonts.bold, color: WHITE });
  cy -= headH;

  // numbers line
  cy -= 1.5 * MM;
  const n = st.numbers;
  const pct = (p: number | null): Seg[] =>
    p == null ? [] : [{ t: ` ${p >= 0 ? "+" : ""}${Math.round(p)}%`, font: fonts.reg, size: 12, color: p >= 0 ? GREEN : RED }];
  const k = (t: string): Seg => ({ t, font: fonts.bold, size: 8, color: GREY, gapAfter: 1.5 * MM });
  const segs: Seg[] = [
    k("ROAS"),
    { t: S(fonts.reg, `${n.roas_prev} → `), font: fonts.reg, size: 12, color: LIGHT },
    { t: S(fonts.bold, n.roas), font: fonts.bold, size: 12, color: WHITE },
    ...pct(n.roas_pct),
    { t: S(fonts.reg, ` / ${n.invoice}`), font: fonts.reg, size: 12, color: GREY, gapAfter: 4 * MM },
    { t: "·", font: fonts.reg, size: 12, color: GREY, gapAfter: 4 * MM },
    k(n.volume_label.toUpperCase()),
    { t: S(fonts.reg, `${n.volume_prev} → `), font: fonts.reg, size: 12, color: LIGHT },
    { t: S(fonts.bold, n.volume), font: fonts.bold, size: 12, color: WHITE },
    ...pct(n.volume_pct),
    { t: S(fonts.reg, ` / ${n.target}`), font: fonts.reg, size: 12, color: GREY },
  ];
  drawSegs(page, segs, cx, cy - 12 * 0.95);
  cy -= 12 * 1.22 + 2.5 * MM;

  // the four blocks, set at the largest size that fits
  const b = st.brief;
  const rows: { lab: string; text: string; font: PDFFont; color: ReturnType<typeof rgb> }[] = [
    { lab: "LAST WEEK", text: b?.did ?? "", font: fonts.reg, color: WHITE },
    { lab: "RESULT", text: b?.result ?? "", font: fonts.reg, color: WHITE },
    { lab: "ASK", text: b?.ask ?? "", font: fonts.bold, color: WHITE },
    { lab: "DEEP DIVE", text: b?.deep_dive || "Not in this week’s deep dive.", font: fonts.reg, color: LIGHT },
  ].filter((r) => r.text);
  const bottom = yTop - h + 4 * MM;
  const avail = cy - bottom;
  const textX = cx + 26 * MM + 4 * MM;
  const textW = cw - 26 * MM - 4 * MM;

  let size = 13;
  let laid: { lab: string; lines: string[]; font: PDFFont; color: ReturnType<typeof rgb> }[] = [];
  for (; size >= 9; size -= 0.5) {
    laid = rows.map((r) => ({ ...r, lines: wrap(S(r.font, r.text), r.font, size, textW) }));
    const need = laid.reduce((a, r) => a + r.lines.length * size * 1.3 + 2.4 * MM, 0) - 2.4 * MM;
    if (need <= avail) break;
  }
  if (size < 9) {
    size = 9;
    shortened.push(st.name);
    let left = avail;
    laid = laid.map((r) => {
      const fit = Math.max(0, Math.floor((left + 0.01) / (size * 1.3)));
      const lines = r.lines.slice(0, fit);
      if (lines.length < r.lines.length && lines.length) lines[lines.length - 1] = lines[lines.length - 1].replace(/\s*\S*$/, "") + " ...";
      left -= lines.length * size * 1.3 + 2.4 * MM;
      return { ...r, lines };
    });
  }
  for (const r of laid) {
    if (!r.lines.length) continue;
    page.drawText(r.lab, { x: cx, y: cy - 0.8 * MM - 9.5 * 0.95, size: 9.5, font: fonts.bold, color: RED });
    for (const line of r.lines) {
      page.drawText(line, { x: textX, y: cy - size * 1.05, size, font: r.font, color: r.color });
      cy -= size * 1.3;
    }
    cy -= 2.4 * MM;
  }
}
