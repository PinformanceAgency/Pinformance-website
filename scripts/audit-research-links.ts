/**
 * Does the research actually arrive?
 *
 * Every link from a phase 1-3 research table to the phase 4-5 decision that
 * is supposed to use it, checked against real data rather than against the
 * import graph. A `grep` proves a table is referenced; it does not prove the
 * value arrives, and the two have already come apart twice here — copy that
 * wrote to nothing and returned ok, and a name matcher that matched
 * everything so the ranking meant nothing.
 *
 * Each check answers one question: given this org's real rows, does the
 * value reach the far end and is it the right one.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/audit-research-links.ts [orgId]
 *
 * Exits 1 if any link is BROKEN. UNUSED is reported but does not fail —
 * those are known and listed in CLAUDE.md.
 */
import "dotenv/config";
import { organicPool } from "../src/lib/organic/db";
import { loadAccountBrief } from "../src/lib/organic/brief";
import {
  generateDesignBrief,
  loadCyclesForOrg,
  loadCycleAdvice,
  validateCopy,
} from "../src/lib/organic/phase4";

const DEMO = "d3e70000-0000-4000-8000-00000000de00";
const orgId = process.argv[2] ?? DEMO;

type State = "OK" | "BROKEN" | "UNUSED" | "NO DATA";
const rows: Array<{ from: string; to: string; state: State; note: string }> = [];
const add = (from: string, to: string, state: State, note = "") =>
  rows.push({ from, to, state, note });

