-- Board health: store the most-recent pin date per board, pulled from
-- Pinterest during the boards sync. Without this we only know "last pin"
-- for pins created via Pinformance; this lets the health overview compute
-- real pin-velocity for boards whose pins were added directly on Pinterest.
alter table boards
  add column if not exists last_pin_added_at timestamptz;
