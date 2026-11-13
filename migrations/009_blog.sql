CREATE TABLE opencircle_blog_posts (
  id uuid PRIMARY KEY,
  slug text UNIQUE CHECK (char_length(slug) <= 80 AND slug ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'),
  author_id bigint NOT NULL CHECK (author_id > 0),
  review text NOT NULL CHECK (review IN ('draft', 'pending', 'approved', 'changes', 'rejected')),
  visible boolean NOT NULL,
  featured boolean NOT NULL,
  published_at bigint,
  submitted_at bigint,
  updated_at bigint NOT NULL,
  document jsonb NOT NULL CHECK (document->>'id' = id::text)
);
CREATE INDEX opencircle_blog_public ON opencircle_blog_posts (featured DESC, published_at DESC, id) WHERE visible;
CREATE INDEX opencircle_blog_author ON opencircle_blog_posts (author_id, updated_at DESC);
CREATE INDEX opencircle_blog_author_public ON opencircle_blog_posts (author_id, published_at DESC, id) WHERE visible;
CREATE INDEX opencircle_blog_review ON opencircle_blog_posts (review, submitted_at, id);
