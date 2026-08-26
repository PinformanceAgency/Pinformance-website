-- The file belongs to the question, not to the task.
--
-- Attaching evidence used to be a task-level act: finish the task, get a
-- dialog, paste a link, and it landed in the Assets library linked to the
-- whole task. On a task with six checks that is one attachment for six
-- questions, and no way to say which one it answers. So the person who reads
-- it later has the file and has to work out what it was proving.
--
-- It was also an extra step at exactly the wrong moment. You are looking at
-- one question, you have the file for that question open, and the place to
-- put it is behind finishing the entire task.
--
-- The attachment now lives on the answer row: same natural key, same upsert,
-- saved as you go. Two columns rather than a join to assets, because a join
-- would mean creating an asset record to answer a checkbox — the extra
-- document that made this harder in the first place. Links pasted here are
-- still picked up into the Assets library by autoLinkAssetsFromText(), so
-- nothing is lost from the library view; it simply is not a step any more.

ALTER TABLE organic.task_answers
  ADD COLUMN IF NOT EXISTS file_url   text,
  ADD COLUMN IF NOT EXISTS file_title text;
