/**
 * Minimal OOXML helpers for hand-building Word documents. Used by the
 * Media Buying report generator which has to compose a doc dynamically
 * (variable sections + dimension breakdowns) — docxtemplater is too rigid
 * for that shape.
 *
 * Visual style aims to match what Word renders by default with subtle
 * Pinformance accents: 28pt centered title, 11pt body, 10pt table cells,
 * 8000-series greys, single 4px borders on tables.
 */
import PizZip from "pizzip";
import { readFile } from "fs/promises";
import path from "path";

export function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export interface ParaOpts {
  bold?: boolean;
  italic?: boolean;
  /** Half-points. 22 = 11pt body, 28 = 14pt subtitle, 56 = 28pt title. */
  sizeHalfPt?: number;
  /** Hex color like "6B7280" (no leading #). */
  color?: string;
  align?: "left" | "center" | "right";
  /** Twentieths of a point (twips). 240 ≈ 12pt of space. */
  spaceBefore?: number;
  spaceAfter?: number;
  /** Indent in twips (left). */
  indent?: number;
}

/** Build a paragraph from plain text. Multi-line text is split on \n. */
export function p(text: string, opts: ParaOpts = {}): string {
  const lines = text.split("\n");
  return lines
    .map((line, i) => makeParagraph(line, opts, i === lines.length - 1))
    .join("");
}

/** Build a paragraph that references a named Word style (Heading1, Title, etc.).
 *  Used to lean on the template's pre-defined styles so the doc inherits its
 *  fonts/colors/spacing. Word's TOC field also picks these up. */
export function styledP(
  text: string,
  styleId: string,
  extra: ParaOpts = {}
): string {
  const pPr: string[] = [`<w:pStyle w:val="${styleId}"/>`];
  if (extra.align) pPr.push(`<w:jc w:val="${extra.align}"/>`);
  if (extra.spaceBefore != null || extra.spaceAfter != null) {
    pPr.push(
      `<w:spacing w:before="${extra.spaceBefore ?? 0}" w:after="${extra.spaceAfter ?? 0}"/>`
    );
  }
  const rPr: string[] = [];
  if (extra.bold) rPr.push("<w:b/>");
  if (extra.italic) rPr.push("<w:i/>");
  if (extra.sizeHalfPt != null) {
    rPr.push(`<w:sz w:val="${extra.sizeHalfPt}"/>`);
    rPr.push(`<w:szCs w:val="${extra.sizeHalfPt}"/>`);
  }
  if (extra.color) rPr.push(`<w:color w:val="${extra.color}"/>`);
  const rPrXml = rPr.length ? `<w:rPr>${rPr.join("")}</w:rPr>` : "";
  return (
    `<w:p><w:pPr>${pPr.join("")}</w:pPr>` +
    `<w:r>${rPrXml}<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>` +
    `</w:p>`
  );
}

/** Word "Heading 1" — picked up by the TOC field for chapter entries.
 *  Adds a page break before so each chapter starts on a new page.
 *  Overrides the template's red color to dark slate so the doc reads
 *  like the dashboard (which uses dark headings, not branded red). */
export function chapterHeading(text: string, addPageBreak: boolean = true): string {
  const pageBreak = addPageBreak
    ? `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`
    : "";
  return (
    pageBreak +
    styledP(text, "Heading1", {
      color: "111827",
      sizeHalfPt: 44, // 22pt — chapter scale
      spaceBefore: 0,
      spaceAfter: 80,
    })
  );
}

/** Word "Heading 2" — used for sub-sections within a chapter. Shows up in
 *  the TOC under its parent Heading 1. Dashboard-style dark color, smaller. */
export function sectionHeading(text: string): string {
  return styledP(text, "Heading2", {
    color: "111827",
    sizeHalfPt: 32, // 16pt
    spaceBefore: 240,
    spaceAfter: 60,
  });
}

/**
 * A horizontal rule (thin red Pinformance accent line) — placed under
 * chapter headings for emphasis.
 */
export function chapterRule(): string {
  return (
    `<w:p><w:pPr>` +
    `<w:spacing w:before="0" w:after="200"/>` +
    `<w:pBdr><w:bottom w:val="single" w:sz="18" w:space="1" w:color="ED1C24"/></w:pBdr>` +
    `</w:pPr></w:p>`
  );
}

/** A subtle full-width grey divider — used between major sections in
 *  chapters where a page break would be too aggressive. */
