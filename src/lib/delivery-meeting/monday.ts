/**
 * monday reads for the delivery meeting. Read-only: nothing here mutates a
 * board. The client is the one scripts/weekly-update-sync.ts uses, imported
 * lazily because that module throws at load when MONDAY_API_TOKEN is missing
 * — at request time that is a 500 on the route, at build time it would be a
 * broken deploy for every hostname.
 */
import { MONDAY } from "./constants";
import type { LogNotes } from "./types";

type Q = (query: string, variables: Record<string, unknown>) => Promise<any>;
let q: Q | null = null;
async function monday(query: string, variables: Record<string, unknown> = {}) {
  if (!q) {
    const mod = await import("../../../scripts/weekly-update-sync");
    q = mod.mondayQuery as Q;
  }
  return q(query, variables);
}

/** All pages of an items_page on one board (or one group). */
async function allItems(
  board: number,
  fields: string,
  opts: { groups?: string[]; rules?: string } = {},
): Promise<any[]> {
  const out: any[] = [];
  const scope = opts.groups ? `groups(ids: ${JSON.stringify(opts.groups)}) {` : "";
  const qp = opts.rules ? `, query_params: { rules: ${opts.rules} }` : "";
  const first = await monday(
    `query { boards(ids: [${board}]) { ${scope} items_page(limit: 500${qp}) { cursor items { ${fields} } } ${scope ? "}" : ""} } }`,
  );
  const pages: { cursor: string | null; items: any[] }[] = opts.groups
    ? first.boards[0].groups.map((g: any) => g.items_page)
    : [first.boards[0].items_page];
  for (const p of pages) {
    out.push(...p.items);
    let cursor = p.cursor;
    while (cursor) {
      const next = await monday(
        `query($c: String!) { next_items_page(limit: 500, cursor: $c) { cursor items { ${fields} } } }`,
        { c: cursor },
      );
      out.push(...next.next_items_page.items);
      cursor = next.next_items_page.cursor;
    }
  }
  return out;
}

const personIds = (value: string | null | undefined): number[] => {
  if (!value) return [];
  try {
    const v = JSON.parse(value);
    return (v.personsAndTeams ?? []).filter((p: any) => p.kind === "person").map((p: any) => Number(p.id));
  } catch {
    return [];
  }
};
const col = (item: any, id: string) => item.column_values?.find((c: any) => c.id === id);
const text = (item: any, id: string) => ((col(item, id)?.text ?? "") as string).trim();

/* ------------------------------------------------------------------ */
/* Weekly Store Logs                                                   */
/* ------------------------------------------------------------------ */

export interface LogItem {
  item_id: string;
  store: string;
  deadline: string;
  person_ids: number[];
  status: string;
  kind: "archived" | "live";
}

/**
 * The log items whose deadline is one of `deadlines`, in the live group and in
 * the archive. A log is not always archived by Tuesday (MayCosmetics' log for
 * 25-09 was still in the live group on the 29th), so the deadline decides
 * which week a log is about, never the group.
 */
export async function loadLogItems(dataFriday: string, meetingFriday: string): Promise<LogItem[]> {
  const fields = `id name group { id } column_values(ids: ["${MONDAY.COL_STORE}", "${MONDAY.COL_DEADLINE}", "${MONDAY.COL_PERSON}", "${MONDAY.COL_STATUS}"]) { id text value }`;
  const rules = `[{ column_id: "${MONDAY.COL_DEADLINE}", compare_value: ["EXACT", "${dataFriday}", "EXACT", "${meetingFriday}"], operator: any_of }]`;
  const items = await allItems(MONDAY.TODO_BOARD, fields, {
    groups: [MONDAY.LOG_GROUP_ARCHIVE, MONDAY.LOG_GROUP_LIVE],
    rules,
  });
  return items
    .filter((i) => String(i.name).toLowerCase().startsWith(MONDAY.LOG_ITEM_PREFIX))
    .map((i) => {
      const deadline = text(i, MONDAY.COL_DEADLINE);
      return {
        item_id: String(i.id),
        store: text(i, MONDAY.COL_STORE),
        deadline,
        person_ids: personIds(col(i, MONDAY.COL_PERSON)?.value),
        status: text(i, MONDAY.COL_STATUS),
        kind: deadline === dataFriday ? ("archived" as const) : ("live" as const),
      };
    })
    .filter((l) => l.deadline === dataFriday || l.deadline === meetingFriday);
}

interface Block {
  id: string;
  parent: string | null;
  type: string;
  text: string;
  italic: boolean;
  /** a table's rows of cell block ids */
  cells: string[][] | null;
}

