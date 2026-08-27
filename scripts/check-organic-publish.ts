/**
 * Does the organic publishing path hold together?
 *
 * P4.4.1 was a stub for months: the button called an API that answered 200
 * and returned `{ queued: 0 }`. Nothing downstream could tell the difference
 * between "published" and "pretended to". This walks the real path — resolve
 * the waterfall, run the approval gate, read the health panel, and dry-run
 * the cron query — against live rows, and prints what each step decided.
 *
 * It never posts. `publishDuePins({ dryRun: true })` counts what it would
 * send and stops there, so this is safe to run against a client account.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/check-organic-publish.ts [orgId]
 */
import "dotenv/config";
import {
  publishDuePins,
  scheduleWaterfall,
  loadPublishHealth,
  currentWaterfallForUrl,
} from "../src/lib/organic/publish";
import { organicPool } from "../src/lib/organic/db";

(async () => {
  const only = process.argv[2];
  const pool = organicPool();

  const orgs = await pool.query<{ org_id: string; name: string; n: string }>(
    `SELECT w.org_id::text AS org_id, o.name, COUNT(*)::text AS n
       FROM organic.pins p
       JOIN organic.waterfalls w ON w.id = p.waterfall_id
       JOIN public.organizations o ON o.id = w.org_id
      WHERE ($1::uuid IS NULL OR w.org_id = $1::uuid)
      GROUP BY 1, 2
      ORDER BY 3 DESC`,
    [only ?? null]
  );

  if (orgs.rowCount === 0) {
    console.log("No organic pins anywhere — generate a waterfall first (P4.3.1).");
    await pool.end();
    return;
  }

  for (const o of orgs.rows) {
    console.log(`\n${"=".repeat(72)}\n${o.name}  (${o.n} pins)\n${"=".repeat(72)}`);

    const urls = await pool.query<{ url_id: string; name: string }>(
      `SELECT DISTINCT w.url_id::text AS url_id, u.name
         FROM organic.waterfalls w
         JOIN organic.urls u ON u.id = w.url_id
        WHERE w.org_id = $1`,
      [o.org_id]
    );

    for (const u of urls.rows) {
      const wfId = await currentWaterfallForUrl(o.org_id, u.url_id);
      const rep = await scheduleWaterfall(o.org_id, wfId);
      console.log(`\n  URL "${u.name}"`);
      console.log(`    queued        ${rep.scheduled} pin(s), ${rep.first_date} → ${rep.last_date}`);
      if (rep.blocked.length > 0) {
        console.log(`    BLOCKED       ${rep.blocked.length}:`);
        for (const b of rep.blocked.slice(0, 6)) {
          console.log(`                  pin ${b.sequence}: ${b.reason}`);
        }
        if (rep.blocked.length > 6) console.log(`                  … and ${rep.blocked.length - 6} more`);
      }
      for (const w of rep.warnings) console.log(`    warning       ${w}`);
    }

    const h = await loadPublishHealth(o.org_id);
    console.log(`\n  status        planned ${h.counts.planned} · scheduled ${h.counts.scheduled} · ` +
                `published ${h.counts.published} · failed ${h.counts.failed}`);
    console.log(`    overdue       ${h.overdue}${h.stuck.length > 0 ? ` (${h.stuck.length} of them stuck)` : ""}`);
    for (const s of h.stuck.slice(0, 5)) {
      console.log(`    STUCK         pin ${s.sequence} (due ${s.scheduled_date}): ${s.reason}`);
    }
    console.log(`    next          ${h.next_scheduled ?? "—"}`);
    console.log(`    last live     ${h.last_published ?? "—"}`);
    if (h.blocker) console.log(`    BLOCKER       ${h.blocker.kind}: ${h.blocker.message}`);
    for (const f of h.failures.slice(0, 5)) {
      console.log(`    ${f.retrying ? "retry " : "FAILED"}        pin ${f.sequence} on "${f.board}": ${f.reason.slice(0, 90)}`);
    }
  }

  console.log(`\n${"=".repeat(72)}\nCRON DRY RUN — what /api/cron/organic-post-pins would do now\n${"=".repeat(72)}`);
  const run = await publishDuePins({ orgId: only, dryRun: true });
  console.log(`  due ${run.due} · would publish ${run.published} · deferred ${run.deferred} · failed ${run.failed}`);
  for (const r of run.orgs) {
    console.log(`  ${r.org_name}: +${r.published} / defer ${r.deferred}${r.note ? ` (${r.note})` : ""}`);
  }
  for (const r of run.reconnect_required) {
    console.log(`  RECONNECT ${r.org_name}: ${r.reason} — ${r.message}`);
  }

  await pool.end();
})().catch((e) => {
  console.error("check failed:", e);
  process.exit(1);
});
