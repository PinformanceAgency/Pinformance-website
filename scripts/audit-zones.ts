/**
 * Print every configured active store with its live 7d numbers + the
 * classifyZone() verdict, so we can eyeball which classifications look off.
 */
import { Client } from "pg";
import "dotenv/config";
import { classifyZone } from "../src/lib/media-buying/config";

async function main() {
  const c = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  try {
    const { rows: stores } = await c.query(`
      SELECT o.id, o.name,
             s.breakeven_roas, s.invoice_roas,
             s.invoicing_model, s.min_monthly_spend,
             s.zone_thresholds, s.media_buyer
        FROM organizations o
        JOIN store_settings s ON s.org_id = o.id
       WHERE s.department IS NOT NULL
         AND s.breakeven_roas IS NOT NULL
         AND (s.is_active IS NULL OR s.is_active = true)
       ORDER BY o.name
    `);

    const orgIds = stores.map((s) => s.id);
    const { rows: metrics } = await c.query(
      `SELECT org_id, SUM(spend)::float AS spend, SUM(revenue)::float AS revenue
         FROM pinterest_metrics_snapshots
        WHERE entity_type = 'account'
          AND org_id = ANY($1::uuid[])
          AND snapshot_date >= (current_date - INTERVAL '7 days')::date
          AND snapshot_date <= (current_date - INTERVAL '1 day')::date
        GROUP BY org_id`,
      [orgIds]
    );
    const byOrg = new Map(
      metrics.map((r) => [r.org_id, { spend: r.spend ?? 0, revenue: r.revenue ?? 0 }])
    );

    console.log(
      "Store".padEnd(24),
      "Buyer".padEnd(8),
      "Model".padEnd(11),
      "BER".padEnd(6),
      "Inv".padEnd(6),
      "Spend".padStart(8),
      "Rev".padStart(8),
      "ROAS".padStart(6),
      "Zone"
    );
    console.log("─".repeat(96));
    for (const s of stores) {
      const t = byOrg.get(s.id) ?? { spend: 0, revenue: 0 };
      const roas = t.spend > 0 ? t.revenue / t.spend : null;
      const z = classifyZone({
        liveRoas: roas,
        breakevenRoas: s.breakeven_roas != null ? Number(s.breakeven_roas) : null,
        invoiceRoas: s.invoice_roas != null ? Number(s.invoice_roas) : null,
        spend: t.spend,
        windowRevenue: t.revenue,
        overrides: s.zone_thresholds,
        invoicingModel: s.invoicing_model ?? "revenue_fee",
        minMonthlySpend:
          s.min_monthly_spend != null ? Number(s.min_monthly_spend) : null,
      });
      console.log(
        s.name.padEnd(24),
        (s.media_buyer ?? "-").padEnd(8),
        (s.invoicing_model ?? "revenue_fee").padEnd(11),
        String(Number(s.breakeven_roas).toFixed(2)).padEnd(6),
        String(
          s.invoice_roas != null ? Number(s.invoice_roas).toFixed(2) : "-"
        ).padEnd(6),
        `$${Math.round(t.spend)}`.padStart(8),
        `$${Math.round(t.revenue)}`.padStart(8),
        (roas != null ? roas.toFixed(2) : "-").padStart(6),
        (z ?? "-").toUpperCase()
      );
    }
  } finally {
    await c.end();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