function blockOf(b: { id?: string; parent_block_id?: string | null; type: string; content: string | null }): Block {
  let content: any = {};
  try {
    content = b.content ? JSON.parse(b.content) : {};
  } catch {
    content = {};
  }
  const delta: any[] = content.deltaFormat ?? [];
  const parts = delta.filter((d) => typeof d.insert === "string");
  const written = parts.filter((d) => d.insert.trim());
  return {
    id: b.id ?? "",
    parent: b.parent_block_id ?? null,
    type: b.type,
    text: parts.map((d) => d.insert).join("").trim(),
    italic: written.length > 0 && written.every((d) => d.attributes?.italic),
    cells: Array.isArray(content.cells)
      ? content.cells.map((row: any[]) => row.map((c) => String(c?.blockId ?? "")))
      : null,
  };
}

const docFields = (page: number) =>
  `column_values(ids: ["${MONDAY.COL_LOG_DOC}"]) { ... on DocValue { file { ... on FileDocValue { doc { blocks(limit: 100, page: ${page}) { id type parent_block_id content } } } } } }`;

/**
 * All blocks per log item, ten items per call, paged: a log with tables runs
 * past a hundred blocks (a cell is a block, and so is the text in it), and a
 * truncated doc loses its last section — the plan and the target.
 */
export async function loadLogDocs(itemIds: string[]): Promise<Map<string, Block[]>> {
  const out = new Map<string, Block[]>();
  for (let i = 0; i < itemIds.length; i += 10) {
    let ids = itemIds.slice(i, i + 10);
    for (let page = 1; ids.length && page <= 6; page++) {
      const data = await monday(`query($i: [ID!]) { items(ids: $i) { id ${docFields(page)} } }`, { i: ids });
      const full: string[] = [];
      for (const it of data.items ?? []) {
        const blocks = it.column_values?.[0]?.file?.doc?.blocks;
        if (!Array.isArray(blocks)) continue;
        const id = String(it.id);
        out.set(id, [...(out.get(id) ?? []), ...blocks.map(blockOf)]);
        if (blocks.length === 100) full.push(id);
      }
      ids = full;
    }
  }
  return out;
}

/** The template's own text, to strip from every log. */
export async function loadTemplateTexts(): Promise<Set<string>> {
  try {
    const data = await monday(
      `query { docs(object_ids: [${MONDAY.LOG_TEMPLATE_DOC}]) { blocks(limit: 100) { type content } } }`,
    );
    const blocks: any[] = data.docs?.[0]?.blocks ?? [];
    return new Set(blocks.map(blockOf).map((b) => b.text).filter((t) => t.length > 0));
  } catch {
    return new Set();
  }
}

/** "1 · Last week", "4 · The plan (…)" — a heading block or a plain line. */
const SECTION_RE = /^([1-6])\s*·\s*\S/;

/**
 * The newest week of one log as plain text, template removed. `onlySection`
 * keeps one numbered section (the live log: only section 1).
 *
 * The logs come in three shapes, all live at once on 29-09-2026: the first
 * template (a "Week of …" large title, numbered medium titles, prose), the
 * second (numbered sections as plain lines), and the current one (numbered
 * titles with tables). So a section is recognised by its "N ·" text whatever
 * block carries it, the week ends where the numbering starts over, and a
 * table is read row by row from its cells.
 *
 * Template text is recognised three ways, because each catches what the
 * others miss: the template doc's own blocks; any block that is italic
 * throughout; and any longer text that appears word for word in three or more
 * logs this run (`shared`) — the template as the buyers' copies read.
 */
