-- Two numbers, taken from the build reference's section 2.
--
-- The reference contradicts itself in two places, and section 2 is the one
-- headed "HARD RULES — NUMERIC REFERENCE", so it wins both:
--
--   Seasonal ramp-up      6-10 weeks before peak   (phase 4 text said 8-12)
--   Board description     400-480 characters       (this CHECK said 400-500)
--
-- Order matters here. Five of six existing descriptions sit between 481 and
-- 500, so tightening the constraint first would fail the migration. They are
-- trimmed at a sentence boundary rather than mid-word: a board description
-- is read by Pinterest and by a person, and a description cut mid-sentence
-- is worse than one twenty characters longer.

-- 1 · bring existing rows inside the new ceiling.
UPDATE organic.boards
   SET description = rtrim(left(description, 480), ' ,;')
 WHERE description IS NOT NULL AND char_length(description) > 480;

-- Anything the blunt trim left mid-word gets cut back to its last space.
UPDATE organic.boards
   SET description = left(description, GREATEST(400, position_of_last_space)) 
  FROM (
    SELECT id, length(description) - position(' ' in reverse(description)) AS position_of_last_space
      FROM organic.boards
     WHERE description IS NOT NULL AND char_length(description) > 480
  ) trimmed
 WHERE organic.boards.id = trimmed.id;

-- 2 · tighten the constraint.
ALTER TABLE organic.boards DROP CONSTRAINT IF EXISTS description_length;
ALTER TABLE organic.boards ADD CONSTRAINT description_length
  CHECK (description IS NULL
         OR (char_length(description) >= 400 AND char_length(description) <= 480));
