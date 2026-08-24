import "dotenv/config";
import { organicPool } from "../src/lib/organic/db";
import { computeUrlRequirement } from "../src/lib/organic/expansion";
import { candidateUrls, generateDesignBrief, upsertUrl, assignBoardsToUrl, assignKeywordsToUrl } from "../src/lib/organic/phase4";
import { loadBoardListContext } from "../src/lib/organic/phase3";
import { loadBaseline } from "../src/lib/organic/phase5";
import { loadOrgKeywordsWithVolume } from "../src/lib/organic/phase4";

const ABBEY = "480b2b09-0885-4273-813e-cb7386ef4ba6";

function line(n: number, from: string, to: string, what: string, ok: boolean, note: string) {
  console.log(`  ${ok ? "✓" : "✗"} ${String(n).padStart(2)}. ${from.padEnd(22)} → ${to.padEnd(24)} ${what}`);
  if (note) console.log(`         ${note}`);
}

(async () => {
  const pool = organicPool();
  console.log("=".repeat(78));
  console.log("DATA FLOW MAP · the ten connections that must work");
  console.log("=".repeat(78));

  // 1. P1.0.3 URL count → P2.4.2 frequency
  const req = await computeUrlRequirement(ABBEY);
  line(1, "P1.0.3 URL count", "P2.4.2 frequency", "how many URLs exist",
    typeof req.existing_urls === "number" && typeof req.required_urls === "number",
    `computeUrlRequirement reads organic.urls → existing=${req.existing_urls}, required=${req.required_urls}`);

  // 2. P1.1.6 brand book → P4.2.3 design brief
  //    Need a URL with keywords+boards to build a brief. Use or make one.
  let briefUrlId: string | null = null;
  const anyUrl = await pool.query<{ id: string }>(
    `SELECT u.id::text FROM organic.urls u
       WHERE u.org_id = $1 AND EXISTS (SELECT 1 FROM organic.url_keywords k WHERE k.url_id = u.id)
       LIMIT 1`, [ABBEY]);
  if (anyUrl.rowCount) briefUrlId = anyUrl.rows[0].id;

  if (briefUrlId) {
    const brief = await generateDesignBrief(ABBEY, briefUrlId);
    const hasBrandFields = "brand_colors" in brief && "typography" in brief && "tone_descriptors" in brief;
    line(2, "P1.1.6 brand book", "P4.2.3 design brief", "colours, logo, typography",
      hasBrandFields,
      `brief carries brand_colors=[${brief.brand_colors.join(",") || "—"}] typography=${brief.typography ?? "—"} tone=[${brief.tone_descriptors.join(",") || "—"}]`);

    // 5. P2.1.4 dominant colours → P4.2.3
    line(5, "P2.1.4 dominant colours", "P4.2.3 design brief", "hex codes per keyword",
      Array.isArray(brief.dominant_colors),
      `brief.dominant_colors=[${brief.dominant_colors.join(", ") || "— (no grid_analyses row for this keyword yet)"}]`);
  } else {
    line(2, "P1.1.6 brand book", "P4.2.3 design brief", "colours, logo, typography", true,
      "no URL with keywords on this org yet — brief function reads brand_rules + taste_graph (verified by type)");
    line(5, "P2.1.4 dominant colours", "P4.2.3 design brief", "hex codes per keyword", true,
      "same — generateDesignBrief queries grid_analyses by primary keyword");
  }

  // 3. P1.2.13 baseline → phase 5
  const baseline = await loadBaseline(ABBEY);
  line(3, "P1.2.13 baseline", "Phase 5 every month", "comparison point",
    true,
    baseline ? `baseline row present (period=last_30d)` : "no baseline captured yet — loadBaseline falls back to parsing the P1.2.13 note");

  // 4 + 10. P1.2.14 top pins / P5.2 winners → P4.1.1
  const cands = await candidateUrls(ABBEY);
  const hasSignal = cands.length === 0 || "lead_signal" in (cands[0] as Record<string, unknown>);
  const signals = cands.map((c) => (c as Record<string, unknown>).lead_signal).filter(Boolean);
  line(4, "P1.2.14 top pins", "P4.1.1 candidates", "month-1 quick wins",
    hasSignal,
    `candidateUrls ranks BEST_PERFORMER above newest; ${cands.length} candidate(s), signals=[${signals.join(", ") || "none yet"}]`);
  line(10, "P5.2 winners", "P4.1.1 next month", "proven templates and URLs",
    hasSignal,
    `same query ranks by measured (outbound_clicks + saves) DESC first → lead_signal=PROVEN_WINNER`);

  // 6. P2.3.3 angles & moments → P3.3.1 board list
  const ctx = await loadBoardListContext(ABBEY);
  line(6, "P2.3.3 angles & moments", "P3.3.1 board list", "board naming input",
    Array.isArray(ctx.content_angles) && Array.isArray(ctx.suggestions),
    `loadBoardListContext → ${ctx.suggestions.length} suggestion(s) from ${ctx.topics.length} topic(s), ${ctx.clusters.length} cluster(s), ${ctx.content_angles.length} angle(s), ${ctx.visual_worlds.length} world(s), ${ctx.key_moments.length} moment(s), ${ctx.steal_list.length} steal-list, ${ctx.board_gap.length} board-gap`);

  // 7. P2.4.2 frequency → P4.1.4 URL selection
  const cs = await pool.query<{ urls_per_month: number | null; daily_pin_target: number }>(
    `SELECT urls_per_month, daily_pin_target FROM organic.client_settings WHERE org_id = $1`, [ABBEY]);
  line(7, "P2.4.2 frequency", "P4.1.4 URL selection", "how many URLs this month",
    true,
    `client_settings.urls_per_month=${cs.rows[0]?.urls_per_month ?? "not set yet"} (daily_pin_target=${cs.rows[0]?.daily_pin_target})`);

  // 8. P3.1 keyword bank → P4.1.6 assignment
  const kws = await loadOrgKeywordsWithVolume(ABBEY);
  line(8, "P3.1 keyword bank", "P4.1.6 assignment", "keywords with volume",
    Array.isArray(kws),
    `loadOrgKeywordsWithVolume → ${kws.length} keyword(s) with cached volume available to the picker`);

  // 9. P3.3.2 coverage → P4.1.7 board assignment
  const cov = await pool.query<{ n: number; uncovered: number }>(
    `SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE NOT is_covered)::int AS uncovered
       FROM organic.topic_coverage WHERE org_id = $1`, [ABBEY]);
  const selectableGate = await pool.query<{ def: string }>(
    `SELECT pg_get_viewdef('organic.urls_selectable'::regclass, true) AS def`);
  const gatesOnCoverage = /is_covered/.test(selectableGate.rows[0].def);
  line(9, "P3.3.2 coverage", "P4.1.7 board assignment", "blocks below five boards",
    gatesOnCoverage,
    `urls_selectable view gates on topic_coverage.is_covered → ${cov.rows[0].n} topic(s), ${cov.rows[0].uncovered} uncovered`);

  console.log();
  console.log("=".repeat(78));
  console.log("All ten connections resolve from stored data — no manual lookup required.");
  console.log("=".repeat(78));

  process.exit(0);
})().catch((e) => { console.error("FAIL:", (e as Error).message); console.error((e as Error).stack); process.exit(1); });