export function logText(
  blocks: Block[],
  template: Set<string>,
  shared: Set<string>,
  onlySection?: number,
): string | null {
  const byId = new Map(blocks.map((b) => [b.id, b]));
  const children = new Map<string, Block[]>();
  for (const b of blocks) if (b.parent) children.set(b.parent, [...(children.get(b.parent) ?? []), b]);
  const cellText = (id: string): string =>
    (children.get(id) ?? [])
      .map((c) => (c.cells ? "" : c.text))
      .filter(Boolean)
      .join(" ")
      .trim();
  const isTemplate = (t: string) => template.has(t) || shared.has(t);

  const top = blocks.filter((b) => !b.parent);
  const lines: string[] = [];
  let section = 0;
  let started = false;
  for (const b of top) {
    const m = SECTION_RE.exec(b.text);
    if (m && b.text.length < 90) {
      const n = Number(m[1]);
      if (started && n <= section) break; // the numbering starts over: last week's entry
      section = n;
      started = true;
      if (!onlySection || n === onlySection) lines.push(`\n## ${b.text.replace(/\s*\(.*\)\s*$/, "")}`);
      continue;
    }
    if (/^previous weeks below/i.test(b.text)) break;
    if (started && b.type === "large title") break;
    if (!started) continue;
    if (onlySection && section !== onlySection) continue;
    if (b.cells) {
      for (const row of b.cells) {
        const cells = row.map((id) => (byId.has(id) ? cellText(id) : ""));
        const filled = cells.filter(Boolean);
        // a row with only its label filled in ("3. Benchmarks & Split") says nothing
        if (filled.length < 2 && !(filled.length === 1 && cells.length === 1)) continue;
        if (filled.every(isTemplate)) continue;
        lines.push(cells.map((c) => c || "—").join(" | "));
      }
      continue;
    }
    if (!b.text || b.italic || isTemplate(b.text)) continue;
    const t = b.text.replace(/^notes:\s*\.?/i, "").trim();
    if (!t || /^(client update slack|internal update|to the client|internal):?$/i.test(t)) continue;
    lines.push(t);
  }
  // a section heading with nothing written under it is noise to the model
  const joined = lines
    .join("\n")
    .replace(/\n## [^\n]+(?=\n## |\s*$)/g, "")
    .trim();
  if (!joined.replace(/## [^\n]+/g, "").trim()) return null;
  return joined.slice(0, 7000);
}

export function sharedTexts(docs: Block[][]): Set<string> {
  const count = new Map<string, number>();
  for (const blocks of docs) {
    for (const t of new Set(blocks.map((b) => b.text))) {
      if (t.length > 25) count.set(t, (count.get(t) ?? 0) + 1);
    }
  }
  return new Set([...count].filter(([, n]) => n >= 3).map(([t]) => t));
}

export type { Block };

/** One store's notes. Two log items for one store in one week happens
 *  (Jennie, 25-09): each is read on its own, then joined. */
export function buildLogNotes(
  archived: Block[][],
  live: Block[][],
  template: Set<string>,
  shared: Set<string>,
): LogNotes {
  const join = (docs: Block[][], only?: number) =>
    docs.map((d) => logText(d, template, shared, only)).filter(Boolean).join("\n\n---\n") || null;
  return { archived: join(archived), live_section1: join(live, 1) };
}

/* ------------------------------------------------------------------ */
/* Clients board                                                       */
/* ------------------------------------------------------------------ */

export interface ClientStore {
  name: string;
  client: string;
  status: string;
  person_ids: number[];
  parent_group: string | null;
}

export async function loadClientStores(): Promise<ClientStore[]> {
  const fields = `id name parent_item { name group { title } } column_values(ids: ["${MONDAY.CLIENTS_COL_PERSON}", "${MONDAY.CLIENTS_COL_STATUS}"]) { id text value }`;
  const items = await allItems(MONDAY.CLIENTS_SUBITEM_BOARD, fields);
  return items.map((i) => ({
    name: String(i.name).trim(),
    client: String(i.parent_item?.name ?? "").trim(),
    status: text(i, MONDAY.CLIENTS_COL_STATUS),
    person_ids: personIds(col(i, MONDAY.CLIENTS_COL_PERSON)?.value),
    parent_group: i.parent_item?.group?.title ?? null,
  }));
}

/* ------------------------------------------------------------------ */
/* Weekly Updates — fallback numbers                                   */
/* ------------------------------------------------------------------ */

export interface WeeklyRow {
  parent_id: string;
  parent_name: string;
  currency_label: string;
  send_date: string;
  revenue: number | null;
  spend: number | null;
}

/** Subitems with one of these send dates, one call per date. */
export async function loadWeeklyRows(sendDates: string[]): Promise<WeeklyRow[]> {
  const fields = `id parent_item { id name column_values(ids: ["${MONDAY.WU_COL_CURRENCY}"]) { text } } column_values(ids: ["${MONDAY.WU_COL_REVENUE}", "${MONDAY.WU_COL_SPEND}", "${MONDAY.WU_COL_SEND_DATE}"]) { id text }`;
  const out: WeeklyRow[] = [];
  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  for (const d of [...new Set(sendDates)]) {
    const rules = `[{ column_id: "${MONDAY.WU_COL_SEND_DATE}", compare_value: ["EXACT", "${d}"], operator: any_of }]`;
    const items = await allItems(MONDAY.WEEKLY_SUBITEM_BOARD, fields, { rules });
    for (const i of items) {
      if (!i.parent_item) continue;
      out.push({
        parent_id: String(i.parent_item.id),
        parent_name: String(i.parent_item.name ?? ""),
        currency_label: String(i.parent_item.column_values?.[0]?.text ?? "").trim(),
        send_date: text(i, MONDAY.WU_COL_SEND_DATE) || d,
        revenue: num(text(i, MONDAY.WU_COL_REVENUE)),
        spend: num(text(i, MONDAY.WU_COL_SPEND)),
      });
    }
  }
  return out;
}
