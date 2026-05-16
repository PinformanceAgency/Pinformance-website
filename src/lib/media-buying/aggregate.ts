import type { ChartMetric, Dimension, EntityRow } from "./types";

export interface AggMetrics {
  spend: number;
  revenue: number;
  conversions: number;
  impressions: number;
  clicks: number;
  roas: number;
  cpa: number | null;
  ctr: number;
  cpm: number;
}

export function aggregate(rows: EntityRow[]): AggMetrics {
  let spend = 0,
    revenue = 0,
    conversions = 0,
    impressions = 0,
    clicks = 0;
  for (const r of rows) {
    spend += r.spend;
    revenue += r.revenue;
    conversions += r.conversions;
    impressions += r.impressions;
    clicks += r.clicks;
  }
  const roas = spend > 0 ? revenue / spend : 0;
  const cpa = conversions > 0 ? spend / conversions : null;
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
  return { spend, revenue, conversions, impressions, clicks, roas, cpa, ctr, cpm };
}

export function getDim(row: EntityRow, key: string): string | null {
  const v = row.parsed[key];
  if (v == null) return null;
  return String(v);
}

export interface DimensionRow extends AggMetrics {
  value: string;
  label: string;
  hint: string | null;
  count: number;
}

/**
 * Aggregate entities into rows per value of one dimension. Entities with a
 * null/missing value for that dimension are dropped (we don't want them
 * distorting per-value comparisons).
 */
export function breakdownForDimension(
  entities: EntityRow[],
  dim: Dimension
): DimensionRow[] {
  const byValue = new Map<string, EntityRow[]>();
  for (const c of entities) {
    const v = getDim(c, dim.key);
    if (!v) continue;
    const arr = byValue.get(v) || [];
    arr.push(c);
    byValue.set(v, arr);
  }
  const rows: DimensionRow[] = Array.from(byValue.entries()).map(
    ([value, group]) => {
      const agg = aggregate(group);
      return {
        value,
        label: dim.label(value),
        hint: dim.hint ? dim.hint(value) : null,
        count: group.length,
        ...agg,
      };
    }
  );
  if (dim.order) {
    const idx = new Map(dim.order.map((v, i) => [v, i]));
    rows.sort((a, b) => {
      const ai = idx.get(a.value) ?? 999;
      const bi = idx.get(b.value) ?? 999;
      return ai - bi || b.spend - a.spend;
    });
  } else {
    rows.sort((a, b) => b.spend - a.spend);
  }
  return rows;
}

export interface TimeSeriesPoint {
  date: string;
  [valueKey: string]: number | string | null;
}

/**
 * Build a daily time-series dataset for one dimension. Each output row is a
 * date with one numeric field per dimension value, holding the chosen metric
 * value for that (date × value) pair. ROAS / CPA are derived from summed
 * spend, revenue, conversions so they're meaningful at the day level.
 */
export function buildTimeSeries(
  entities: EntityRow[],
  dimKey: string,
  metric: ChartMetric
): { values: string[]; data: TimeSeriesPoint[] } {
  const valueSet = new Set<string>();
  const byDateValue = new Map<
    string,
    Map<string, { spend: number; revenue: number; conversions: number }>
  >();

  for (const c of entities) {
    const v = getDim(c, dimKey);
    if (!v) continue;
    valueSet.add(v);
    for (const d of c.daily) {
      let byVal = byDateValue.get(d.date);
      if (!byVal) {
        byVal = new Map();
        byDateValue.set(d.date, byVal);
      }
      const cur = byVal.get(v) || { spend: 0, revenue: 0, conversions: 0 };
      cur.spend += d.spend;
      cur.revenue += d.revenue;
      cur.conversions += d.conversions;
      byVal.set(v, cur);
    }
  }

  const values = Array.from(valueSet);
  const dates = Array.from(byDateValue.keys()).sort();

  const data: TimeSeriesPoint[] = dates.map((date) => {
    const point: TimeSeriesPoint = { date };
    const byVal = byDateValue.get(date)!;
    for (const v of values) {
      const m = byVal.get(v);
      if (!m) {
        point[v] = null;
        continue;
      }
      let val: number | null;
      switch (metric) {
        case "spend":
          val = m.spend;
          break;
        case "revenue":
          val = m.revenue;
          break;
        case "roas":
          val = m.spend > 0 ? m.revenue / m.spend : null;
          break;
        case "cpa":
          val = m.conversions > 0 && m.spend > 0 ? m.spend / m.conversions : null;
          break;
      }
      point[v] = val;
    }
    return point;
  });
  return { values, data };
}
