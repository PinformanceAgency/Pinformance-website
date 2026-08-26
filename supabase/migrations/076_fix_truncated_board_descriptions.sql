-- Repair descriptions the 075 trim cut mid-word.
--
-- 075 clipped to 480 characters and then tried to walk back to the last
-- space in a second statement — which matched nothing, because the first
-- statement had already brought every row under 480. So a description that
-- happened to land mid-word stayed that way: "...a collection they wi".
--
-- A board description is read by Pinterest's index and by a person deciding
-- whether to follow the board. Ending mid-word costs more than the twenty
-- characters saved, so this cuts back to the last full word and closes the
-- sentence. The 400 floor still holds — nothing here is anywhere near it.

UPDATE organic.boards
   SET description = rtrim(left(description, char_length(description) - position(' ' in reverse(description))), ' ,;') || '.'
 WHERE description IS NOT NULL
   -- Only rows that do not already end on sentence punctuation, so this
   -- cannot chew a word off a description that was fine.
   AND right(description, 1) !~ '[.!?]'
   AND char_length(description) > 400;
