/**
 * The whole research record for one account, on one page.
 *
 * WHY THIS IS SEPARATE FROM brief.ts
 * ----------------------------------
 * The brief is what phase 4 *decides on*: a small, typed, opinionated
 * selection with a fallback for every gap. This is what phase 4 *refers
 * back to*, which is a different job. Not everything found in three months
 * of research should steer a decision automatically — most of it is
 * context a person needs at the moment they are choosing a board, writing
 * a caption or briefing an image, and the only requirement is that it is
 * there and takes one click to find.
 *
 * Folding the two together would ruin both. The brief would grow into a
 * hundred-field object where the six values that actually drive production
 * are lost, and the record would inherit the brief's opinions about what
 * matters.
 *
 * WHAT IT INCLUDES THAT NOTHING ELSE READ
 * ---------------------------------------
 * organic.task_answers. Every yes/no, every piece of reasoning somebody
 * typed and every file they attached across phases 1 to 3 lives there, and
 * until now no surface outside the task itself ever read it back. That is
 * the largest single body of research in the system and it was write-only.
 */
import { organicPool } from "./db";
import { fieldsFor } from "./task-fields";

export interface AnsweredItem {
  task_id: string;
  task_name: string;
  phase: number;
  step: string;
  /** The question as it was put, where the task has written questions. */
  question: string;
  /**
   * True when the question itself no longer exists in task-fields.ts.
   *
   * A question can be retired — P1.0.1 went from six good-fit signals to
   * three — and the answers given while it was live do not stop being
   * research. They render under the field key with a marker, because an
   * answer whose question is missing reads as a bug otherwise, and deleting
   * it would be rewriting what the assessment actually said at the time.
   */
  retired: boolean;
  /** Yes / No / the chosen option / the number, rendered for reading. */
  answer: string;
  /** The reasoning typed alongside it. */
  reasoning: string | null;
  file_url: string | null;
  file_title: string | null;
  answered_at: string;
}

export interface ResearchRecord {
  org_id: string;
  name: string;
  /** Everything answered in phases 1-3, newest first within a step. */
  answers: AnsweredItem[];
  /** Free-form notes recorded against a task. */
  notes: Array<{ task_id: string; task_name: string; phase: number; notes: string }>;
  /** Documents collected, with the task that produced them. */
  documents: Array<{ title: string; url: string; type: string | null; task_id: string | null; uploaded_at: string }>;
  grid: Array<{ keyword: string; formats: string[]; ctas: boolean | null; overlay: string | null; look: string | null; colors: string[] }>;
  competitors: Array<{ name: string | null; handle: string | null; profile_url: string; fit: string | null; pins_per_day: number | null; pins_imported: number }>;
  /** Competitor pins imported in P2.1.6 — the biggest body of raw research. */
  competitor_pins: Array<{ competitor: string | null; title: string | null; board_name: string | null; saves: number | null; clicks: number | null; pin_url: string }>;
  market: Array<{ kind: string; title: string; detail: string | null; status: string; reject_reason: string | null }>;
  taste: Record<string, string[]> | null;
  brand: Record<string, string[] | string | null> | null;
  intake: Record<string, string | string[] | null> | null;
  clusters: Array<{ name: string; axis: string | null; topic: string | null }>;
  board_opportunities: Array<{ board_name: string; category: string | null; source: string | null; converted: boolean }>;
  baseline: Record<string, number | string | null> | null;
}

const arr = (v: unknown): string[] =>
  Array.isArray(v) ? (v as string[]).filter(Boolean)
    : typeof v === "string" && v.startsWith("{")
      ? v.slice(1, -1).split(",").map((x) => x.trim().replace(/^"|"$/g, "")).filter(Boolean)
      : [];

/** A stored answer as a person would read it back. */
function renderAnswer(a: {
  answer_bool: boolean | null; answer_text: string | null; answer_number: string | number | null;
}): string {
  if (a.answer_bool !== null) return a.answer_bool ? "Yes" : "No";
  if (a.answer_number !== null && a.answer_number !== undefined) return String(a.answer_number);
  return a.answer_text ?? "";
}

