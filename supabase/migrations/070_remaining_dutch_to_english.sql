-- The rest of the Dutch, out of the database.
--
-- 069 caught fourteen guidance lines in phases 4 and 5. A full scan of every
-- shipped text column found two more places, and one of them was worse than
-- guidance: pin_status_lookup is a lookup table, so it renders wherever a
-- flagged pin is shown. All nine rows were Dutch — the interpretation and
-- the recommended action both.
--
-- These are not per-client data that a user typed. They ship with the
-- product, which makes them app text, and app text is English.

UPDATE organic.task_definitions SET guidance =
  'Session duration, bounce rate, pages per session. GA4 measures quality, not volume.'
 WHERE id = 'P5.1.2';

UPDATE organic.pin_status_lookup SET interpretation = 'Forbidden term used',
       action = 'Delete the pin'
 WHERE status_code = 'blacklisted';
UPDATE organic.pin_status_lookup SET interpretation = 'Link spam',
       action = 'Check the link and replace it'
 WHERE status_code = 'is_filtered_mp3_movie_download';
UPDATE organic.pin_status_lookup SET interpretation = 'Trigger words in the description',
       action = 'Rewrite the description'
 WHERE status_code = 'sensitive_raw_pin_text';
UPDATE organic.pin_status_lookup SET interpretation = 'Idea pin, barely distributed',
       action = 'Delete it if it is not performing'
 WHERE status_code = 'is_non_recommendable_idea_pin';
UPDATE organic.pin_status_lookup SET interpretation = 'Pin sits on a hidden board',
       action = 'Make the board public once it has 10+ pins'
 WHERE status_code = 'hidden_board';
UPDATE organic.pin_status_lookup SET interpretation = 'Unknown',
       action = 'Assess by hand'
 WHERE status_code IN ('is_sensitive_rich_pin_description',
                       'is_filtered_image_functional_fv1',
                       'is_flagged_from_css');
UPDATE organic.pin_status_lookup SET interpretation = 'Unknown',
       action = 'Assess the board name'
 WHERE status_code = 'is_sensitive_board_title';
