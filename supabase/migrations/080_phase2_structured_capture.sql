-- Two phase-2 tasks that had no structured home.
--
-- P2.1.7 asks for pin URL, title, description, annotations and colours per
-- keyword. P2.3.2 asks for the affinities of the engaged audience, with the
-- surprising ones called out because the method says those produce the best
-- content angles. Both were free-text note boxes, so the data existed as
-- prose and reached nothing.
--
-- Two tables rather than one, and neither folded into an existing one.
-- competitor_pins is per competitor; these are top pins per KEYWORD and
-- include our own. taste_graph.related_interests is a flat array with no
-- room for the strength or the judgement of whether a correlation was
-- surprising, which is the part worth keeping.
--
-- RLS on both, matching every other organic table: has_org_access to read,
-- can_edit_org to write.

CREATE TABLE IF NOT EXISTS organic.top_pin_designs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  keyword      text NOT NULL,
  pin_url      text NOT NULL,
  title        text,
  description  text,
  -- What Pinterest's AI tagged the pin with. Research input only: an
  -- annotation is not a keyword until it passes a volume check.
  annotations  text[] NOT NULL DEFAULT '{}',
  hex_1        text,
  hex_2        text,
  hex_3        text,
  note         text,
  recorded_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, keyword, pin_url)
);

CREATE TABLE IF NOT EXISTS organic.audience_affinities (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name         text NOT NULL,
  -- Pinterest's affinity index. Nullable: the panel does not always give a
  -- number, and inventing one would make a ranking out of a reading.
  affinity_index numeric,
  -- The whole point of the task. A predictable affinity confirms what you
  -- knew; a surprising one is where a content angle comes from.
  is_surprising boolean NOT NULL DEFAULT false,
  note         text,
  recorded_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);

ALTER TABLE organic.top_pin_designs ENABLE ROW LEVEL SECURITY;
ALTER TABLE organic.audience_affinities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_read ON organic.top_pin_designs;
DROP POLICY IF EXISTS org_write ON organic.top_pin_designs;
CREATE POLICY org_read  ON organic.top_pin_designs FOR SELECT USING (organic.has_org_access(org_id));
CREATE POLICY org_write ON organic.top_pin_designs FOR ALL    USING (organic.can_edit_org(org_id));

DROP POLICY IF EXISTS org_read ON organic.audience_affinities;
DROP POLICY IF EXISTS org_write ON organic.audience_affinities;
CREATE POLICY org_read  ON organic.audience_affinities FOR SELECT USING (organic.has_org_access(org_id));
CREATE POLICY org_write ON organic.audience_affinities FOR ALL    USING (organic.can_edit_org(org_id));

UPDATE organic.task_definitions SET expected_output =
  'Per keyword: the pin URL, its title and description, the annotations PinClicks returned and the three dominant colours. This is what the AI market analysis reads — an annotation stays research until it passes a volume check.'
 WHERE id = 'P2.1.7';
UPDATE organic.task_definitions SET expected_output =
  'The affinities of the engaged audience, with the surprising ones marked. A predictable affinity confirms what you already knew; a surprising one is where a content angle comes from.'
 WHERE id = 'P2.3.2';
