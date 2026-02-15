CREATE TABLE IF NOT EXISTS user_memory_profiles (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  personalization_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  profile_summary TEXT,
  retention_days INT NOT NULL DEFAULT 90 CHECK (retention_days BETWEEN 7 AND 365),
  policy_acknowledged_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,
  UNIQUE (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS user_memory_entries (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  memory_key TEXT NOT NULL,
  memory_value TEXT NOT NULL,
  sensitivity TEXT NOT NULL DEFAULT 'low' CHECK (sensitivity IN ('low', 'medium', 'high')),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'derived')),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,
  UNIQUE (organization_id, user_id, memory_key)
);

CREATE INDEX IF NOT EXISTS idx_user_memory_profiles_org_user
  ON user_memory_profiles (organization_id, user_id);

CREATE INDEX IF NOT EXISTS idx_user_memory_profiles_org_enabled
  ON user_memory_profiles (organization_id, personalization_enabled);

CREATE INDEX IF NOT EXISTS idx_user_memory_entries_org_user_updated
  ON user_memory_entries (organization_id, user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_memory_entries_org_expires
  ON user_memory_entries (organization_id, expires_at)
  WHERE expires_at IS NOT NULL;

DO $$
DECLARE
  memory_table TEXT;
BEGIN
  FOREACH memory_table IN ARRAY ARRAY['user_memory_profiles', 'user_memory_entries']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', memory_table);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', memory_table);
    EXECUTE format('DROP POLICY IF EXISTS org_isolation_select ON %I', memory_table);
    EXECUTE format('DROP POLICY IF EXISTS org_isolation_modify ON %I', memory_table);

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
      memory_table
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
      memory_table
    );
  END LOOP;
END
$$;
