import { readFile } from "fs/promises";
import path from "path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

type KpiKey = "roas" | "cpa" | "revenue" | "spend" | "checkouts";

interface AdRow {
  ad_id: string;
  ad_name: string;
  pin_id: string | null;
  spend: number | null;
  revenue: number | null;
  purchases: number | null;
  roas: number | null;
  cpa: number | null;
  created_at: string | null;
}

interface ReportInput {
  client_name: string;
  date_range_label: string; // e.g. "May 4 – May 10, 2026"
  currency: string;
  top_section: {
    n: number;
    kpi: KpiKey;
    ads: AdRow[];
  };
  recent_section: {
    n: number;
    kpi: KpiKey;
    since_date: string;
    ads: AdRow[];
  };
  manual_notes: string;
}

const KPI_LABELS: Record<KpiKey, string> = {
  roas: "ROAS",
  cpa: "CPA",
  revenue: "Revenue",
  spend: "Spend",
  checkouts: "Checkouts",
};

const dash = "—";

function fmtCurrency(n: number | null, currency: string): string {
  if (n == null) return dash;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtRoas(n: number | null): string {
  if (n == null) return dash;
  return `${n.toFixed(2)}x`;
}

function fmtNum(n: number | null): string {
  if (n == null) return dash;
  return new Intl.NumberFormat("en-US").format(n);
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Build raw OOXML for a single cell paragraph containing a clickable
 * hyperlink. Uses the HYPERLINK field-code form so we don't need to manage
 * document relationships per-link.
 */
function pinLinkXml(pinId: string | null, currency: string): string {
  void currency;
  if (!pinId) {
    return `<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:r><w:t>—</w:t></w:r></w:p>`;
  }
  const url = `https://www.pinterest.com/pin/${pinId}/`;
  const safe = xmlEscape(url);
  return `<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:r><w:fldChar w:fldCharType="begin"/></w:r>` +
    `<w:r><w:instrText xml:space="preserve"> HYPERLINK "${safe}" </w:instrText></w:r>` +
    `<w:r><w:fldChar w:fldCharType="separate"/></w:r>` +
    `<w:r><w:rPr><w:rStyle w:val="Hyperlink"/><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr><w:t>View pin</w:t></w:r>` +
    `<w:r><w:fldChar w:fldCharType="end"/></w:r>` +
    `</w:p>`;
}

/** Convert multi-line plain text into raw OOXML paragraphs. */
function manualNotesXml(text: string): string {
  const trimmed = (text || "").trim();
  if (!trimmed) {
    return `<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:r><w:rPr><w:i/><w:color w:val="808080"/></w:rPr><w:t>(No notes added.)</w:t></w:r></w:p>`;
  }
  const lines = trimmed.split(/\r?\n/);
  return lines
    .map(
      (line) =>
        `<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:r><w:t xml:space="preserve">${xmlEscape(line)}</w:t></w:r></w:p>`
    )
    .join("");
}

function mapAdRow(ad: AdRow, rank: number, currency: string) {
  return {
    rank: String(rank),
    pin_link: pinLinkXml(ad.pin_id, currency),
    spend: fmtCurrency(ad.spend, currency),
    revenue: fmtCurrency(ad.revenue, currency),
    roas: fmtRoas(ad.roas),
    cpa: fmtCurrency(ad.cpa, currency),
    ad_name: ad.ad_name,
  };
}

export async function generateWeeklyReport(input: ReportInput): Promise<Buffer> {
  const templatePath = path.join(process.cwd(), "src", "templates", "weekly-report.docx");
  const file = await readFile(templatePath);
  const zip = new PizZip(file);

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{", end: "}" },
  });

  const topKpiLabel = KPI_LABELS[input.top_section.kpi];
  const recentKpiLabel = KPI_LABELS[input.recent_section.kpi];

  const showRecent = input.recent_section.n > 0;

  doc.render({
    client_name: input.client_name || "—",
    date_range: input.date_range_label,
    top_section_title: `Top ${input.top_section.n} Performing Ads  |  ${topKpiLabel}  |  ${input.date_range_label}`,
    top_section_description: `Best performing ads ranked by ${topKpiLabel} over ${input.date_range_label}.`,
    recent_section_title: `Recently Launched Ads  |  ${recentKpiLabel}  |  ${input.date_range_label}`,
    recent_section_description: `${input.recent_section.n} ads launched since ${input.recent_section.since_date}, ranked by ${recentKpiLabel}.`,
    top_ads: input.top_section.ads.map((a, i) => mapAdRow(a, i + 1, input.currency)),
    recent_ads: input.recent_section.ads.map((a, i) => mapAdRow(a, i + 1, input.currency)),
    show_recent: showRecent,
    manual_notes: manualNotesXml(input.manual_notes),
  });

  return doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });
}
