CREATE TABLE IF NOT EXISTS admins (
 id text PRIMARY KEY, email text NOT NULL UNIQUE, password_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS houses (
 id text PRIMARY KEY, name text NOT NULL, note text NOT NULL DEFAULT '',
 cep text NOT NULL, street text NOT NULL, number text NOT NULL,
 neighborhood text NOT NULL, city text NOT NULL, state text NOT NULL,
 address_key text NOT NULL UNIQUE, status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACTIVE','EMPTY')),
 lat double precision, lng double precision, place_id text, geocoded_at timestamptz,
 activated_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS access_tokens (
 id text PRIMARY KEY, house_id text NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
 token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
 id_hash text PRIMARY KEY, admin_id text REFERENCES admins(id) ON DELETE CASCADE,
 access_token_id text REFERENCES access_tokens(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL,
 CHECK ((admin_id IS NULL) <> (access_token_id IS NULL))
);
CREATE TABLE IF NOT EXISTS audit_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 house_id text NOT NULL REFERENCES houses(id), action text NOT NULL,
 actor text NOT NULL, details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_events_house_id_idx ON audit_events(house_id, id DESC);
CREATE INDEX IF NOT EXISTS access_tokens_house_id_idx ON access_tokens(house_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);
