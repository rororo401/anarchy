PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS events (
  id text PRIMARY KEY,
  pubkey text NOT NULL,
  kind integer NOT NULL,
  created_at integer NOT NULL,
  content text NOT NULL,
  tags text NOT NULL,
  raw text NOT NULL,
  received_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted integer NOT NULL DEFAULT 0,
  hidden integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS event_relays (
  event_id text NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  relay_url text NOT NULL,
  first_seen_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (event_id, relay_url)
);

CREATE TABLE IF NOT EXISTS posts (
  event_id text PRIMARY KEY REFERENCES events(id),
  pubkey text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  author_name text NOT NULL,
  created_at integer NOT NULL,
  deleted integer NOT NULL DEFAULT 0,
  hidden integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS comments (
  event_id text PRIMARY KEY REFERENCES events(id),
  root_event_id text NOT NULL,
  parent_event_id text NOT NULL,
  pubkey text NOT NULL,
  body text NOT NULL,
  author_name text NOT NULL,
  created_at integer NOT NULL,
  deleted integer NOT NULL DEFAULT 0,
  hidden integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS reactions (
  event_id text PRIMARY KEY REFERENCES events(id),
  target_event_id text NOT NULL,
  pubkey text NOT NULL,
  created_at integer NOT NULL,
  deleted integer NOT NULL DEFAULT 0,
  UNIQUE (target_event_id, pubkey)
);

CREATE TABLE IF NOT EXISTS profiles (
  pubkey text PRIMARY KEY,
  fixed_nickname_enabled integer NOT NULL DEFAULT 0,
  fixed_nickname text NOT NULL DEFAULT '',
  event_id text NOT NULL REFERENCES events(id),
  updated_at integer NOT NULL,
  settings_event_id text REFERENCES events(id),
  settings_updated_at integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS blocked_pubkeys (
  pubkey text PRIMARY KEY,
  reason text NOT NULL DEFAULT '',
  created_at integer NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS point_ledger (
  id integer PRIMARY KEY AUTOINCREMENT,
  event_id text UNIQUE NOT NULL REFERENCES events(id),
  pubkey text NOT NULL,
  delta integer NOT NULL,
  reason text NOT NULL,
  created_at integer NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS posts_created_at_idx ON posts (created_at DESC);
CREATE INDEX IF NOT EXISTS comments_root_created_idx ON comments (root_event_id, created_at ASC);
CREATE INDEX IF NOT EXISTS events_kind_created_idx ON events (kind, created_at DESC);
CREATE INDEX IF NOT EXISTS event_relays_relay_idx ON event_relays (relay_url, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS point_ledger_pubkey_created_idx ON point_ledger (pubkey, created_at DESC);
CREATE INDEX IF NOT EXISTS posts_title_idx ON posts (title);
CREATE INDEX IF NOT EXISTS posts_body_idx ON posts (body);
CREATE INDEX IF NOT EXISTS posts_author_name_idx ON posts (author_name);
