-- Undo a full stop 076 added to a description that already ended in one.
--
-- 076 appended "." to any description not ending in [.!?]. One board ends
-- with an emoji, which that class does not match, so it got a second
-- terminator: "...enjoy the moment..". Small, visible, and mine.
--
-- Matched on the doubled terminator itself rather than on the emoji, so it
-- cannot touch a description that legitimately ends in an ellipsis — those
-- have three, not two.

UPDATE organic.boards
   SET description = left(description, char_length(description) - 1)
 WHERE description ~ '(?<![.])\.\.$';
