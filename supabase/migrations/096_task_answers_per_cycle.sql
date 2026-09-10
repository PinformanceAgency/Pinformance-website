-- 096 — Een antwoord hoort bij de cycle waarin het gegeven is.
--
-- organic.task_answers stond op (org_id, task_id, field_key). Voor fase 1-3
-- klopt dat: die taken bestaan één keer per store. Fase 4 is anders -- die
-- taken bestaan één keer per CYCLE -- en er is er één met een checklist:
-- P4.2.1, de gridanalyse. Die vraagt wat Pinterest nú beloont voor het
-- primary keyword van díe URL.
--
-- Bij Fit Cherries lopen er twee cycles naast elkaar, met "padded push up
-- bras" en "small bust swimwear". Op de oude sleutel delen die één rij: wie
-- de grid voor de tweede invult, overschrijft de eerste. Zonder melding, en
-- op een scherm dat het antwoord van de andere cycle laat zien alsof het van
-- deze is.
--
-- Lege string in plaats van NULL, want een NULL in een primaire sleutel mag
-- niet en "geen cycle" is een echte waarde: zo blijft elk bestaand antwoord
-- staan waar het staat.

ALTER TABLE organic.task_answers
  ADD COLUMN IF NOT EXISTS cycle text NOT NULL DEFAULT '';

ALTER TABLE organic.task_answers DROP CONSTRAINT IF EXISTS task_answers_pkey;
ALTER TABLE organic.task_answers
  ADD CONSTRAINT task_answers_pkey PRIMARY KEY (org_id, task_id, cycle, field_key);

COMMENT ON COLUMN organic.task_answers.cycle IS
  'De cycle waarin dit antwoord is gegeven ("URL-42125807"), of lege string voor een taak die maar een keer per store bestaat.';
