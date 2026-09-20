-- Run ONCE against an existing v6 D1 database.
ALTER TABLE organizations ADD COLUMN overtime_threshold REAL NOT NULL DEFAULT 40;
ALTER TABLE organizations ADD COLUMN timezone TEXT NOT NULL DEFAULT 'America/New_York';
ALTER TABLE users ADD COLUMN hourly_rate REAL NOT NULL DEFAULT 0;
ALTER TABLE time_entries ADD COLUMN edited_at TEXT;
ALTER TABLE time_entries ADD COLUMN edited_by TEXT;
ALTER TABLE time_entries ADD COLUMN edit_note TEXT;
CREATE TABLE IF NOT EXISTS time_entry_audit (id TEXT PRIMARY KEY,organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,time_entry_id TEXT NOT NULL REFERENCES time_entries(id) ON DELETE CASCADE,changed_by_user_id TEXT NOT NULL REFERENCES users(id),old_clock_in_at TEXT,old_clock_out_at TEXT,new_clock_in_at TEXT,new_clock_out_at TEXT,reason TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS leads (id TEXT PRIMARY KEY,organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,name TEXT NOT NULL,phone TEXT,email TEXT,need TEXT NOT NULL,estimated_value REAL NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'New',previous_status TEXT,followup_date TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_time_entries_org_date ON time_entries(organization_id,clock_in_at DESC);
CREATE INDEX IF NOT EXISTS idx_time_entries_user ON time_entries(organization_id,user_id,clock_in_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_org_status_date ON leads(organization_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_org_followup ON leads(organization_id,followup_date,status);
CREATE INDEX IF NOT EXISTS idx_audit_org_entry ON time_entry_audit(organization_id,time_entry_id,created_at DESC);
