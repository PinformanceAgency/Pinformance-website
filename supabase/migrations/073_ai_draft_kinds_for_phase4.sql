-- Phase 4 can draft now, so ai_drafts has to accept what it drafts.
--
-- The constraint listed the four kinds phase 3 produces. Phase 4 had no
-- generation at all: the waterfall created four copy_sets rows carrying a
-- primary keyword and three empty columns, and the AI design route had no
-- image prompt anywhere in the codebase. So three months of research chose
-- the URL, the keywords and the boards, and then the two things a client
-- actually sees — the words on the pin and the picture — were written from
-- scratch by whoever was free.
--
-- PIN_COPY is the copy set for one design (P4.2.8). IMAGE_PROMPT is the
-- brief a designer or an image model works from on the AI route (P4.2.4).
-- Both are drafts: ai_drafts already separates generated_text from
-- approved_text, and nothing publishes without a human in between.

ALTER TABLE organic.ai_drafts DROP CONSTRAINT IF EXISTS ai_drafts_kind_valid;
ALTER TABLE organic.ai_drafts ADD CONSTRAINT ai_drafts_kind_valid
  CHECK (kind = ANY (ARRAY[
    'DISPLAY_NAME'::text,
    'BIO'::text,
    'BOARD_DESCRIPTION'::text,
    'MARKET_ANALYSIS'::text,
    'PIN_COPY'::text,
    'IMAGE_PROMPT'::text
  ]));
