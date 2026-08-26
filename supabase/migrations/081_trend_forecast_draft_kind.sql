-- ai_drafts gains TREND_FORECAST (P5.3.3).
--
-- Same shape as 073 added PIN_COPY and IMAGE_PROMPT for phase 4: the kind
-- column is a CHECK constraint, not an enum, so it is extended rather than
-- altered. The forecast is a draft like the others — written by the model,
-- approved by a person, and ai_drafts already separates generated_text from
-- approved_text.

ALTER TABLE organic.ai_drafts DROP CONSTRAINT IF EXISTS ai_drafts_kind_valid;
ALTER TABLE organic.ai_drafts ADD CONSTRAINT ai_drafts_kind_valid
  CHECK (kind = ANY (ARRAY[
    'DISPLAY_NAME'::text, 'BIO'::text, 'BOARD_DESCRIPTION'::text,
    'MARKET_ANALYSIS'::text, 'PIN_COPY'::text, 'IMAGE_PROMPT'::text,
    'TREND_FORECAST'::text
  ]));
