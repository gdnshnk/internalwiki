CREATE TABLE IF NOT EXISTS knowledge_object_dependencies (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  knowledge_object_id TEXT NOT NULL REFERENCES knowledge_objects(id) ON DELETE CASCADE,
  dependency_type TEXT NOT NULL CHECK (dependency_type IN ('knowledge_object', 'system', 'repo')),
  dependency_object_id TEXT REFERENCES knowledge_objects(id) ON DELETE CASCADE,
  dependency_ref TEXT,
  dependency_label TEXT,
  relation_type TEXT NOT NULL DEFAULT 'depends_on' CHECK (relation_type IN ('depends_on', 'references', 'validated_by')),
  last_observed_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,
  CHECK (
    (dependency_type = 'knowledge_object' AND dependency_object_id IS NOT NULL)
    OR
    (dependency_type IN ('system', 'repo') AND dependency_ref IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_knowledge_deps_org_object
  ON knowledge_object_dependencies (organization_id, knowledge_object_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_deps_org_ref
  ON knowledge_object_dependencies (organization_id, dependency_type, dependency_ref);

CREATE TABLE IF NOT EXISTS knowledge_object_permission_rules (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  knowledge_object_id TEXT NOT NULL REFERENCES knowledge_objects(id) ON DELETE CASCADE,
  principal_type TEXT NOT NULL CHECK (principal_type IN ('user', 'group', 'role', 'org')),
  principal_key TEXT NOT NULL,
  access_level TEXT NOT NULL CHECK (access_level IN ('viewer', 'editor', 'admin')),
  effect TEXT NOT NULL DEFAULT 'allow' CHECK (effect IN ('allow', 'deny')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,
  UNIQUE (organization_id, knowledge_object_id, principal_type, principal_key, access_level)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_perm_org_object
  ON knowledge_object_permission_rules (organization_id, knowledge_object_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_perm_org_principal
  ON knowledge_object_permission_rules (organization_id, principal_type, principal_key);

DO $$
DECLARE
  org_table TEXT;
BEGIN
  FOREACH org_table IN ARRAY ARRAY[
    'knowledge_object_dependencies',
    'knowledge_object_permission_rules'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', org_table);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', org_table);
    EXECUTE format('DROP POLICY IF EXISTS org_isolation_select ON %I', org_table);
    EXECUTE format('DROP POLICY IF EXISTS org_isolation_modify ON %I', org_table);

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
      org_table
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
      org_table
    );
  END LOOP;
END
$$;
