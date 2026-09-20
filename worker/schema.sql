PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE COLLATE NOCASE,
  geofence_enabled INTEGER NOT NULL DEFAULT 0,
  geofence_lat REAL,
  geofence_lng REAL,
  geofence_radius_m INTEGER NOT NULL DEFAULT 150,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  username TEXT NOT NULL COLLATE NOCASE,
  display_name TEXT NOT NULL,
  job_title TEXT,
  role TEXT NOT NULL CHECK(role IN ('admin','employee')),
  credential_hash TEXT NOT NULL,
  credential_salt TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(organization_id, username)
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS time_entries (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  clock_in_at TEXT NOT NULL,
  clock_in_lat REAL NOT NULL,
  clock_in_lng REAL NOT NULL,
  clock_in_accuracy REAL,
  clock_out_at TEXT,
  clock_out_lat REAL,
  clock_out_lng REAL,
  clock_out_accuracy REAL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_org ON users(organization_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_user ON time_entries(user_id, clock_in_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_open_time_entry_per_user
ON time_entries(user_id)
WHERE clock_out_at IS NULL;