export async function loadResearchRecord(orgId: string): Promise<ResearchRecord | null> {
  const pool = organicPool();

  const [org, answers, notes, docs, grid, comps, compPins, market, taste, brand, intake, clusters, opps, baseline] =
    await Promise.all([
      pool.query<{ name: string }>(`SELECT name FROM public.organizations WHERE id = $1`, [orgId]),
      // Phases 1-3 only: this is the research record, not a log of the
      // recurring production work.
      pool.query(
        `SELECT a.task_id, a.field_key, a.answer_bool, a.answer_text, a.answer_number,
                a.evidence, a.file_url, a.file_title, a.answered_at::text,
                td.name AS task_name, td.phase, td.step
           FROM organic.task_answers a
           JOIN organic.task_definitions td ON td.id = a.task_id
          WHERE a.org_id = $1 AND td.phase <= 3
          ORDER BY td.phase, td.sort_order, a.answered_at`, [orgId]),
      pool.query(
        `SELECT ct.task_id, ct.notes, td.name AS task_name, td.phase
           FROM organic.client_tasks ct
           JOIN organic.task_definitions td ON td.id = ct.task_id
          WHERE ct.org_id = $1 AND td.phase <= 3
            AND ct.notes IS NOT NULL AND ct.notes <> ''
          ORDER BY td.phase, td.sort_order`, [orgId]),
      pool.query(
        `SELECT title, url, type::text AS type, linked_task_id, uploaded_at::text
           FROM organic.assets WHERE org_id = $1 ORDER BY uploaded_at DESC`, [orgId]),
      pool.query(
        `SELECT target_keyword, fmt_simple_pins, fmt_infographics, fmt_video_916,
                fmt_pure_aesthetic, fmt_text_heavy, has_visible_ctas,
                text_overlay_bucket, look_and_feel, hex_1, hex_2, hex_3
           FROM organic.grid_analyses WHERE org_id = $1 ORDER BY target_keyword`, [orgId]),
      pool.query(
        `SELECT c.name, c.handle, c.profile_url, c.niche_fit, c.pins_per_day_4mo,
                (SELECT COUNT(*) FROM organic.competitor_pins p WHERE p.competitor_id = c.id)::int AS pins_imported
           FROM organic.competitors c WHERE c.org_id = $1
          ORDER BY c.pins_per_day_4mo DESC NULLS LAST`, [orgId]),
      // Capped: this is a reference surface, not an export. The count per
      // competitor is on the competitor row above, so the total is never
      // misrepresented by the cap.
      pool.query(
        `SELECT c.name AS competitor, p.title, p.board_name, p.saves, p.outbound_clicks, p.pin_url
           FROM organic.competitor_pins p
           LEFT JOIN organic.competitors c ON c.id = p.competitor_id
          WHERE p.org_id = $1
          ORDER BY p.saves DESC NULLS LAST LIMIT 200`, [orgId]),
      pool.query(
        `SELECT kind, title, detail, status, reject_reason
           FROM organic.market_analysis_items WHERE org_id = $1 ORDER BY kind, title`, [orgId]),
      pool.query(`SELECT * FROM organic.taste_graph WHERE org_id = $1`, [orgId]),
      pool.query(`SELECT * FROM organic.brand_rules WHERE org_id = $1`, [orgId]),
      pool.query(
        `SELECT products_services, value_proposition, ideal_audience, brand_personality,
                business_story, geo_scale, current_marketing, traffic_sources,
                social_presence, available_content, best_performing_content,
                existing_pinterest, success_measure, campaigns_to_support,
                content_approach, evergreen_topics, seasonal_promos,
                target_markets, client_named_competitors,
                primary_goals::text[] AS primary_goals
           FROM organic.client_intake WHERE org_id = $1`, [orgId]),
      pool.query(
        `SELECT kc.name, kc.axis, t.name AS topic
           FROM organic.keyword_clusters kc
           LEFT JOIN organic.topics t ON t.id = kc.topic_id
          WHERE kc.org_id = $1 ORDER BY kc.name`, [orgId]),
      pool.query(
        `SELECT board_name, category, source_note, converted_to_board
           FROM organic.board_opportunities WHERE org_id = $1 ORDER BY board_name`, [orgId]),
      pool.query(`SELECT * FROM organic.baseline_kpis WHERE org_id = $1`, [orgId]),
    ]);

  if (org.rowCount === 0) return null;

  const answered: AnsweredItem[] = answers.rows.map((a) => {
    // The question text lives in code, not in the database — see
    // task-fields.ts. A field with no written question still shows its key,
    // because an answer with no question is still evidence.
    const set = fieldsFor(a.task_id);
    const field = set?.fields.find((f) => f.key === a.field_key);
    return {
      task_id: a.task_id,
      task_name: a.task_name,
      phase: a.phase,
      step: a.step,
      question: field?.question ?? a.field_key.replace(/_/g, " "),
      retired: !!set && !field,
      answer: renderAnswer(a),
      reasoning: a.evidence ?? null,
      file_url: a.file_url ?? null,
      file_title: a.file_title ?? null,
      answered_at: a.answered_at,
    };
  });

  const FORMATS: Array<[string, string]> = [
    ["fmt_pure_aesthetic", "pure aesthetic"], ["fmt_simple_pins", "simple product"],
    ["fmt_text_heavy", "text-heavy"], ["fmt_infographics", "infographics"], ["fmt_video_916", "9:16 video"],
  ];

  const t = taste.rows[0] as Record<string, unknown> | undefined;
  const b = brand.rows[0] as Record<string, unknown> | undefined;
  const i = intake.rows[0] as Record<string, unknown> | undefined;
  const bl = baseline.rows[0] as Record<string, unknown> | undefined;

  return {
    org_id: orgId,
    name: org.rows[0].name,
    answers: answered,
    notes: notes.rows.map((n) => ({ task_id: n.task_id, task_name: n.task_name, phase: n.phase, notes: n.notes })),
    documents: docs.rows.map((d) => ({
      title: d.title, url: d.url, type: d.type, task_id: d.linked_task_id, uploaded_at: d.uploaded_at,
    })),
    grid: grid.rows.map((g) => ({
      keyword: g.target_keyword,
      formats: FORMATS.filter(([k]) => g[k] === true).map(([, l]) => l),
      ctas: g.has_visible_ctas,
      overlay: g.text_overlay_bucket,
      look: g.look_and_feel,
      colors: [g.hex_1, g.hex_2, g.hex_3].filter(Boolean),
    })),
    competitors: comps.rows.map((c) => ({
      name: c.name, handle: c.handle, profile_url: c.profile_url,
      fit: c.niche_fit, pins_per_day: c.pins_per_day_4mo == null ? null : Number(c.pins_per_day_4mo),
      pins_imported: c.pins_imported,
    })),
    competitor_pins: compPins.rows.map((p) => ({
      competitor: p.competitor, title: p.title, board_name: p.board_name,
      saves: p.saves, clicks: p.outbound_clicks, pin_url: p.pin_url,
    })),
    market: market.rows.map((m) => ({
      kind: m.kind, title: m.title, detail: m.detail, status: m.status, reject_reason: m.reject_reason,
    })),
    taste: t
      ? Object.fromEntries(
          ["core_products", "spaces_context", "aesthetic_worlds", "moments_seasons",
           "functional_outcome", "aspirational_outcome", "related_interests",
           "content_angles", "visual_worlds", "key_moments"]
            .map((k) => [k, arr(t[k])])
            .filter(([, v]) => (v as string[]).length > 0)
        )
      : null,
    brand: b
      ? {
          positioning: (b.positioning as string) ?? null,
          tone_descriptors: arr(b.tone_descriptors),
          brand_pillars: arr(b.brand_pillars),
          never_include: arr(b.never_include),
          banned_words: arr(b.banned_words),
          approved_ctas: arr(b.approved_ctas),
          dominant_colors: arr(b.dominant_colors),
          typography: ((b.asset_locations as { typography?: string } | null)?.typography) ?? null,
        }
      : null,
    intake: i
      ? Object.fromEntries(
          Object.entries(i)
            .map(([k, v]) => [k, Array.isArray(v) || (typeof v === "string" && v.startsWith("{")) ? arr(v) : (v as string | null)])
            .filter(([, v]) => (Array.isArray(v) ? v.length > 0 : v != null && v !== ""))
        )
      : null,
    clusters: clusters.rows.map((c) => ({ name: c.name, axis: c.axis, topic: c.topic })),
    board_opportunities: opps.rows.map((o) => ({
      board_name: o.board_name, category: o.category, source: o.source_note, converted: o.converted_to_board,
    })),
    baseline: bl
      ? Object.fromEntries(
          Object.entries(bl).filter(([k, v]) => k !== "org_id" && v != null) as Array<[string, number | string]>
        )
      : null,
  };
}
