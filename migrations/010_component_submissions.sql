CREATE TABLE opencircle_component_submissions (
  id uuid PRIMARY KEY,
  link text NOT NULL UNIQUE CHECK (char_length(link) <= 300),
  status text NOT NULL CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at bigint NOT NULL,
  record jsonb NOT NULL CHECK (record->>'id' = id::text)
);
CREATE INDEX opencircle_component_submissions_review ON opencircle_component_submissions (status, created_at DESC);
