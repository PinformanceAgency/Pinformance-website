import { readFile } from "fs/promises";
import path from "path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

type KpiKey = "roas" | "cpa" | "revenue" | "spend" | "checkouts";

interface AdRow {
  ad_id: string;
  ad_name: string;
  pin_id: string | null;
  image_url?: string | null;
  spend: number | null;
  revenue: number | null;
  purchases: number | null;
  roas: number | null;
  cpa: number | null;
  created_at: string | null;
}

interface PendingImage {
  rId: string;
  filename: string;
  ext: "png" | "jpeg" | "jpg";
  buffer: Buffer;
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
 * Build raw OOXML for the pin cell paragraph. If an image is embedded
 * (rId provided), the paragraph contains an inline drawing wrapped in a
 * HYPERLINK field-code so the image itself is clickable. Otherwise falls
 * back to a plain "View pin" text hyperlink. Field-code hyperlinks need
 * no rels mutation, so this stays simple.
 */
function pinLinkXml(pinId: string | null, imageRId: string | null): string {
  if (!pinId) {
    return `<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:r><w:t>—</w:t></w:r></w:p>`;
  }
  const url = `https://www.pinterest.com/pin/${pinId}/`;
  const safe = xmlEscape(url);
  const openLink =
    `<w:r><w:fldChar w:fldCharType="begin"/></w:r>` +
    `<w:r><w:instrText xml:space="preserve"> HYPERLINK "${safe}" </w:instrText></w:r>` +
    `<w:r><w:fldChar w:fldCharType="separate"/></w:r>`;
  const closeLink = `<w:r><w:fldChar w:fldCharType="end"/></w:r>`;

  if (imageRId) {
    // EMUs: 914400 = 1 inch. 0.65" thumbnail.
    const cx = 594360;
    const cy = 594360;
    const drawing = `<w:r><w:drawing>` +
      `<wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">` +
        `<wp:extent cx="${cx}" cy="${cy}"/>` +
        `<wp:effectExtent l="0" t="0" r="0" b="0"/>` +
        `<wp:docPr id="${imageRId.replace(/\D/g, "")}" name="Pin ${pinId}" descr="Pin ${pinId}"/>` +
        `<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
        `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
          `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
            `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
              `<pic:nvPicPr>` +
                `<pic:cNvPr id="${imageRId.replace(/\D/g, "")}" name="Pin ${pinId}"/>` +
                `<pic:cNvPicPr/>` +
              `</pic:nvPicPr>` +
              `<pic:blipFill>` +
                `<a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${imageRId}"/>` +
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
    `</w:drawing></w:r>`;
    return `<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${openLink}${drawing}${closeLink}</w:p>`;
  }

  // No image — fall back to a plain "View pin" link.
  return `<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${openLink}` +
    `<w:r><w:rPr><w:rStyle w:val="Hyperlink"/><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr><w:t>View pin</w:t></w:r>` +
    closeLink +
    `</w:p>`;
}

async function downloadImageBuffer(
  url: string
): Promise<{ buffer: Buffer; ext: "png" | "jpeg" | "jpg" } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > 5 * 1024 * 1024) return null;
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    let ext: "png" | "jpeg" | "jpg" = "jpg";
    if (ct.includes("png")) ext = "png";
    else if (ct.includes("jpeg") || ct.includes("jpg")) ext = "jpeg";
    else if (url.toLowerCase().endsWith(".png")) ext = "png";
    return { buffer: buf, ext };
  } catch {
    return null;
  }
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

function mapAdRow(ad: AdRow, rank: number, currency: string, imageRId: string | null) {
  return {
    rank: String(rank),
    pin_link: pinLinkXml(ad.pin_id, imageRId),
    spend: fmtCurrency(ad.spend, currency),
    revenue: fmtCurrency(ad.revenue, currency),
    roas: fmtRoas(ad.roas),
    cpa: fmtCurrency(ad.cpa, currency),
    ad_name: ad.ad_name,
  };
}

/** Download all referenced ad images in parallel and return a map keyed
 *  by ad_id → PendingImage. Skips ads with no usable image_url. */
async function downloadAdImages(
  ads: AdRow[],
  startSeq: number
): Promise<Map<string, PendingImage>> {
  const out = new Map<string, PendingImage>();
  let seq = startSeq;
  await Promise.all(
    ads.map(async (ad) => {
      if (!ad.image_url) return;
      const dl = await downloadImageBuffer(ad.image_url);
      if (!dl) return;
      const localSeq = seq++;
      out.set(ad.ad_id, {
        rId: `rIdImg${localSeq}`,
        filename: `creative_${localSeq}.${dl.ext === "jpeg" ? "jpg" : dl.ext}`,
        ext: dl.ext === "jpeg" ? "jpg" : dl.ext,
        buffer: dl.buffer,
      });
    })
  );
  return out;
}

export async function generateWeeklyReport(input: ReportInput): Promise<Buffer> {
  const templatePath = path.join(process.cwd(), "src", "templates", "weekly-report.docx");
  const file = await readFile(templatePath);

  // Download all ad creative images first so we can embed them inline.
  const topImages = await downloadAdImages(input.top_section.ads, 1);
  const recentImages = await downloadAdImages(
    input.recent_section.ads,
    1 + topImages.size + 1
  );

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
    top_ads: input.top_section.ads.map((a, i) =>
      mapAdRow(a, i + 1, input.currency, topImages.get(a.ad_id)?.rId || null)
    ),
    recent_ads: input.recent_section.ads.map((a, i) =>
      mapAdRow(a, i + 1, input.currency, recentImages.get(a.ad_id)?.rId || null)
    ),
    show_recent: showRecent,
    manual_notes: manualNotesXml(input.manual_notes),
  });

  // Inject image files + relationships + content types into the rendered zip.
  const allImages: PendingImage[] = [
    ...Array.from(topImages.values()),
    ...Array.from(recentImages.values()),
  ];
  injectImages(doc.getZip(), allImages);

  return doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });
}

function injectImages(zip: PizZip, images: PendingImage[]) {
  if (images.length === 0) return;

  // 1. Add image files to word/media/.
  for (const img of images) {
    zip.file(`word/media/${img.filename}`, img.buffer);
  }

  // 2. Append relationships to word/_rels/document.xml.rels.
  const relsPath = "word/_rels/document.xml.rels";
  const relsFile = zip.file(relsPath);
  if (relsFile) {
    let relsXml = relsFile.asText();
    const newRels = images
      .map(
        (img) =>
          `<Relationship Id="${img.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${img.filename}"/>`
      )
      .join("");
    relsXml = relsXml.replace("</Relationships>", `${newRels}</Relationships>`);
    zip.file(relsPath, relsXml);
  }

  // 3. Make sure png + jpeg/jpg content types are declared.
  const ctPath = "[Content_Types].xml";
  const ctFile = zip.file(ctPath);
  if (ctFile) {
    let ctXml = ctFile.asText();
    const needsPng =
      images.some((i) => i.ext === "png") && !/Extension="png"/i.test(ctXml);
    const needsJpg =
      images.some((i) => i.ext === "jpg" || i.ext === "jpeg") &&
      !/Extension="jp[e]?g"/i.test(ctXml);
    let inject = "";
    if (needsPng) inject += `<Default Extension="png" ContentType="image/png"/>`;
    if (needsJpg) inject += `<Default Extension="jpg" ContentType="image/jpeg"/>`;
    if (inject) {
      ctXml = ctXml.replace("</Types>", `${inject}</Types>`);
      zip.file(ctPath, ctXml);
    }
  }
}
