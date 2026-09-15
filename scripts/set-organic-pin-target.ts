/**
 * Set the daily pin target across the organic book.
 *
 * The nightly ramp (`/api/cron/organic-pacing`) moves a store up one step at a
 * time once its two-week hold has passed. This is the deliberate override for
 * when the agency decides the whole book should be somewhere else now — which
 * is a business decision about how much organic a client is buying, not a
 * reading of the data, so it is a script somebody runs and not an automatic
 * rule.
 *
 * Ran 15-09-2026 with TARGET=2: every store had sat at 1/day since onboarding
 * because nothing had ever acted on `scale_up_eligible_date`, which is sixteen
 * pins a month — the method's starting point, never meant to be its resting
 * point. Two a day is inside module 4's 1-5 band for a new account and gives
 * roughly sixty a month.
 *
 * It only ever raises. Lowering a live store's allowance is a judgement about
 * that account and belongs in Settings, where the person doing it sees the
 * store in front of them.
 *
 *   TARGET=2 DRY_RUN=1 DOTENV_CONFIG_PATH=.env.local npx tsx scripts/set-organic-pin-target.ts
 *   TARGET=2           DOTENV_CONFIG_PATH=.env.local npx tsx scripts/set-organic-pin-target.ts
 */
import "dotenv/config";
import { organicPool } from "../src/lib/organic/db";
import { ORGANIC_DAILY_CAP, SCALE_UP_STEP_DAYS } from "../src/lib/organic/pacing";
import { computeUrlsPerMonth } from "../src/lib/organic/phase2";

const TARGET = Number(process.env.TARGET ?? "2");
const DRY = process.env.DRY_RUN === "1";

async function main() {
  if (!Number.isInteger(TARGET) || TARGET < 1 || TARGET > ORGANIC_DAILY_CAP) {
    console.error(`TARGET must be a whole number between 1 and ${ORGANIC_DAILY_CAP} (the method's ceiling).`);
    process.exit(1);
  }
  const pool = organicPool();
  const rows = await pool.query<{ org_id: string; name: string; target: number }>(
    `SELECT o.id::text AS org_id, o.name, s.daily_pin_target AS target
       FROM public.organizations o
       JOIN organic.client_settings s ON s.org_id = o.id
      ORDER BY o.name`
  );

  const { urls_per_month, explanation } = computeUrlsPerMonth(TARGET);
  console.log(`${explanation}\n`);

  let moved = 0;
  for (const r of rows.rows) {
    if (r.target >= TARGET) {
      console.log(`·  ${r.name} — already at ${r.target}/day`);
      continue;
    }
    if (!DRY) {
      await pool.query(
        `UPDATE organic.client_settings
            SET daily_pin_target = $2,
                urls_per_month = $3,
                scale_up_eligible_date = current_date + interval '${SCALE_UP_STEP_DAYS} days',
                updated_at = now()
          WHERE org_id = $1`,
        [r.org_id, TARGET, urls_per_month]
      );
    }
    moved++;
    console.log(`${DRY ? "would raise" : "raised"}  ${r.name} — ${r.target} → ${TARGET}/day`);
  }

  console.log(
    `\n${DRY ? "[dry run] " : ""}${moved} store(s) ${DRY ? "would move" : "moved"} to ${TARGET}/day ` +
    `(${urls_per_month} URLs a month). Next step in ${SCALE_UP_STEP_DAYS} days, by the nightly ramp.`
  );
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
