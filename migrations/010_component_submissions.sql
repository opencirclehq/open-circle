CREATE TABLE opencircle_component_submissions (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE CHECK (char_length(slug) <= 60 AND slug ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'),
  status text NOT NULL CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at bigint NOT NULL,
  record jsonb NOT NULL CHECK (record->>'id' = id::text)
);
CREATE INDEX opencircle_component_submissions_review ON opencircle_component_submissions (status, created_at DESC);
