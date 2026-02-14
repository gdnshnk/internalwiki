CREATE TABLE IF NOT EXISTS legal_holds (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('organization', 'user')),
  reason TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at TIMESTAMPTZ,
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_legal_holds_org_active
  ON legal_holds (organization_id, active, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_legal_holds_org_user_active
  ON legal_holds (organization_id, user_id, active, created_at DESC);

CREATE TABLE IF NOT EXISTS privacy_requests (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL CHECK (request_type IN ('export', 'delete')),
  subject_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_by TEXT,
  status TEXT NOT NULL CHECK (status IN ('requested', 'processing', 'completed', 'blocked', 'failed')),
  legal_hold_blocked BOOLEAN NOT NULL DEFAULT FALSE,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_privacy_requests_org_created
  ON privacy_requests (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_privacy_requests_org_subject
  ON privacy_requests (organization_id, subject_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_privacy_requests_org_status
  ON privacy_requests (organization_id, status, updated_at DESC);

DO $$
DECLARE
  privacy_table TEXT;
BEGIN
  FOREACH privacy_table IN ARRAY ARRAY['legal_holds', 'privacy_requests']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', privacy_table);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', privacy_table);
    EXECUTE format('DROP POLICY IF EXISTS org_isolation_select ON %I', privacy_table);
    EXECUTE format('DROP POLICY IF EXISTS org_isolation_modify ON %I', privacy_table);

    EXECUTE format(
      'CREATE POLICY org_isolation_select ON %I FOR SELECT USING (
        internalwiki_rls_bypass_enabled()
        OR (
          internalwiki_current_org_id() IS NOT NULL
          AND organization_id = internalwiki_current_org_id()
        )
        OR (
          NOT internalwiki_rls_enforced()
          AND internalwiki_current_org_id() IS NULL
        )
      )',
      privacy_table
    );

    EXECUTE format(
      'CREATE POLICY org_isolation_modify ON %I FOR ALL USING (
        internalwiki_rls_bypass_enabled()
        OR (
          internalwiki_current_org_id() IS NOT NULL
          AND organization_id = internalwiki_current_org_id()
        )
        OR (
          NOT internalwiki_rls_enforced()
          AND internalwiki_current_org_id() IS NULL
        )
      ) WITH CHECK (
        internalwiki_rls_bypass_enabled()
        OR (
          internalwiki_current_org_id() IS NOT NULL
          AND organization_id = internalwiki_current_org_id()
        )
        OR (
          NOT internalwiki_rls_enforced()
          AND internalwiki_current_org_id() IS NULL
        )
      )',
      privacy_table
    );
  END LOOP;
END
$$;
