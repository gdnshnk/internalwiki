CREATE TABLE IF NOT EXISTS organization_domains (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_organization_domains_org_domain_lower
  ON organization_domains (organization_id, lower(domain));

CREATE TABLE IF NOT EXISTS registration_invites (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL UNIQUE,
  email TEXT,
  domain TEXT,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  used_by TEXT,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,
  CHECK (email IS NOT NULL OR domain IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_registration_invites_org_created
  ON registration_invites (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_registration_invites_org_status
  ON registration_invites (organization_id, expires_at, used_at, revoked_at);

CREATE TABLE IF NOT EXISTS user_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_org_user_expires
  ON user_sessions (organization_id, user_id, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_sessions_expires
  ON user_sessions (expires_at);

CREATE TABLE IF NOT EXISTS api_rate_limits (
  bucket_key TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (bucket_key, window_start)
);

CREATE INDEX IF NOT EXISTS idx_api_rate_limits_window
  ON api_rate_limits (window_start DESC);