export function thinDivider(): string {
  return (
    `<w:p><w:pPr>` +
    `<w:spacing w:before="120" w:after="120"/>` +
    `<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="E5E7EB"/></w:pBdr>` +
    `</w:pPr></w:p>`
  );
}

/** Word TOC field. Word auto-populates page numbers on first open ("Update
 *  fields?" prompt). The pre-rendered text is what readers see before the
 *  field is updated. */
export function tocField(): string {
  return (
    `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t xml:space="preserve">Table of Contents</w:t></w:r></w:p>` +
    `<w:p>` +
    `<w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r>` +
    `<w:r><w:instrText xml:space="preserve"> TOC \\o "1-2" \\h \\z \\u </w:instrText></w:r>` +
    `<w:r><w:fldChar w:fldCharType="separate"/></w:r>` +
    `<w:r><w:rPr><w:i/><w:color w:val="9CA3AF"/></w:rPr>` +
    `<w:t xml:space="preserve">Right-click here and choose "Update field" to populate page numbers, or update fields when prompted on first open.</w:t></w:r>` +
    `<w:r><w:fldChar w:fldCharType="end"/></w:r>` +
    `</w:p>`
  );
}

function makeParagraph(text: string, opts: ParaOpts, isLast: boolean): string {
  const pPr: string[] = [];
  if (opts.align) {
    pPr.push(`<w:jc w:val="${opts.align}"/>`);
  }
  if (opts.spaceBefore != null || (opts.spaceAfter != null && isLast)) {
    const before = opts.spaceBefore ?? 0;
    const after = isLast ? (opts.spaceAfter ?? 0) : 0;
    pPr.push(`<w:spacing w:before="${before}" w:after="${after}"/>`);
  }
  if (opts.indent != null) {
    pPr.push(`<w:ind w:left="${opts.indent}"/>`);
  }
  const rPr: string[] = [];
  if (opts.bold) rPr.push("<w:b/>");
  if (opts.italic) rPr.push("<w:i/>");
  if (opts.sizeHalfPt != null) {
    rPr.push(`<w:sz w:val="${opts.sizeHalfPt}"/>`);
    rPr.push(`<w:szCs w:val="${opts.sizeHalfPt}"/>`);
  }
  if (opts.color) {
    rPr.push(`<w:color w:val="${opts.color}"/>`);
  }
  const pPrXml = pPr.length ? `<w:pPr>${pPr.join("")}</w:pPr>` : "";
  const rPrXml = rPr.length ? `<w:rPr>${rPr.join("")}</w:rPr>` : "";
  return `<w:p>${pPrXml}<w:r>${rPrXml}<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`;
}

/** Document title (28pt bold centered). */
export function title(text: string): string {
  return p(text, { bold: true, sizeHalfPt: 56, align: "center", spaceAfter: 60 });
}

/** Subtitle (14pt muted, centered). */
export function subtitle(text: string): string {
  return p(text, { sizeHalfPt: 28, align: "center", color: "6B7280", spaceAfter: 360 });
}

/** Section heading (Heading 1 — 18pt bold). */
export function h1(text: string): string {
  return p(text, { bold: true, sizeHalfPt: 36, spaceBefore: 360, spaceAfter: 120 });
}

/** Sub-section heading (Heading 2 — 14pt semibold). */
export function h2(text: string): string {
  return p(text, { bold: true, sizeHalfPt: 28, spaceBefore: 240, spaceAfter: 80 });
}

/** Description text (10pt muted). */
export function muted(text: string): string {
  return p(text, { sizeHalfPt: 20, color: "6B7280", spaceAfter: 120 });
}

