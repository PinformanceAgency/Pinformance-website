/**
 * Auto-capture assets from operator input. Every task-completion / intake
 * / import path that touches a URL routes through here so the Assets tab
 * fills itself over time instead of staying empty because nobody
 * remembers to open the manual form.
 *
 * Two things this file does:
 *   1. inferAssetType(taskId, url) — pick a reasonable type + source_tool
 *      from the task id and the URL hostname so operators don't have to
 *   2. autoLinkAsset — idempotent write into organic.assets that ignores
 *      duplicates on (org_id, url) so a re-save from the same task doesn't
 *      pile up rows
 */
import { organicPool } from "./db";

type AssetType =
  | "BRAND_BOOK" | "CONTENT_DRIVE" | "PININSPECTOR_EXPORT" | "CANVA_DESIGN"
  | "FLAGGED_PIN_REPORT" | "GOOGLE_KEYWORD_LIST" | "AUDIENCE_DOCUMENT"
  | "PRODUCT_FEED" | "MOODBOARD" | "OTHER";

/** Map each capturing task to its most likely asset type. */
const TASK_TO_TYPE: Record<string, AssetType> = {
  "P1.1.6":  "BRAND_BOOK",
  "P1.1.7":  "CONTENT_DRIVE",
  "P1.1.8":  "GOOGLE_KEYWORD_LIST",
  "P1.1.9":  "AUDIENCE_DOCUMENT",
  "P1.1.10": "PRODUCT_FEED",
  "P1.2.2":  "FLAGGED_PIN_REPORT",
  "P2.1.6":  "PININSPECTOR_EXPORT",
  "P2.1.7":  "MOODBOARD",           // top-pin designs collected as boards
};

/** Infer source_tool label from the URL hostname. Purely cosmetic — helps
 *  the manager scan the Assets table without opening every link. */
function inferSourceTool(url: string): string | null {
  try {
    const h = new URL(url).hostname.toLowerCase();
    if (h.endsWith("drive.google.com") || h.endsWith("docs.google.com") || h.endsWith("sheets.google.com")) return "Google Drive";
    if (h.endsWith("canva.com"))       return "Canva";
    if (h.endsWith("figma.com"))       return "Figma";
    if (h.includes("pininspector"))    return "PinInspector";
    if (h.includes("pinclicks"))       return "PinClicks";
    if (h.endsWith("dropbox.com"))     return "Dropbox";
    if (h.endsWith("notion.so") || h.endsWith("notion.site")) return "Notion";
    if (h.endsWith("miro.com"))        return "Miro";
    if (h.endsWith("shopify.com") || h.includes(".myshopify.com")) return "Shopify";
    if (h.endsWith("airtable.com"))    return "Airtable";
    return h.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function inferAssetType(taskId: string | null | undefined, url: string): AssetType {
  if (taskId && TASK_TO_TYPE[taskId]) return TASK_TO_TYPE[taskId];
  const src = inferSourceTool(url) ?? "";
  if (src === "Canva")                 return "CANVA_DESIGN";
  if (src === "PinInspector")          return "PININSPECTOR_EXPORT";
  if (src === "Google Drive")          return "CONTENT_DRIVE";
  if (/feed\.xml|\.xml$|products\.json/.test(url.toLowerCase())) return "PRODUCT_FEED";
  return "OTHER";
}

export interface AutoLinkOptions {
  orgId: string;
  url: string;
  title?: string | null;
  taskId?: string | null;
  sourceTool?: string | null;
  notes?: string | null;
}

/** Insert an asset row, deduping on (org_id, url). Returns the row id
 *  (existing or newly created). Silently no-ops on invalid URLs. */
export async function autoLinkAsset(opts: AutoLinkOptions): Promise<string | null> {
  const url = (opts.url ?? "").trim();
  if (!url || !/^https?:\/\//i.test(url)) return null;

  const type = inferAssetType(opts.taskId, url);
  const sourceTool = opts.sourceTool ?? inferSourceTool(url);
  const title = opts.title?.trim() || (opts.taskId ? `${opts.taskId} — link` : url.slice(0, 80));

  const pool = organicPool();
  // Dedup on (org_id, url): if the same operator saves the same URL twice
  // via the same or a different task, we don't want two rows.
  const existing = await pool.query<{ id: string }>(
    `SELECT id::text FROM organic.assets WHERE org_id = $1 AND url = $2 LIMIT 1`,
    [opts.orgId, url]
  );
  if (existing.rowCount && existing.rowCount > 0) {
    // Attach the task id if this discovery has more context than the first save.
    if (opts.taskId) {
      await pool.query(
        `UPDATE organic.assets SET linked_task_id = COALESCE(linked_task_id, $1) WHERE id = $2`,
        [opts.taskId, existing.rows[0].id]
      );
    }
    return existing.rows[0].id;
  }

  const r = await pool.query<{ id: string }>(
    `INSERT INTO organic.assets (org_id, title, url, type, source_tool, linked_task_id, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id::text`,
    [opts.orgId, title, url, type, sourceTool, opts.taskId ?? null, opts.notes ?? null]
  );
  return r.rows[0].id;
}

/** Scan any free-text field for http(s) URLs and auto-link each one. */
export async function autoLinkAssetsFromText(orgId: string, taskId: string | null, text: string | null | undefined): Promise<string[]> {
  if (!text) return [];
  const urls = text.match(/https?:\/\/[^\s"'<>()]+/g) ?? [];
  const ids: string[] = [];
  for (const url of urls) {
    const id = await autoLinkAsset({ orgId, url: url.replace(/[.,;:]+$/, ""), taskId });
    if (id) ids.push(id);
  }
  return ids;
}
