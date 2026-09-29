/**
 * Tycho's prep — port of build_prep.py. The script rendered HTML with
 * WeasyPrint; there is no headless browser on Vercel, so this draws the same
 * page with pdf-lib, at the script's own measurements (in mm, from its CSS).
 *
 * Landscape 16:9 (338.67 × 190.5 mm), black, red bar, logo, "Off track" /
 * "On track" (green) titles, ONE store a page (29-09-2026: two a page left the
 * deep dive two lines, and the deep dive is Tycho's own insight — the part of
 * the prep that matters most). Per store: name · buyer · WEEK ON/OFF TRACK
 * pill and the numbers line across the top; below it LAST WEEK / RESULT / ASK
 * (bold) in a narrow left column and TYCHO'S DEEP DIVE, one finding per
 * bullet, in a wide panel on the right.
 *
 * Nothing is cut off: a column whose text does not fit is set again a size
 * smaller, down to 9 pt, and only then shortened — and a shortened page is
 * reported, never silent.
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
const PANEL = hex("#1E1E1E");

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

  // pages: per section, off track then on track, one store a page — kept
  // inside each deck's section so the branded prep runs Rens's deck order,
  // then Louiza's
  const pages: { kicker: string; title: string; count: number; index: number; st: PrepStore }[] = [];
  for (const sec of opts.sections) {
    for (const [title, list] of [
      ["Off track", sec.stores.filter((s) => !s.month_ok)],
      ["On track", sec.stores.filter((s) => s.month_ok)],
    ] as const) {
      list.forEach((st, i) => pages.push({ kicker: sec.kicker, title, count: list.length, index: i + 1, st }));
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
      { t: `${pg.index} of ${pg.count}`, font: fonts.bold, size: 16, color: LIGHT },
    ];
    const tw = tSegs.reduce((a, s) => a + s.font.widthOfTextAtSize(s.t, s.size) + (s.gapAfter ?? 0), 0);
    const titleTop = 12 * MM + 10 * 1.22;
    drawSegs(page, tSegs, (W - tw) / 2, H - titleTop - 26 * 0.95);

    // the card fills the page between the title and the footer
    const cardTop = titleTop + 26 * 1.22 + 4 * MM;
    drawCard(page, fonts, pg.st, 14 * MM, H - cardTop, W - 28 * MM, H - cardTop - 12 * MM, shortened);

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

  cy -= 3 * MM;

  // two columns: the buyer's week on the left, Tycho's deep dive on the right
  const b = st.brief;
  const bottom = yTop - h + 5 * MM;
  const gap = 6 * MM;
  const leftW = cw * 0.36;
  const rightX = cx + leftW + gap;
  const rightW = cw - leftW - gap;

  const left: Block[] = [
    { lab: "LAST WEEK", text: b?.did ?? "", font: fonts.reg, color: WHITE },
    { lab: "RESULT", text: b?.result ?? "", font: fonts.reg, color: WHITE },
    { lab: "ASK", text: b?.ask ?? "", font: fonts.bold, color: WHITE },
  ].filter((r) => r.text);
  let cut = drawColumn(page, fonts, left, cx, cy, leftW, cy - bottom, 13);

  // deep dive panel
  const panelTop = cy + 1.5 * MM;
  page.drawRectangle({ x: rightX - 4 * MM, y: bottom - 2 * MM, width: rightW + 4 * MM, height: panelTop - bottom + 2 * MM, color: PANEL });
  page.drawRectangle({ x: rightX - 4 * MM, y: bottom - 2 * MM, width: 0.8 * MM, height: panelTop - bottom + 2 * MM, color: RED });
  const dd = b?.deep_dive?.trim();
  const ddTop = cy - 1.5 * MM;
  page.drawText("TYCHO'S DEEP DIVE", { x: rightX, y: ddTop - 11 * 0.95, size: 11, font: fonts.bold, color: RED });
  const bodyTop = ddTop - 11 * 1.22 - 3 * MM;
  if (dd) {
    const bullets = dd.split(/\n+/).map((l) => l.replace(/^\s*[•\-*]\s*/, "").trim()).filter(Boolean);
    cut = drawBullets(page, fonts, bullets, rightX, bodyTop, rightW - 4 * MM, bodyTop - bottom, 15) || cut;
  } else {
    page.drawText("Not in this week's deep dive.", { x: rightX, y: bodyTop - 13 * 1.05, size: 13, font: fonts.reg, color: GREY });
  }
  if (cut) shortened.push(st.name);
}