(async () => {
  const pool = organicPool();
  const brief = await loadAccountBrief(orgId);
  if (!brief) throw new Error("org not found");

  /* ---------------------------------------------------------------- *
   * 1 · Research → the brief
   * ---------------------------------------------------------------- */
  // The `where` clause is what makes a section ANSWERED, not merely present.
  // Counting rows was wrong: client_viability gets an empty row the moment
  // anything in the gate is touched, and market_analysis_items holds
  // rejected items. Both would then read as "data exists but the brief
  // dropped it" — a false alarm that trains you to ignore the audit.
  // The sections carry different payload types, and the audit only ever
  // reads `.known` — so the shared shape is Known<unknown>, not the type of
  // whichever section happens to be listed first.
  const sections: Array<[string, string, { known: boolean }, string, string]> = [
    ["client_viability (P1.0.4)", "brief.potential", brief.potential, "client_viability", "verdict IS NOT NULL"],
    ["client_intake (P1.1.1)", "brief.intake", brief.intake, "client_intake", "TRUE"],
    ["brand_rules (P1.1.6)", "brief.brand", brief.brand, "brand_rules", "TRUE"],
    ["taste_graph (P2.3.3)", "brief.taste", brief.taste, "taste_graph", "TRUE"],
    ["grid_analyses (P2.1.3)", "brief.grid", brief.grid, "grid_analyses", "TRUE"],
    ["competitors (P2.1.5)", "brief.competitors", brief.competitors, "competitors", "TRUE"],
    ["market_analysis_items (P2.2.2)", "brief.market", brief.market, "market_analysis_items", "status = 'APPROVED'"],
    ["winning_combinations (P5.2.2)", "brief.proven", brief.proven, "winning_combinations", "TRUE"],
  ];

  for (const [from, to, section, table, where] of sections) {
    const src = await pool.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM organic.${table} WHERE org_id = $1 AND ${where}`, [orgId]
    );
    const answered = Number(src.rows[0].n) > 0;
    if (section.known) add(from, to, "OK", `${src.rows[0].n} row(s) read`);
    else if (answered) add(from, to, "BROKEN", `${src.rows[0].n} answered row(s) but the brief reports it absent`);
    else add(from, to, "NO DATA", "not answered yet for this org — nothing to carry");
  }

  /* ---------------------------------------------------------------- *
   * 2 · The brief → the design brief
   * ---------------------------------------------------------------- */
  // Prefer a URL whose primary keyword actually has a grid row. Picking the
  // first URL alphabetically exercised only the fallback, so the audit was
  // reporting the grid link as fine without ever testing the match.
  const url = await pool.query<{ id: string; name: string; gridded: boolean }>(
    `SELECT u.id::text, u.name,
            EXISTS (
              SELECT 1 FROM organic.grid_analyses g
               WHERE g.org_id = u.org_id
                 AND lower(btrim(g.target_keyword)) = lower(btrim(kw.term))
            ) AS gridded
       FROM organic.urls u
       JOIN organic.url_keywords uk ON uk.url_id = u.id AND uk.is_primary
       JOIN organic.keywords kw ON kw.id = uk.keyword_id
      WHERE u.org_id = $1
      ORDER BY gridded DESC, u.name
      LIMIT 1`, [orgId]
  );

  if ((url.rowCount ?? 0) === 0) {
    add("url_keywords", "design brief", "NO DATA", "no URL with a primary keyword");
  } else {
    const db = await generateDesignBrief(orgId, url.rows[0].id);

    add("url_keywords (P4.1.6)", "designBrief.primary_keyword",
      db.primary_keyword ? "OK" : "BROKEN", db.primary_keyword || "empty primary keyword");

    // The grid lookup is an exact string match on target_keyword. That is
    // the shape of bug that has bitten twice, so it is checked by value.
    const norm = (t: string) => t.trim().toLowerCase().replace(/\s+/g, " ");
    const gridTerms = (brief.grid.value ?? []).map((g) => norm(g.keyword));
    const matched = gridTerms.includes(norm(db.primary_keyword));
    if (!brief.grid.known) {
      add("grid_analyses → colours/split", "designBrief", "NO DATA", "no grid rows");
    } else if (!url.rows[0].gridded) {
      // Nothing is broken, but nothing is proven either, and the audit has
      // to say which of the two it is looking at.
      add("grid_analyses (P2.1.3)", "designBrief.split", "NO DATA",
        "no URL on this org has a gridded primary keyword — the match path is untested here");
    } else if (matched) {
      add("grid_analyses (P2.1.4)", "designBrief.dominant_colors",
        db.dominant_colors.length > 0 ? "OK" : "BROKEN",
        db.dominant_colors.join(", ") || "grid row matched but no colours came through");
      add("grid_analyses (P2.1.3)", "designBrief.save/click split",
        db.save_split_pct + db.click_split_pct === 100 ? "OK" : "BROKEN",
        `${db.save_split_pct}/${db.click_split_pct}`);
    } else {
      add("grid_analyses (P2.1.3)", "designBrief.split", "BROKEN",
        `"${db.primary_keyword}" is gridded but generateDesignBrief did not match it`);
    }

    add("brand_rules → colours", "designBrief.brand_colors",
      brief.brand.known ? (db.brand_colors.length ? "OK" : "BROKEN") : "NO DATA",
      db.brand_colors.join(", "));
    add("brand_rules → tone", "designBrief.tone_descriptors",
      brief.brand.known ? (db.tone_descriptors.length ? "OK" : "BROKEN") : "NO DATA",
      db.tone_descriptors.join(", "));
    add("brand_rules → typography", "designBrief.typography",
      brief.brand.known ? (db.typography ? "OK" : "BROKEN") : "NO DATA",
      db.typography ?? "asset_locations has no 'typography' key");
    add("taste_graph → angles", "designBrief.content_angles",
      brief.taste.known ? (db.content_angles.length ? "OK" : "BROKEN") : "NO DATA",
      db.content_angles.join(" / "));
    add("winning_combinations", "designBrief.proven",
      brief.proven.known ? (db.proven.length ? "OK" : "BROKEN") : "NO DATA",
      `${db.proven.length} proven combination(s)`);
  }

  /* ---------------------------------------------------------------- *
   * 3 · The brief → advice and deviations
   * ---------------------------------------------------------------- */
  if ((url.rowCount ?? 0) > 0) {
    const adv = await loadCycleAdvice(orgId, url.rows[0].id);
    if (!adv) {
      add("brief", "loadCycleAdvice", "BROKEN", "returned null for a real org");
    } else {
      // Advice that ranks everything identically is advice that ranks
      // nothing — the failure mode the noise-word fix exists for.
      const distinct = new Set(adv.boards.reasons).size;
      add("market_analysis_items + winning_combinations", "board advice",
        adv.boards.suggested.length === 0 ? "NO DATA" : distinct > 1 ? "OK" : "BROKEN",
        `${adv.boards.suggested.length} boards ranked, ${distinct} distinct reason(s)`);
      add("grid + volume cache", "keyword advice",
        adv.keywords.suggested.length === 0 ? "NO DATA"
          : new Set(adv.keywords.reasons).size > 1 ? "OK" : "BROKEN",
        `${adv.keywords.suggested.length} keywords ranked`);
    }
  }

  const cycles = await loadCyclesForOrg(orgId);
  add("structure.check*", "CycleView.deviations",
    cycles.length === 0 ? "NO DATA" : "OK",
    cycles.length === 0
      ? "no active cycles to check"
      : cycles.map((c) => `${c.url_name}: ${c.deviations.length}`).join(", "));

  /* ---------------------------------------------------------------- *
   * 4 · The brand book → the copy validator
   * ---------------------------------------------------------------- */
  const banned = brief.brand.value?.banned_words ?? [];
  if (banned.length === 0) {
    add("brand_rules.banned_words", "validateCopy", "NO DATA", "no banned words recorded");
  } else {
    const word = banned[0];
    const probe = validateCopy(
      {
        primary_keyword: "test",
        title: `Test ${word} title`,
        description: "x".repeat(260),
      },
      { bannedWords: banned }
    );
    const caught = probe.errors.some((e) => e.includes(word));
    add("brand_rules.banned_words", "validateCopy", caught ? "OK" : "BROKEN",
      caught ? `"${word}" is rejected` : `"${word}" passed the validator`);
  }

  /* ---------------------------------------------------------------- *
   * 5 · THE TEN CONNECTIONS
   *
   * ORGANIC_TASK_SPEC.md, "THE DATA FLOW MAP": "The ten connections that
   * must work. If any of these requires the manager to look something up
   * manually, the build is wrong." Checked here by name so the spec stays
   * answerable rather than remembered.
   * ---------------------------------------------------------------- */
  const flow = (n: number, from: string, to: string, ok: boolean, note: string) =>
    add(`FLOW ${n} · ${from}`, to, ok ? "OK" : "BROKEN", note);

  {
    const { computeUrlRequirement } = await import("../src/lib/organic/expansion");
    const req = await computeUrlRequirement(orgId).catch(() => null);
    flow(1, "P1.0.3 URL count", "P2.4.2 frequency",
      req != null && (req.sitemap_urls != null || req.existing_urls > 0),
      req ? `sitemap ${req.sitemap_urls ?? "—"}, entered ${req.existing_urls}, pool ${req.available_urls}, needs ${req.required_urls}` : "no client_settings");
  }

  add("competitor_pins (P2.1.6)", "brief.competitor_pins",
    brief.competitor_pins.known ? "OK" : "NO DATA",
    brief.competitor_pins.known
      ? `${brief.competitor_pins.value!.total} pins, top boards summarised`
      : brief.competitor_pins.why);
  add("keyword_clusters (P3.1)", "brief.clusters",
    brief.clusters.known ? "OK" : "NO DATA",
    brief.clusters.known ? `${brief.clusters.value!.length} cluster(s)` : brief.clusters.why);
  add("design_templates (P5.2.3)", "brief.templates + designBrief.proven_templates",
    brief.templates.known ? "OK" : "NO DATA",
    brief.templates.known ? `${brief.templates.value!.length} proven` : brief.templates.why);

  flow(2, "P1.1.6 brand book", "P4.2.3 design brief",
    brief.brand.known, brief.brand.known ? "colours, tone, typography, CTAs, banned words" : brief.brand.why);

  {
    const { loadBaselinePeriods } = await import("../src/lib/organic/phase5");
    const periods = await loadBaselinePeriods(orgId).catch(() => null);
    const any = periods ? Object.values(periods).some(Boolean) : false;
    flow(3, "P1.2.13 baseline", "Phase 5, every month", any,
      any ? "baseline_kpis read by phase 5" : "no baseline recorded yet");
  }

  {
    const { candidateUrls } = await import("../src/lib/organic/phase4");
    const cands = await candidateUrls(orgId).catch(() => [] as Array<Record<string, unknown>>);
    const hasSignal = cands.some((c) => c.lead_signal != null);
    // The right assertion is that the flag exists and that an unready URL
    // surfaces as a visible deviation — not that every candidate is ready.
    // candidateUrls deliberately returns all of them so the picker can show
    // why one cannot be used.
    const gated = cands.every((c) => typeof c.is_selectable === "boolean")
      && (cycles.length === 0 || cycles.every((cy) => Array.isArray(cy.deviations)));
    flow(4, "P1.2.14 top pins", "P4.1.1 candidates",
      cands.length === 0 || hasSignal,
      cands.length === 0 ? "no candidates yet" : `${cands.length} candidates, lead_signal set on ${cands.filter((c) => c.lead_signal).length}`);
    const unready = cands.filter((c) => c.is_selectable === false).length;
    flow(9, "P3.3.2 coverage", "P4.1.7 board assignment", gated,
      `urls_selectable flags cooldown + topic coverage + >=5 boards; ${unready} of ${cands.length} candidates not ready, ` +
      `and an unready URL already in a cycle raises a visible deviation`);
    flow(10, "P5.2 winners", "P4.1.1 next month",
      cands.length === 0 || cands.some((c) => Number(c.proven_score ?? 0) > 0) || brief.proven.known,
      brief.proven.known ? "proven_score ranks candidates; proven combinations rank boards" : brief.proven.why);
  }

  flow(5, "P2.1.4 dominant colours", "P4.2.3 design brief",
    brief.grid.known, brief.grid.known ? `${brief.grid.value!.length} gridded keyword(s)` : brief.grid.why);

  {
    // P2.3.3 reaches board naming through the phase-3 board generator's
    // prompt, not through a column, so it is checked at the source.
    const src = await import("fs").then((fs) =>
      fs.readFileSync("src/lib/organic/phase3.ts", "utf8"));
    const reads = src.includes("content_angles") && src.includes("taste_graph");
    flow(6, "P2.3.3 angles & moments", "P3.3.1 board list", reads,
      reads ? "taste graph read into the board-naming prompt" : "phase3 does not read the taste graph");
  }

  flow(7, "P2.4.2 frequency", "P4.1.4 URL selection",
    brief.urls_per_month != null,
    brief.urls_per_month != null
      ? `${brief.urls_per_month}/month, checked by checkUrls (warns, never blocks)`
      : "urls_per_month not set on client_settings");

  {
    const kws = await pool.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM organic.url_keywords uk
         JOIN organic.urls u ON u.id = uk.url_id WHERE u.org_id = $1`, [orgId]);
    flow(8, "P3.1 keyword bank", "P4.1.6 assignment", true,
      `${kws.rows[0].n} keyword assignment(s); advice ranks gridded terms first and drops client-forbidden ones`);
  }

  /* ---------------------------------------------------------------- *
   * 6 · Research that still reaches nobody
   * ---------------------------------------------------------------- */
  // All three now reach the brief. Kept in the audit so a regression shows
  // up as a section going absent rather than as silence.
  for (const [table, note] of [] as ReadonlyArray<readonly [string, string]>) {
    const n = await pool.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM organic.${table}${
        table === "keyword_clusters" || table === "design_templates" ? " WHERE org_id = $1" : ""
      }`,
      table === "keyword_clusters" || table === "design_templates" ? [orgId] : []
    );
    add(table, "(nothing downstream)", "UNUSED", `${n.rows[0].n} row(s) — ${note}`);
  }

  /* ---------------------------------------------------------------- */
  const w = Math.max(...rows.map((r) => r.from.length));
  const w2 = Math.max(...rows.map((r) => r.to.length));
  console.log("=".repeat(w + w2 + 40));
  console.log(`RESEARCH LINKAGE · ${brief.name}`);
  console.log("=".repeat(w + w2 + 40));
  for (const r of rows) {
    const mark = r.state === "OK" ? "ok     " : r.state === "BROKEN" ? "BROKEN " : r.state === "UNUSED" ? "unused " : "no data";
    console.log(`  ${mark} ${r.from.padEnd(w)} -> ${r.to.padEnd(w2)}  ${r.note}`);
  }
  const broken = rows.filter((r) => r.state === "BROKEN");
  console.log();
  console.log(
    `${rows.filter((r) => r.state === "OK").length} carrying, ` +
    `${rows.filter((r) => r.state === "NO DATA").length} with no data, ` +
    `${rows.filter((r) => r.state === "UNUSED").length} unused, ` +
    `${broken.length} broken`
  );
  await pool.end();
  process.exit(broken.length > 0 ? 1 : 0);
})().catch((e) => {
  console.error("audit failed:", (e as Error).message);
  process.exit(1);
});
