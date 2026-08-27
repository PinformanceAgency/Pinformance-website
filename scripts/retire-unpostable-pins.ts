/**
 * Take the pins that can never be posted out of the queue.
 *
 * WHY
 * ---
 * post-pins picks the ten oldest due pins per store. A pin with no image and
 * no video, or on a board that was never created on Pinterest, cannot be
 * posted — and until 27-08-2026 the cron simply skipped it, leaving its status
 * and its scheduled_at untouched. So it came back as one of the ten oldest on
 * the next run, and the one after that, forever.
 *
 * Fit Cherries' ten oldest were all unpostable — nine with no image, one with
 * no board id — so the 131 pins queued behind them had not moved since 2 July.
 * The cron now retires these as it meets them; this clears the ones already
 * sitting in the queue in one pass instead of ten at a time.
 *
 * WHAT IT DOES NOT DO
 * -------------------
 * Delete anything. The pins go to `failed` with a reason in rejected_reason,
 * so the titles, descriptions and keywords already written stay findable — a
 * store whose images never generated needs them regenerated, not retyped.
 *
 * RUN
 *     RETIRE_PINS_DRY_RUN=1 DOTENV_CONFIG_PATH=.env.local npx tsx scripts/retire-unpostable-pins.ts
 *     DOTENV_CONFIG_PATH=.env.local npx tsx scripts/retire-unpostable-pins.ts
 */
import "dotenv/config";
import { Client } from "pg";

const DRY = process.env.RETIRE_PINS_DRY_RUN === "1";

const NO_MEDIA = "no image or video on the pin — regenerate the creative";
const NO_BOARD = "board has no Pinterest board ID — assign or create the board first";

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  const { rows } = await c.query<{
    name: string; reden: string; n: string;
  }>(`
    SELECT o.name,
           CASE WHEN p.image_url IS NULL AND p.video_url IS NULL
                THEN 'no_media' ELSE 'no_board' END AS reden,
           count(*)::text AS n
      FROM public.pins p
      JOIN public.organizations o ON o.id = p.org_id
      LEFT JOIN public.boards b ON b.id = p.board_id
     WHERE p.status IN ('scheduled', 'approved')
       AND ( (p.image_url IS NULL AND p.video_url IS NULL)
             OR p.board_id IS NULL
             OR b.pinterest_board_id IS NULL )
     GROUP BY o.name, 2
     ORDER BY o.name, 2`);

  if (rows.length === 0) {
    console.log("Niets te doen — geen onpostbare pins in de wachtrij.");
    await c.end();
    return;
  }

  console.log(`${DRY ? "DROOGLOOP — " : ""}onpostbare pins in de wachtrij:\n`);
  let total = 0;
  for (const r of rows) {
    const label = r.reden === "no_media" ? "zonder afbeelding/video" : "zonder Pinterest-bord";
    console.log(`  ${String(r.n).padStart(4)}  ${label.padEnd(24)} ${r.name}`);
    total += Number(r.n);
  }
  console.log(`\n  ${String(total).padStart(4)}  totaal`);

  if (DRY) {
    console.log("\nDroogloop: er is niets gewijzigd.");
    await c.end();
    return;
  }

  // Media first, so a pin missing both an image and a board is reported as the
  // thing that has to be fixed first — you cannot post it either way, but the
  // creative is the harder half.
  const media = await c.query(
    `UPDATE public.pins SET status = 'failed', rejected_reason = $1, updated_at = now()
      WHERE status IN ('scheduled','approved') AND image_url IS NULL AND video_url IS NULL`,
    [NO_MEDIA]
  );
  const board = await c.query(
    `UPDATE public.pins p SET status = 'failed', rejected_reason = $1, updated_at = now()
       FROM (SELECT p2.id FROM public.pins p2
               LEFT JOIN public.boards b ON b.id = p2.board_id
              WHERE p2.status IN ('scheduled','approved')
                AND (p2.board_id IS NULL OR b.pinterest_board_id IS NULL)) x
      WHERE p.id = x.id`,
    [NO_BOARD]
  );

  console.log(`\nOp failed gezet: ${media.rowCount} zonder media, ${board.rowCount} zonder bord.`);
  console.log("Ze staan nog in de database met de reden erbij — niets verwijderd.");
  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
