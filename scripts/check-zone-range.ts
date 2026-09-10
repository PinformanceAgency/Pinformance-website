/**
 * Controleert het eigen datumbereik op Zones tegen twee dingen die het niet
 * mag tegenspreken.
 *
 * WAAROM DIT BESTAAT
 * ------------------
 * Een zelfgekozen periode heeft geen eigen schaaldrempel in de methode: de
 * weekvloer (€5k omzet) en de maandvloer (€20k) zijn allebei bewust vastgezet
 * en niet uit elkaar afgeleid. Voor een bereik wordt daarom de WEEKvloer naar
 * rato van het aantal dagen genomen. Dat levert precies één controleerbare
 * belofte op: een bereik van zeven dagen moet exact dezelfde kleur geven als
 * de weekbucket over diezelfde dagen, die er op hetzelfde scherm naast staat.
 * Lopen die twee uiteen, dan spreekt de pagina zichzelf tegen op een manier
 * die van geen enkel scherm af te lezen is -- beide getallen zien er goed uit.
 *
 * Daarnaast worden spend en revenue nagerekend tegen een rauwe SQL-som over
 * dezelfde rijen. Het bereik leest gepagineerd via PostgREST, en een
 * paginatie zonder unieke tiebreaker telt rijen dubbel of helemaal niet (zie
 * "Data conventions" in CLAUDE.md, gemeten 02-09-2026 op de zone-engine).
 *
 * DRAAIEN
 *     DOTENV_CONFIG_PATH=.env.local npx tsx scripts/check-zone-range.ts
 *
 * Met FROM=2026-08-01 TO=2026-08-31 wordt daarnaast dat bereik tegen SQL
 * gelegd; standaard is dat de vorige volle maand.
 *
 * Als derde wordt de invoercontrole zelf nagelopen. Die zit in een eigen
 * module en niet in de route, omdat een route-handler zonder request-scope
 * niet aan te roepen is -- daar is hij alleen via een ingelogde browser te
 * raken, en dus in de praktijk nooit op de randgevallen.
 */
import "dotenv/config";
import { Client } from "pg";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  computeStoreZones,
  computeStoreZonesForRange,
  lastCompletedMonthKey,
  zoneWindow,
} from "@/lib/media-buying/zones";
import { MAX_RANGE_DAYS, parseZoneRange } from "@/lib/media-buying/range-params";

/** Bedragen komen als float uit twee optelvolgordes; centen zijn genoeg. */
const near = (a: number, b: number) => Math.abs(a - b) < 0.01;
const eur = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

async function sqlTotals(pg: Client, from: string, to: string) {
  const res = await pg.query(
    `SELECT org_id,
            SUM(spend)   AS spend,
            SUM(revenue) AS revenue,
            COUNT(DISTINCT snapshot_date) AS days
       FROM pinterest_metrics_snapshots
      WHERE entity_type = 'account'
        AND snapshot_date BETWEEN $1 AND $2
      GROUP BY org_id`,
    [from, to]
  );
  return new Map(
    res.rows.map((r) => [
      r.org_id as string,
      {
        spend: Number(r.spend),
        revenue: Number(r.revenue),
        days: Number(r.days),
      },
    ])
  );
}

