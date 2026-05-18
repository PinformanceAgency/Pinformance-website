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
  /** Text color hex. */
  color?: string;
  align?: "left" | "center" | "right";
  /** Twentieths of a point. Default body cell padding ≈ 80. */
  paddingTwips?: number;
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
  const tcPr =
    `<w:tcPr>` +
    `<w:tcW w:w="${widthDxa}" w:type="dxa"/>` +
    shading +
    `</w:tcPr>`;
  const pPr: string[] = [];
  if (opts.align) pPr.push(`<w:jc w:val="${opts.align}"/>`);
  pPr.push(`<w:spacing w:before="40" w:after="40"/>`);
  const rPr: string[] = [];
  if (opts.bold) rPr.push("<w:b/>");
  if (opts.color) rPr.push(`<w:color w:val="${opts.color}"/>`);
  rPr.push(`<w:sz w:val="20"/><w:szCs w:val="20"/>`);
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
  const tblPr =
    `<w:tblPr>` +
    `<w:tblW w:w="${totalWidth}" w:type="dxa"/>` +
    `<w:tblBorders>` +
    `<w:top w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/>` +
    `<w:left w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/>` +
    `<w:bottom w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/>` +
    `<w:right w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/>` +
    `<w:insideH w:val="single" w:sz="4" w:space="0" w:color="E5E7EB"/>` +
    `<w:insideV w:val="single" w:sz="4" w:space="0" w:color="E5E7EB"/>` +
    `</w:tblBorders>` +
    `<w:tblLayout w:type="fixed"/>` +
    `</w:tblPr>`;
  return `<w:tbl>${tblPr}<w:tblGrid>${grid}</w:tblGrid>${rows.join("")}</w:tbl>`;
}

/**
 * Convenience: build a header-row + data-row table from headers + 2D string
 * grid. The first column is left-aligned, the rest right-aligned. The
 * header row has a muted shading.
 */
export function dataTable(
  headers: string[],
  rows: string[][],
  /** Total content width in DXA — A4 minus margins ≈ 9000. */
  totalWidthDxa: number = 9000
): string {
  const colCount = headers.length;
  // Give the first column 30% of the width; the rest split the remaining 70%.
  const firstCol = Math.floor(totalWidthDxa * 0.3);
  const restCol = Math.floor((totalWidthDxa - firstCol) / (colCount - 1));
  const widthsDxa = [firstCol, ...new Array(colCount - 1).fill(restCol)];

  const headerCells = headers.map((h, i) =>
    tc(h, widthsDxa[i], {
      bold: true,
      shading: "F3F4F6",
      color: "6B7280",
      align: i === 0 ? "left" : "right",
      paddingTwips: 80,
    })
  );
  const body = rows.map((row) =>
    tr(
      row.map((cell, i) =>
        tc(cell, widthsDxa[i], {
          align: i === 0 ? "left" : "right",
        })
      )
    )
  );
  return tbl({ widthsDxa, rows: [tr(headerCells), ...body] });
}

/** A 5-column KPI strip: label / value / label / value / label / value / ... */
export function kpiStrip(
  pairs: Array<{ label: string; value: string }>,
  totalWidthDxa: number = 9000
): string {
  const colCount = pairs.length;
  const w = Math.floor(totalWidthDxa / colCount);
  const widths = new Array(colCount).fill(w);
  const labelRow = tr(
    pairs.map((p) =>
      tc(p.label.toUpperCase(), w, {
        bold: true,
        color: "6B7280",
        align: "left",
        shading: "F9FAFB",
      })
    )
  );
  const valueRow = tr(
    pairs.map((p) => tc(p.value, w, { bold: true, align: "left" }))
  );
  return tbl({ widthsDxa: widths, rows: [labelRow, valueRow] });
}

/**
 * Build a complete <w:document> body wrapper from already-rendered children.
 * Includes the page settings (sectPr) at the end.
 */
function buildDocumentXml(bodyContent: string): string {
  const sectPr =
    `<w:sectPr>` +
    `<w:pgSz w:w="12240" w:h="15840"/>` +
    `<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>` +
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