/** Page break. */
export function pageBreak(): string {
  return `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
}

/** Visual gap between sections. */
export function spacer(twips: number = 240): string {
  return `<w:p><w:pPr><w:spacing w:after="${twips}"/></w:pPr></w:p>`;
}

export interface TableCellOpts {
  /** Hex shading color (no leading #) — e.g. "F3F4F6" for muted header. */
  shading?: string;
  bold?: boolean;
  italic?: boolean;
  /** Text color hex. */
  color?: string;
  /** Font size in half-points (sz). Default 20 = 10pt. */
  sizeHalfPt?: number;
  align?: "left" | "center" | "right";
  /** Vertical alignment: top / center / bottom. */
  vAlign?: "top" | "center" | "bottom";
  /** Override top/bottom padding in twips. */
  paddingTwips?: number;
  /** Per-side borders override. Color hex, no leading #. */
  borders?: {
    top?: { sz: number; color: string };
    bottom?: { sz: number; color: string };
    left?: { sz: number; color: string };
    right?: { sz: number; color: string };
  };
}

/** Single cell ("td"). Width is given in DXA twips (1/20 of a pt). */
export function tc(
  text: string,
  widthDxa: number,
  opts: TableCellOpts = {}
): string {
  const shading = opts.shading
    ? `<w:shd w:val="clear" w:color="auto" w:fill="${opts.shading}"/>`
    : "";
  const vAlign = opts.vAlign
    ? `<w:vAlign w:val="${opts.vAlign}"/>`
    : `<w:vAlign w:val="center"/>`;
  const borders = opts.borders
    ? `<w:tcBorders>${
        opts.borders.top
          ? `<w:top w:val="single" w:sz="${opts.borders.top.sz}" w:space="0" w:color="${opts.borders.top.color}"/>`
          : ""
      }${
        opts.borders.bottom
          ? `<w:bottom w:val="single" w:sz="${opts.borders.bottom.sz}" w:space="0" w:color="${opts.borders.bottom.color}"/>`
          : ""
      }${
        opts.borders.left
          ? `<w:left w:val="single" w:sz="${opts.borders.left.sz}" w:space="0" w:color="${opts.borders.left.color}"/>`
          : ""
      }${
        opts.borders.right
          ? `<w:right w:val="single" w:sz="${opts.borders.right.sz}" w:space="0" w:color="${opts.borders.right.color}"/>`
          : ""
      }</w:tcBorders>`
    : "";
  const padding = opts.paddingTwips ?? 80;
  const margins = `<w:tcMar><w:top w:w="${padding}" w:type="dxa"/><w:bottom w:w="${padding}" w:type="dxa"/><w:left w:w="120" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tcMar>`;
  const tcPr =
    `<w:tcPr>` +
    `<w:tcW w:w="${widthDxa}" w:type="dxa"/>` +
    shading +
    borders +
    margins +
    vAlign +
    `</w:tcPr>`;
  const pPr: string[] = [];
  if (opts.align) pPr.push(`<w:jc w:val="${opts.align}"/>`);
  pPr.push(`<w:spacing w:before="20" w:after="20"/>`);
  const rPr: string[] = [];
  if (opts.bold) rPr.push("<w:b/>");
  if (opts.italic) rPr.push("<w:i/>");
  if (opts.color) rPr.push(`<w:color w:val="${opts.color}"/>`);
  const size = opts.sizeHalfPt ?? 20;
  rPr.push(`<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>`);
  const rPrXml = rPr.length ? `<w:rPr>${rPr.join("")}</w:rPr>` : "";
  return (
    `<w:tc>${tcPr}<w:p><w:pPr>${pPr.join("")}</w:pPr>` +
    `<w:r>${rPrXml}<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>` +
    `</w:p></w:tc>`
  );
}

/** Single table row from already-rendered cells. */
export function tr(cells: string[]): string {
  return `<w:tr>${cells.join("")}</w:tr>`;
}

interface TableProps {
  /** Column widths in DXA twips. */
  widthsDxa: number[];
  rows: string[];
}

export function tbl({ widthsDxa, rows }: TableProps): string {
  const grid = widthsDxa.map((w) => `<w:gridCol w:w="${w}"/>`).join("");
  const totalWidth = widthsDxa.reduce((s, w) => s + w, 0);
  // Dashboard-style: no outer or vertical borders; subtle horizontal
  // dividers between rows only. Header bottom border is added per-cell
  // by dataTable() for a thicker visual line.
  const tblPr =
    `<w:tblPr>` +
    `<w:tblW w:w="${totalWidth}" w:type="dxa"/>` +
    `<w:tblBorders>` +
    `<w:top w:val="nil"/>` +
    `<w:left w:val="nil"/>` +
    `<w:bottom w:val="nil"/>` +
    `<w:right w:val="nil"/>` +
    `<w:insideH w:val="single" w:sz="4" w:space="0" w:color="F3F4F6"/>` +
    `<w:insideV w:val="nil"/>` +
    `</w:tblBorders>` +
    `<w:tblLayout w:type="fixed"/>` +
    `</w:tblPr>`;
  return `<w:tbl>${tblPr}<w:tblGrid>${grid}</w:tblGrid>${rows.join("")}</w:tbl>`;
}

export interface DataTableColumn {
  header: string;
  /** Optional fixed width in DXA. When omitted, columns share the remainder
   *  evenly (or first col gets 30% if `firstColumnEmphasis` is true). */
  widthDxa?: number;
  align?: "left" | "right" | "center";
  /** When true, value cells get ROAS-style coloring based on a numeric
   *  parsed from the cell text (≥3x = green, <1.5x = amber). */
  colorAsRoas?: boolean;
}

export interface DataTableRow {
  cells: string[];
  /** Mark this row as the totals row — bold + thicker top border + muted bg. */
  isTotal?: boolean;
}

/**
 * Convenience: dashboard-style data table. Header row has shaded muted
 * background + bold uppercase text; data rows alternate between white
 * and #FAFAFA; totals row is bold with a thicker top border.
 */
export function dataTable(
  columns: DataTableColumn[],
  rows: DataTableRow[],
  /** Total content width in DXA — A4 minus margins ≈ 9000. */
  totalWidthDxa: number = 9000
): string {
  const widthsDxa = computeWidths(columns, totalWidthDxa);

  // Dashboard-style header: no background shading, just bold uppercase
  // muted text with a single subtle bottom-border separator.
  const headerCells = columns.map((col, i) =>
    tc(col.header.toUpperCase(), widthsDxa[i], {
      bold: true,
      color: "6B7280",
      sizeHalfPt: 16,
      align: col.align ?? (i === 0 ? "left" : "right"),
      paddingTwips: 100,
      borders: {
        bottom: { sz: 6, color: "E5E7EB" },
      },
    })
  );

  const body = rows.map((row, rIdx) => {
    const isTotal = !!row.isTotal;
    // No alternating row shading — dashboard shows clean white rows with
    // only thin horizontal dividers. Totals row keeps a faint background.
    const shading = isTotal ? "F9FAFB" : undefined;
    void rIdx; // formerly used for zebra striping
    const cells = row.cells.map((cell, i) => {
      const col = columns[i];
      const align = col.align ?? (i === 0 ? "left" : "right");
      // ROAS color logic: cells like "3.02x" or "1.34x".
      let color: string | undefined;
      let bold = isTotal;
      if (col.colorAsRoas) {
        const m = cell.match(/^(\d+(?:\.\d+)?)x$/);
        if (m) {
          const n = parseFloat(m[1]);
          if (n >= 3) {
            color = "16A34A";
            bold = true;
          } else if (n < 1.5 && n > 0) {
            color = "B45309";
            bold = true;
          }
        }
      }
      return tc(cell, widthsDxa[i], {
        align,
        bold,
        color,
        shading,
        sizeHalfPt: 20,
        paddingTwips: 100,
        borders: isTotal
          ? { top: { sz: 8, color: "D1D5DB" } }
          : undefined,
      });
    });
    return tr(cells);
  });

  return tbl({ widthsDxa, rows: [tr(headerCells), ...body] });
}

function computeWidths(columns: DataTableColumn[], total: number): number[] {
  const fixed: Array<[number, number]> = []; // [index, width]
  let remaining = total;
  let flexCount = 0;
  for (let i = 0; i < columns.length; i++) {
    if (columns[i].widthDxa != null) {
      remaining -= columns[i].widthDxa!;
      fixed.push([i, columns[i].widthDxa!]);
    } else {
      flexCount++;
    }
  }
  const flexWidth = flexCount > 0 ? Math.floor(remaining / flexCount) : 0;
  const out: number[] = new Array(columns.length);
  for (const [i, w] of fixed) out[i] = w;
  for (let i = 0; i < columns.length; i++) {
    if (out[i] == null) out[i] = flexWidth;
  }
  return out;
}

/**
 * Big-number KPI cards laid out as a single horizontal table. Each cell is
 * its own "card" with a small uppercase label on top and a large bold
 * value below. Optional secondary "vs prev." text appears under the value.
 */
export function kpiStrip(
  cards: Array<{
    label: string;
    value: string;
    /** Optional secondary line (e.g. "▲ +12.5% vs prev."). Hex color via `subColor`. */
    sub?: string;
    subColor?: string;
    /** Color the value (e.g. ROAS green). */
    valueColor?: string;
  }>,
  totalWidthDxa: number = 9000
): string {
  const colCount = cards.length;
  const w = Math.floor(totalWidthDxa / colCount);
  const widths = new Array(colCount).fill(w);

  // Each card is two stacked cells: top = label (small grey), bottom = value
  // (big bold). We use a 2-row table to align them visually.
  const labelRow = tr(
    cards.map((c) =>
      tc(c.label.toUpperCase(), w, {
        color: "6B7280",
        sizeHalfPt: 16,
        bold: true,
        shading: "F9FAFB",
        align: "left",
        paddingTwips: 160,
        borders: {
          top: { sz: 4, color: "E5E7EB" },
          left: { sz: 4, color: "E5E7EB" },
          right: { sz: 4, color: "E5E7EB" },
        },
      })
    )
  );
  const valueRow = tr(
    cards.map((c) =>
      // Build a single cell containing two paragraphs (value + sub) so the
      // sub text stays bound to its card visually.
      buildKpiValueCell(c, w)
    )
  );
  return tbl({ widthsDxa: widths, rows: [labelRow, valueRow] });
}

function buildKpiValueCell(
  card: {
    label: string;
    value: string;
    sub?: string;
    subColor?: string;
    valueColor?: string;
  },
  widthDxa: number
): string {
  const tcPr =
    `<w:tcPr>` +
    `<w:tcW w:w="${widthDxa}" w:type="dxa"/>` +
    `<w:tcBorders>` +
    `<w:bottom w:val="single" w:sz="4" w:space="0" w:color="E5E7EB"/>` +
    `<w:left w:val="single" w:sz="4" w:space="0" w:color="E5E7EB"/>` +
    `<w:right w:val="single" w:sz="4" w:space="0" w:color="E5E7EB"/>` +
    `</w:tcBorders>` +
    `<w:tcMar><w:top w:w="120" w:type="dxa"/><w:bottom w:w="160" w:type="dxa"/><w:left w:w="120" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tcMar>` +
    `<w:vAlign w:val="top"/>` +
    `</w:tcPr>`;
  const valueRPr =
    `<w:rPr><w:b/><w:sz w:val="40"/><w:szCs w:val="40"/>` +
    (card.valueColor ? `<w:color w:val="${card.valueColor}"/>` : "") +
    `</w:rPr>`;
  const valuePara =
    `<w:p><w:pPr><w:spacing w:before="0" w:after="40"/></w:pPr>` +
    `<w:r>${valueRPr}<w:t xml:space="preserve">${xmlEscape(card.value)}</w:t></w:r>` +
    `</w:p>`;
  const subPara = card.sub
    ? `<w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr>` +
      `<w:r><w:rPr><w:sz w:val="16"/><w:szCs w:val="16"/>` +
      (card.subColor ? `<w:color w:val="${card.subColor}"/>` : `<w:color w:val="6B7280"/>`) +
      `</w:rPr><w:t xml:space="preserve">${xmlEscape(card.sub)}</w:t></w:r></w:p>`
    : "";
  return `<w:tc>${tcPr}${valuePara}${subPara}</w:tc>`;
}

/**
 * Build a complete <w:document> body wrapper from already-rendered children.
 * Includes the page settings (sectPr) at the end.
 *
 * When `headerRelId` / `footerRelId` are provided, the sectPr references
 * them so the template's header (Pinformance logo + red accent) and footer
 * (page numbers + brand wordmark) render on every page.
 */
function buildDocumentXml(
  bodyContent: string,
  opts: { headerRelId?: string; footerRelId?: string } = {}
): string {
  const refs: string[] = [];
  if (opts.headerRelId) {
    refs.push(`<w:headerReference r:id="${opts.headerRelId}" w:type="default"/>`);
  }
  if (opts.footerRelId) {
    refs.push(`<w:footerReference r:id="${opts.footerRelId}" w:type="default"/>`);
  }
  const sectPr =
    `<w:sectPr>` +
    refs.join("") +
    `<w:pgSz w:w="11906" w:h="16838" w:orient="portrait"/>` +
    `<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>` +
    `<w:pgNumType w:start="1"/>` +
    `<w:cols w:space="720"/>` +
    `<w:docGrid w:linePitch="360"/>` +
    `</w:sectPr>`;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<w:body>${bodyContent}${sectPr}</w:body>` +
    `</w:document>`
  );
}

