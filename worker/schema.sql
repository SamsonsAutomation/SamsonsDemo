PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE COLLATE NOCASE,
  geofence_enabled INTEGER NOT NULL DEFAULT 0,
  geofence_lat REAL,
  geofence_lng REAL,
  geofence_radius_m INTEGER NOT NULL DEFAULT 150,
  overtime_threshold REAL NOT NULL DEFAULT 40,
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  username TEXT NOT NULL COLLATE NOCASE,
  display_name TEXT NOT NULL,
  job_title TEXT,
  hourly_rate REAL NOT NULL DEFAULT 0,
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
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS time_entries (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  clock_in_at TEXT NOT NULL,clock_in_lat REAL NOT NULL,clock_in_lng REAL NOT NULL,clock_in_accuracy REAL,
  clock_out_at TEXT,clock_out_lat REAL,clock_out_lng REAL,clock_out_accuracy REAL,
  edited_at TEXT,edited_by TEXT,edit_note TEXT,created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS time_entry_audit (
  id TEXT PRIMARY KEY,organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,time_entry_id TEXT NOT NULL REFERENCES time_entries(id) ON DELETE CASCADE,
  changed_by_user_id TEXT NOT NULL REFERENCES users(id),old_clock_in_at TEXT,old_clock_out_at TEXT,new_clock_in_at TEXT,new_clock_out_at TEXT,reason TEXT NOT NULL,created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,name TEXT NOT NULL,phone TEXT,email TEXT,need TEXT NOT NULL,
  estimated_value REAL NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'New',previous_status TEXT,followup_date TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_org ON users(organization_id,active,display_name);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_org_date ON time_entries(organization_id,clock_in_at DESC);
CREATE INDEX IF NOT EXISTS idx_time_entries_user ON time_entries(organization_id,user_id,clock_in_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_open_time_entry_per_user ON time_entries(user_id) WHERE clock_out_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_org_status_date ON leads(organization_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_org_followup ON leads(organization_id,followup_date,status);
CREATE INDEX IF NOT EXISTS idx_audit_org_entry ON time_entry_audit(organization_id,time_entry_id,created_at DESC);
