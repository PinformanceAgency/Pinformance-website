-- Add Pinterest-sourced pin count to the boards table so the UI can
-- display accurate pin counts without counting local Pinformance pins.
ALTER TABLE boards
  ADD COLUMN IF NOT EXISTS pin_count integer DEFAULT 0;
