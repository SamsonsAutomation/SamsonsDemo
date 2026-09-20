-- Unified v10: platform owner console, per-business entitlements, subscriptions, terms, billing.
-- Run ONCE after migration-v7.sql on an existing v9 database.

ALTER TABLE organizations ADD COLUMN feature_timekeeping INTEGER NOT NULL DEFAULT 1;
ALTER TABLE organizations ADD COLUMN feature_payroll INTEGER NOT NULL DEFAULT 1;
ALTER TABLE organizations ADD COLUMN feature_mobile_clocking INTEGER NOT NULL DEFAULT 1;
ALTER TABLE organizations ADD COLUMN feature_leads INTEGER NOT NULL DEFAULT 1;
ALTER TABLE organizations ADD COLUMN billing_email TEXT;

CREATE TABLE IF NOT EXISTS platform_admins (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  credential_hash TEXT NOT NULL,
  credential_salt TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS platform_sessions (
  token_hash TEXT PRIMARY KEY,
  platform_admin_id TEXT NOT NULL REFERENCES platform_admins(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS platform_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS packages (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  monthly_cents INTEGER NOT NULL,
  feature_timekeeping INTEGER NOT NULL DEFAULT 0,
  feature_payroll INTEGER NOT NULL DEFAULT 0,
  feature_mobile_clocking INTEGER NOT NULL DEFAULT 0,
  feature_leads INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  description TEXT
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  package_id TEXT REFERENCES packages(id),
  pending_package_id TEXT REFERENCES packages(id),
  status TEXT NOT NULL DEFAULT 'inactive',
  payment_provider TEXT,
  payment_vault_id TEXT,
  provider_customer_id TEXT,
  monthly_cents INTEGER NOT NULL DEFAULT 0,
  current_period_start TEXT,
  current_period_end TEXT,
  next_charge_at TEXT,
  auto_renew INTEGER NOT NULL DEFAULT 0,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  cancellation_requested_at TEXT,
  canceled_at TEXT,
  terms_version TEXT,
  last_payment_at TEXT,
  last_payment_cents INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS terms_acceptances (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  accepted_by_user_id TEXT NOT NULL REFERENCES users(id),
  package_id TEXT NOT NULL REFERENCES packages(id),
  package_name TEXT NOT NULL,
  monthly_cents INTEGER NOT NULL,
  features_json TEXT NOT NULL,
  terms_version TEXT NOT NULL,
  authorization_text TEXT NOT NULL,
  accepted_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS billing_intents (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  package_id TEXT NOT NULL REFERENCES packages(id),
  terms_acceptance_id TEXT NOT NULL REFERENCES terms_acceptances(id),
  amount_cents INTEGER NOT NULL,
  billing_mode TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  provider_order_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS billing_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  provider TEXT,
  provider_reference TEXT,
  status TEXT NOT NULL,
  detail_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS platform_audit (
  id TEXT PRIMARY KEY,
  platform_admin_id TEXT REFERENCES platform_admins(id),
  organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  detail_json TEXT,
  created_at TEXT NOT NULL
);

INSERT OR REPLACE INTO packages(id,name,monthly_cents,feature_timekeeping,feature_payroll,feature_mobile_clocking,feature_leads,active,sort_order,description) VALUES
('timekeeping','Timekeeping',4900,1,0,1,0,1,10,'Manager timekeeping plus mobile employee clock-in/out.'),
('payroll','Payroll Workflow',5900,1,1,0,0,1,20,'Manager-entered timekeeping plus payroll-ready summaries and exports; mobile employee clocking is not included.'),
('leads','Lead Management',8900,0,0,0,1,1,30,'Lead capture, follow-up, status tracking, and pipeline management.'),
('timepay','Timekeeping + Payroll',9900,1,1,1,0,1,40,'Timekeeping, mobile clocking, and payroll-ready handoff.'),
('leadtime','Leads + Timekeeping',11900,1,0,1,1,1,50,'Lead management plus timekeeping and mobile clocking.'),
('leadpay','Leads + Payroll',11900,1,1,0,1,1,60,'Lead management, manager-entered timekeeping, and payroll workflow; mobile employee clocking is not included.'),
('complete','Complete Operations',16900,1,1,1,1,1,70,'Lead management, timekeeping, mobile clocking, and payroll workflow.');

INSERT OR IGNORE INTO platform_settings(key,value,updated_at) VALUES
('cashapp_handle','',CURRENT_TIMESTAMP),
('venmo_handle','',CURRENT_TIMESTAMP),
('paypal_merchant_label','Samson''s Automation',CURRENT_TIMESTAMP),
('terms_version','2026-09-20',CURRENT_TIMESTAMP);

CREATE INDEX IF NOT EXISTS idx_platform_sessions_admin ON platform_sessions(platform_admin_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_due ON subscriptions(status,auto_renew,next_charge_at);
CREATE INDEX IF NOT EXISTS idx_billing_intents_org ON billing_intents(organization_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_events_org ON billing_events(organization_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_terms_org ON terms_acceptances(organization_id,accepted_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_audit_org ON platform_audit(organization_id,created_at DESC);
