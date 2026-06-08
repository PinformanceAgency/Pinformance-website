-- Cached per-board organic metrics, populated during "Sync from Pinterest" by
-- attributing the account's top organic pins (which DO expose metrics via the
-- Pinterest API) to their board. This gives real impressions/saves/clicks on
-- the most active boards without per-pin analytics calls for every pin.
-- The board-health overview reads these when there's no Pinformance-tracked
-- pin_analytics for the board.
alter table boards
  add column if not exists metrics_impressions integer default 0,
  add column if not exists metrics_saves integer default 0,
  add column if not exists metrics_pin_clicks integer default 0,
  add column if not exists metrics_outbound_clicks integer default 0,
  add column if not exists metrics_synced_at timestamptz;