export interface EmbeddedImage {
  /** Relationship ID (e.g. "rIdChart1"). Referenced from `inlineImage()`. */
  rId: string;
  /** Filename inside word/media/ (e.g. "chart1.png"). */
  filename: string;
  ext: "png" | "jpg" | "jpeg";
  /** Image bytes. */
  buffer: Buffer;
}

/**
 * Build a Word document from an existing .docx template file: load the
 * template, replace `word/document.xml` with our generated content, inject
 * any embedded images (chart PNGs etc.) into word/media + the rels file,
 * and return the zip as a Buffer.
 *
 * All template parts (styles.xml, theme, fonts, header1.xml, footer1.xml,
 * embedded logo) are preserved so the resulting doc inherits the
 * Pinformance branding for free.
 */
export async function buildDocxFromTemplate(
  templateRelativePath: string,
  bodyContent: string,
  opts: {
    headerRelId?: string;
    footerRelId?: string;
    images?: EmbeddedImage[];
  } = {}
): Promise<Buffer> {
  const templatePath = path.join(process.cwd(), templateRelativePath);
  const file = await readFile(templatePath);
  const zip = new PizZip(file);

  const documentXml = buildDocumentXml(bodyContent, opts);
  zip.file("word/document.xml", documentXml);

  if (opts.images && opts.images.length > 0) {
    injectImages(zip, opts.images);
  }

  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
}

