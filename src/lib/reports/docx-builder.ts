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
 *  Adds a page break before so each chapter starts on a new page. */
export function chapterHeading(text: string, addPageBreak: boolean = true): string {
  const pageBreak = addPageBreak
    ? `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`
    : "";
  return pageBreak + styledP(text, "Heading1");
}

/** Word "Heading 2" — used for sub-sections within a chapter. Shows up in
 *  the TOC under its parent Heading 1. */
export function sectionHeading(text: string): string {
  return styledP(text, "Heading2");
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

/**
 * Build a Word document from an existing .docx template file: load the
 * template, replace `word/document.xml` with our generated content, and
 * return the zip as a Buffer. All other parts (styles.xml, theme, fonts,
 * header1.xml, footer1.xml, embedded logo) come from the template, so the
 * resulting doc inherits the Pinformance branding for free.
 *
 * The template's word/_rels/document.xml.rels is preserved — so any
 * `<w:headerReference r:id="rId8"/>` etc. in our body resolves to the
 * template's header1.xml.
 */
export async function buildDocxFromTemplate(
  templateRelativePath: string,
  bodyContent: string,
  opts: { headerRelId?: string; footerRelId?: string } = {}
): Promise<Buffer> {
  const templatePath = path.join(process.cwd(), templateRelativePath);
  const file = await readFile(templatePath);
  const zip = new PizZip(file);

  const documentXml = buildDocumentXml(bodyContent, opts);
  zip.file("word/document.xml", documentXml);

  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
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
