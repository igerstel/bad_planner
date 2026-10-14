CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 email text NOT NULL UNIQUE,
 password_hash text NOT NULL,
 schedule_version bigint NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash text PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
 start_minute integer NOT NULL CHECK (start_minute >= 0 AND start_minute % 15 = 0),
 end_minute integer NOT NULL CHECK (end_minute <= 1440 AND end_minute % 15 = 0 AND end_minute > start_minute),
 CONSTRAINT events_no_overlap EXCLUDE USING gist
 (user_id WITH =, int4range(start_minute, end_minute, '[)') WITH &&)
 DEFERRABLE INITIALLY DEFERRED
);

ALTER TABLE events ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false;