function injectImages(zip: PizZip, images: EmbeddedImage[]): void {
  // 1. Add image files to word/media/.
  for (const img of images) {
    zip.file(`word/media/${img.filename}`, img.buffer);
  }
  // 2. Append image relationships to word/_rels/document.xml.rels.
  const relsPath = "word/_rels/document.xml.rels";
  const relsFile = zip.file(relsPath);
  if (relsFile) {
    let relsXml = relsFile.asText();
    const imageRels = images
      .map(
        (img) =>
          `<Relationship Id="${img.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${img.filename}"/>`
      )
      .join("");
    relsXml = relsXml.replace("</Relationships>", `${imageRels}</Relationships>`);
    zip.file(relsPath, relsXml);
  }
  // 3. Ensure PNG / JPG content types are declared.
  const ctPath = "[Content_Types].xml";
  const ctFile = zip.file(ctPath);
  if (ctFile) {
    let ctXml = ctFile.asText();
    let inject = "";
    if (
      images.some((i) => i.ext === "png") &&
      !/Extension="png"/i.test(ctXml)
    ) {
      inject += `<Default Extension="png" ContentType="image/png"/>`;
    }
    if (
      images.some((i) => i.ext === "jpg" || i.ext === "jpeg") &&
      !/Extension="jp[e]?g"/i.test(ctXml)
    ) {
      inject += `<Default Extension="jpg" ContentType="image/jpeg"/>`;
    }
    if (inject) {
      ctXml = ctXml.replace("</Types>", `${inject}</Types>`);
      zip.file(ctPath, ctXml);
    }
  }
}