type Block = { lab: string; text: string; font: PDFFont; color: ReturnType<typeof rgb> };

/** Labelled blocks in one column, at the largest size that fits. Returns
 *  whether anything had to be shortened. */
function drawColumn(page: PDFPage, fonts: Fonts, rows: Block[], x: number, yTop: number, w: number, avail: number, maxSize: number): boolean {
  const S = (f: PDFFont, s: string) => safe(f, s);
  const labH = 9.5 * 1.25;
  let size = maxSize;
  let laid: (Block & { lines: string[] })[] = [];
  const need = () => laid.reduce((a, r) => a + labH + r.lines.length * size * 1.3 + 3.5 * MM, 0) - 3.5 * MM;
  for (; size >= 9; size -= 0.5) {
    laid = rows.map((r) => ({ ...r, lines: wrap(S(r.font, r.text), r.font, size, w) }));
    if (need() <= avail) break;
  }
  let cut = false;
  if (size < 9) {
    size = 9;
    cut = true;
    let left = avail;
    laid = laid.map((r) => {
      left -= labH;
      const fit = Math.max(0, Math.floor((left + 0.01) / (size * 1.3)));
      const lines = r.lines.slice(0, fit);
      if (lines.length < r.lines.length && lines.length) lines[lines.length - 1] = lines[lines.length - 1].replace(/\s*\S*$/, "") + " ...";
      left -= lines.length * size * 1.3 + 3.5 * MM;
      return { ...r, lines };
    });
  }
  let cy = yTop;
  for (const r of laid) {
    if (!r.lines.length) continue;
    page.drawText(r.lab, { x, y: cy - 9.5 * 0.95, size: 9.5, font: fonts.bold, color: RED });
    cy -= labH;
    for (const line of r.lines) {
      page.drawText(line, { x, y: cy - size * 1.05, size, font: r.font, color: r.color });
      cy -= size * 1.3;
    }
    cy -= 3.5 * MM;
  }
  return cut;
}

/** One finding per bullet, hanging indent, at the largest size that fits. */
function drawBullets(page: PDFPage, fonts: Fonts, bullets: string[], x: number, yTop: number, w: number, avail: number, maxSize: number): boolean {
  const indent = 5 * MM;
  const gapB = 2.8 * MM;
  let size = maxSize;
  let laid: string[][] = [];
  const need = () => laid.reduce((a, l) => a + l.length * size * 1.3 + gapB, 0) - gapB;
  for (; size >= 9; size -= 0.5) {
    laid = bullets.map((t) => wrap(safe(fonts.reg, t), fonts.reg, size, w - indent));
    if (need() <= avail) break;
  }
  let cut = false;
  if (size < 9) {
    size = 9;
    cut = true;
    let left = avail;
    laid = laid.map((lines) => {
      const fit = Math.max(0, Math.floor((left + 0.01) / (size * 1.3)));
      const kept = lines.slice(0, fit);
      if (kept.length < lines.length && kept.length) kept[kept.length - 1] = kept[kept.length - 1].replace(/\s*\S*$/, "") + " ...";
      left -= kept.length * size * 1.3 + gapB;
      return kept;
    });
  }
  let cy = yTop;
  for (const lines of laid) {
    if (!lines.length) continue;
    page.drawText("•", { x, y: cy - size * 1.05, size, font: fonts.bold, color: RED });
    for (const line of lines) {
      page.drawText(line, { x: x + indent, y: cy - size * 1.05, size, font: fonts.reg, color: WHITE });
      cy -= size * 1.3;
    }
    cy -= gapB;
  }
  return cut;
}
