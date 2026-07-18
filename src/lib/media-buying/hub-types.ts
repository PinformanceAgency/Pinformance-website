/**
 * Client-side types for the /api/media-buying/hub response.
 * Kept in one file so both server and UI import the same shape.
 */
import type { StoreZoneRow, CampaignZoneRow } from "./zones";
import type { Benchmarks } from "./benchmarks";
import type { WoWStore, WoWAgency, Mover } from "./history";
import type { Exception } from "./exceptions";
import type {
  BuyerScorecardRow,
  DepartmentRow,
  PortfolioHealth,
} from "./rollups";
import type { ZoneThresholds } from "./config";

export interface HubResponse {
  stores: StoreZoneRow[];
  campaigns: CampaignZoneRow[];
  zone_tally: {
    stores: { red: number; orange: number; green: number; unclassified: number };
    campaigns: { red: number; orange: number; green: number; unclassified: number };
  };
  buyer_scorecard: BuyerScorecardRow[];
  department_breakdown: DepartmentRow[];
  portfolio_health: PortfolioHealth;
  benchmarks: Benchmarks;
  movers: Mover[];
  exceptions: Exception[];
  wow: { byStore: WoWStore[]; agency: WoWAgency };
  meta: {
    window: { start: string; end: string };
    window_days: number;
    benchmark_windows: { short: number; long: number };
    benchmark_min_stores: number;
    default_zone_thresholds: ZoneThresholds;
    default_green_revenue_weekly_floor: number;
  };
}