/**
 * Build an inline image paragraph: an embedded drawing that references the
 * image relationship `rId`. Sized in inches; 1 inch ≈ 914400 EMU.
 */
export function inlineImage(
  rId: string,
  altText: string,
  widthInches: number,
  heightInches: number
): string {
  const cx = Math.round(widthInches * 914400);
  const cy = Math.round(heightInches * 914400);
  const numericId = rId.replace(/\D/g, "") || "1";
  const drawing =
    `<w:drawing>` +
    `<wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">` +
    `<wp:extent cx="${cx}" cy="${cy}"/>` +
    `<wp:effectExtent l="0" t="0" r="0" b="0"/>` +
    `<wp:docPr id="${numericId}" name="${xmlEscape(altText)}" descr="${xmlEscape(altText)}"/>` +
    `<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:nvPicPr>` +
    `<pic:cNvPr id="${numericId}" name="${xmlEscape(altText)}"/>` +
    `<pic:cNvPicPr/>` +
    `</pic:nvPicPr>` +
    `<pic:blipFill>` +
    `<a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${rId}"/>` +
    `<a:srcRect/>` +
    `<a:stretch><a:fillRect/></a:stretch>` +
    `</pic:blipFill>` +
    `<pic:spPr>` +
    `<a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
    `</pic:spPr>` +
    `</pic:pic>` +
    `</a:graphicData>` +
    `</a:graphic>` +
    `</wp:inline>` +
    `</w:drawing>`;
  return `<w:p><w:pPr><w:spacing w:before="160" w:after="160"/><w:jc w:val="center"/></w:pPr><w:r>${drawing}</w:r></w:p>`;
}

/**
 * Build a complete .docx file as a Buffer from rendered body content.
 * The result is a minimal but valid Word document — no styles.xml (all
 * formatting is inline on runs/paragraphs), no theme.xml.
 */
export function buildDocxBuffer(bodyContent: string): Buffer {
  const zip = new PizZip();

  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
      `</Types>`
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
      `</Relationships>`
  );
  zip.file(
    "word/_rels/document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `</Relationships>`
  );
  zip.file("word/document.xml", buildDocumentXml(bodyContent));

  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
}
