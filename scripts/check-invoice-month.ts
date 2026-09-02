/**
 * Controleert `StoreZoneRow.last_month` -- de cijfers waar de facturen op
 * geschreven worden -- tegen een rauwe SQL-som over dezelfde maand.
 *
 * WAAROM DIT BESTAAT
 * ------------------
 * De factuurtabel op Zones > Last month leest niet uit een aparte query maar
 * uit dezelfde maandbuckets als de zone-kleuren. Dat is precies goed (kleur en
 * bedrag kunnen niet uit elkaar lopen) en precies riskant: één verkeerd
 * bucket-grensgeval en er wordt op de verkeerde maand gefactureerd zonder dat
 * iets op het scherm er anders uitziet. De maand wordt bewust op NAAM gezocht
 * en niet op index, want het zone-venster eindigt GISTEREN -- op de 1e en 2e
 * van de maand liggen de drie buckets een maand naar achteren. Er wordt op de
 * 3e/4e gefactureerd, dus dat grensgeval ligt dicht tegen de praktijk aan.
 *
 * Het script vergelijkt per store spend, revenue, het aantal dagen met data en
 * de laatst gemeten dag, en eindigt met exit 1 bij elk verschil.
 *
 * DRAAIEN
 *     DOTENV_CONFIG_PATH=.env.local npx tsx scripts/check-invoice-month.ts
 *
 * Met MONTH=2026-07 wordt een andere maand nagerekend (moet binnen de drie
 * buckets vallen die computeStoreZones ophaalt, dus hooguit twee terug).
 */
import "dotenv/config";
import { Client } from "pg";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeStoreZones, lastCompletedMonthKey } from "@/lib/media-buying/zones";

async function main() {
  const month = process.env.MONTH || lastCompletedMonthKey();
  const start = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  console.log(`Factuurmaand: ${month}  (${start} t/m ${end})\n`);

  const rows = await computeStoreZones(createAdminClient());

  const pg = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await pg.connect();
  const res = await pg.query(
    `SELECT org_id,
            SUM(spend)::float8    AS spend,
            SUM(revenue)::float8  AS revenue,
            COUNT(DISTINCT snapshot_date)::int AS days,
            MAX(snapshot_date)::text AS through
       FROM pinterest_metrics_snapshots
      WHERE entity_type = 'account'
        AND snapshot_date >= $1 AND snapshot_date <= $2
      GROUP BY org_id`,
    [start, end]
  );
  await pg.end();
  const raw = new Map(res.rows.map((r) => [r.org_id as string, r]));

  const near = (a: number, b: number) => Math.abs(a - b) < 0.01;
  let bad = 0;
  let withData = 0;
  for (const s of rows) {
    const lm = s.last_month;
    if (lm.month !== month && !process.env.MONTH) {
      console.log(`VERKEERDE MAAND ${s.store_name}: ${lm.month} i.p.v. ${month}`);
      bad++;
      continue;
    }
    if (lm.month !== month) continue; // andere maand opgevraagd: niets te vergelijken
    const r = raw.get(s.org_id);
    const expSpend = r ? Number(r.spend) : 0;
    const expRev = r ? Number(r.revenue) : 0;
    const expDays = r ? (r.days as number) : 0;
    const expThrough = r ? (r.through as string) : null;
    if (lm.days_with_data > 0) withData++;
    if (
      !near(lm.spend, expSpend) ||
      !near(lm.revenue, expRev) ||
      lm.days_with_data !== expDays ||
      lm.measured_through !== expThrough
    ) {
      bad++;
      console.log(
        `AFWIJKING ${s.store_name}: spend ${lm.spend} vs ${expSpend}, revenue ${lm.revenue} vs ${expRev}, dagen ${lm.days_with_data} vs ${expDays}, t/m ${lm.measured_through} vs ${expThrough}`
      );
    }
  }

  const listed = rows.filter((s) => s.configured && s.last_month.days_with_data > 0);
  console.log(`${rows.length} stores nagerekend, ${withData} met data, ${bad} afwijkingen.`);
  // Een dag zonder rij is GEEN ontbrekende dag: Pinterest laat een dag zonder
  // activiteit weg uit de dagsplitsing en de cron schrijft alleen wat hij
  // terugkrijgt. Nagerekend 02-09-2026 tegen Pinterest' eigen totaal voor de
  // twee stores die hier uit kwamen -- dat totaal was tot op de zesde decimaal
  // gelijk aan de som van de dagen die wij hebben, dus de afwezige dagen
  // droegen niets bij. Daarom staat dit hier ter informatie en niet als fout.
  // Een echt gat zou binnen het refresh-venster van 30 dagen sowieso de
  // volgende nacht worden bijgevuld; wat daarna nog ontbreekt, ontbreekt bij
  // Pinterest zelf.
  const gaps = listed.filter((s) => s.last_month.gap_days > 0);
  if (gaps.length) {
    console.log(
      `\n${gaps.length} store(s) hebben dagen zonder rij binnen hun looptijd in ${month} ` +
        `(vrijwel zeker dagen zonder activiteit, geen datagat -- naslaan tegen Pinterest' ` +
        `totaal over die periode bevestigt dat): ` +
        gaps
          .map(
            (s) =>
              `${s.store_name} (${s.last_month.measured_from} t/m ${s.last_month.measured_through}, ${s.last_month.gap_days}d)`
          )
          .join(", ")
    );
  }
  const partial = listed.filter(
    (s) => s.last_month.gap_days === 0 && s.last_month.days_with_data < s.last_month.days_in_month
  );
  if (partial.length) {
    console.log(
      `${partial.length} store(s) liepen maar een deel van ${month} (on-/offboarding, geen defect): ` +
        partial
          .map((s) => `${s.store_name} (${s.last_month.measured_from} t/m ${s.last_month.measured_through})`)
          .join(", ")
    );
  }

  console.log(`\nTop 10 op omzet in ${month}:`);
  for (const s of [...listed].sort((a, b) => b.last_month.revenue - a.last_month.revenue).slice(0, 10)) {
    const lm = s.last_month;
    console.log(
      `  ${s.store_name.padEnd(26)} ${(s.currency ?? "?").padEnd(4)}` +
        ` rev ${lm.revenue.toFixed(0).padStart(9)}` +
        ` spend ${lm.spend.toFixed(0).padStart(8)}` +
        ` roas ${(lm.roas ?? 0).toFixed(2).padStart(5)}` +
        ` zone ${String(lm.zone).padEnd(7)}` +
        ` drempel ${lm.scale_target.toFixed(0).padStart(7)} (${lm.scale_metric})` +
        ` dagen ${lm.days_with_data}/${lm.days_in_month}`
    );
  }

  if (bad > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
