CREATE TABLE IF NOT EXISTS source_principals (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_system TEXT NOT NULL CHECK (source_system IN ('slack', 'microsoft')),
  principal_key TEXT NOT NULL,
  principal_type TEXT NOT NULL CHECK (principal_type IN ('user', 'group', 'channel', 'team', 'site', 'drive')),
  display_name TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,
  UNIQUE (organization_id, source_system, principal_key)
);

CREATE INDEX IF NOT EXISTS idx_source_principals_org_source
  ON source_principals (organization_id, source_system, principal_type, updated_at DESC);

CREATE TABLE IF NOT EXISTS source_principal_memberships (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_system TEXT NOT NULL CHECK (source_system IN ('slack', 'microsoft')),
  parent_principal_key TEXT NOT NULL,
  child_principal_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,
  UNIQUE (organization_id, source_system, parent_principal_key, child_principal_key)
);

CREATE INDEX IF NOT EXISTS idx_source_principal_memberships_parent
  ON source_principal_memberships (organization_id, source_system, parent_principal_key);

CREATE TABLE IF NOT EXISTS user_source_identities (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_system TEXT NOT NULL CHECK (source_system IN ('slack', 'microsoft')),
  source_user_key TEXT NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,
  UNIQUE (organization_id, user_id, source_system, source_user_key)
);

CREATE INDEX IF NOT EXISTS idx_user_source_identities_org_user
  ON user_source_identities (organization_id, user_id, source_system);

CREATE TABLE IF NOT EXISTS external_item_acl_entries (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  external_item_id TEXT NOT NULL REFERENCES external_items(id) ON DELETE CASCADE,
  source_system TEXT NOT NULL CHECK (source_system IN ('slack', 'microsoft')),
  principal_key TEXT NOT NULL,
  permission_level TEXT NOT NULL DEFAULT 'read' CHECK (permission_level IN ('read', 'write', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,
  UNIQUE (organization_id, external_item_id, source_system, principal_key)
);

CREATE INDEX IF NOT EXISTS idx_external_item_acl_entries_org_item
  ON external_item_acl_entries (organization_id, external_item_id, source_system);

CREATE INDEX IF NOT EXISTS idx_external_item_acl_entries_org_principal
  ON external_item_acl_entries (organization_id, source_system, principal_key);

DO $$
DECLARE
  acl_table TEXT;
BEGIN
  FOREACH acl_table IN ARRAY ARRAY[
    'source_principals',
    'source_principal_memberships',
    'user_source_identities',
    'external_item_acl_entries'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', acl_table);

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = acl_table
        AND policyname = 'org_isolation_select'
    ) THEN
      EXECUTE format(
        'CREATE POLICY org_isolation_select ON %I FOR SELECT USING (internalwiki_current_org_id() IS NULL OR organization_id = internalwiki_current_org_id())',
        acl_table
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = acl_table
        AND policyname = 'org_isolation_modify'
    ) THEN
      EXECUTE format(
        'CREATE POLICY org_isolation_modify ON %I FOR ALL USING (internalwiki_current_org_id() IS NULL OR organization_id = internalwiki_current_org_id()) WITH CHECK (internalwiki_current_org_id() IS NULL OR organization_id = internalwiki_current_org_id())',
        acl_table
      );
    END IF;
  END LOOP;
END
$$;