async function main() {
  const supabase = createAdminClient();
  const pg = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await pg.connect();
  let failures = 0;

  // ── 1. Zeven dagen bereik == de weekbucket over dezelfde dagen ───────────
  const { start, end } = zoneWindow(7);
  console.log(`Weekbelofte: ${start} t/m ${end}\n`);
  const [stores, range7] = await Promise.all([
    computeStoreZones(supabase),
    computeStoreZonesForRange(supabase, start, end),
  ]);
  const byOrg = new Map(range7.map((r) => [r.org_id, r]));
  let compared = 0;
  for (const s of stores) {
    if (!s.configured || !s.is_active) continue;
    const r = byOrg.get(s.org_id);
    if (!r) {
      console.log(`  ONTBREEKT  ${s.store_name} -- geen rij in het bereik`);
      failures++;
      continue;
    }
    compared++;
    const bucket = s.weekly_zones[3] ?? null;
    if (bucket !== r.zone) {
      console.log(
        `  VERSCHIL   ${s.store_name}: weekbucket ${bucket ?? "—"} vs bereik ${r.zone ?? "—"}` +
          ` (spend ${eur(r.spend)}, revenue ${eur(r.revenue)}, vloer ${eur(r.scale_target)} ${r.scale_metric})`
      );
      failures++;
    }
  }
  console.log(`  ${compared} stores vergeleken, ${failures} verschillen\n`);

  // ── 2. Bedragen tegen een rauwe SQL-som ─────────────────────────────────
  const month = lastCompletedMonthKey();
  const [y, m] = month.split("-").map(Number);
  const from = process.env.FROM || `${month}-01`;
  const to = process.env.TO || new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  console.log(`Bedragen tegen SQL: ${from} t/m ${to}\n`);
  const rangeMonth = await computeStoreZonesForRange(supabase, from, to);
  const sql = await sqlTotals(pg, from, to);
  let checked = 0;
  for (const r of rangeMonth) {
    const t = sql.get(r.org_id);
    // Geen rij in SQL en niets geteld is het normale geval voor een store die
    // die periode niet draaide -- geen afwijking.
    if (!t) {
      if (r.spend !== 0 || r.revenue !== 0) {
        console.log(`  VERSCHIL   ${r.store_name}: bereik telt iets, SQL niets`);
        failures++;
      }
      continue;
    }
    checked++;
    if (!near(t.spend, r.spend) || !near(t.revenue, r.revenue) || t.days !== r.days_with_data) {
      console.log(
        `  VERSCHIL   ${r.store_name}: spend ${eur(r.spend)} vs ${eur(t.spend)}, ` +
          `revenue ${eur(r.revenue)} vs ${eur(t.revenue)}, dagen ${r.days_with_data} vs ${t.days}`
      );
      failures++;
    }
  }
  console.log(`  ${checked} stores nagerekend\n`);

  // ── 3. Invoercontrole ───────────────────────────────────────────────────
  console.log("Invoercontrole\n");
  const today = "2026-09-10";
  const cases: Array<[string, string | null, string | null, boolean]> = [
    ["normaal bereik", "2026-09-07", "2026-09-10", true],
    ["één dag", "2026-09-10", "2026-09-10", true],
    ["ontbrekende parameter", null, "2026-09-10", false],
    ["geen datum", "bad", "2026-09-10", false],
    ["ISO-vorm maar geen datum", "2026-02-31", "2026-03-01", false],
    ["omgedraaid", "2026-09-10", "2026-09-01", false],
    ["in de toekomst", "2026-09-07", "2026-09-11", false],
    [`langer dan ${MAX_RANGE_DAYS} dagen`, "2020-01-01", "2026-09-10", false],
  ];
  for (const [naam, from, to, verwacht] of cases) {
    const got = parseZoneRange(from, to, today);
    if (got.ok !== verwacht) {
      console.log(`  VERSCHIL   ${naam}: verwacht ${verwacht ? "ok" : "geweigerd"}, kreeg ${got.ok ? "ok" : got.error}`);
      failures++;
    }
  }
  // De dag van vandaag moet als onvolledig gemeld worden, anders wordt een
  // halve dag tegen een hele dag drempel gelegd zonder dat iemand het ziet.
  const vandaag = parseZoneRange("2026-09-07", today, today);
  const gisteren = parseZoneRange("2026-09-01", "2026-09-09", today);
  if (!vandaag.ok || !vandaag.includes_today || !gisteren.ok || gisteren.includes_today) {
    console.log("  VERSCHIL   includes_today klopt niet");
    failures++;
  }
  console.log(`  ${cases.length + 1} gevallen nagelopen\n`);

  await pg.end();
  if (failures > 0) {
    console.log(`NIET GOED: ${failures} afwijking(en).`);
    process.exit(1);
  }
  console.log("Alles klopt.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
