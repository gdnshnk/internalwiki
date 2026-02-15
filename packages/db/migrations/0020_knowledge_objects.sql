CREATE TABLE IF NOT EXISTS knowledge_objects (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  source_type TEXT NOT NULL CHECK (source_type IN ('manual', 'generated', 'imported')),
  review_interval_days INT NOT NULL CHECK (review_interval_days BETWEEN 1 AND 365),
  review_due_at TIMESTAMPTZ NOT NULL,
  freshness_status TEXT NOT NULL DEFAULT 'fresh' CHECK (freshness_status IN ('fresh', 'stale', 'at_risk')),
  confidence_score NUMERIC NOT NULL DEFAULT 0.5 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  last_validated_at TIMESTAMPTZ,
  provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
  permissions_mode TEXT NOT NULL DEFAULT 'custom' CHECK (permissions_mode IN ('custom', 'inherited_source_acl', 'org_wide')),
  latest_version_id TEXT,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,
  UNIQUE (organization_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_objects_org_owner
  ON knowledge_objects (organization_id, owner_user_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_objects_org_freshness
  ON knowledge_objects (organization_id, freshness_status, review_due_at);

CREATE INDEX IF NOT EXISTS idx_knowledge_objects_org_updated
  ON knowledge_objects (organization_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS knowledge_object_versions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  knowledge_object_id TEXT NOT NULL REFERENCES knowledge_objects(id) ON DELETE CASCADE,
  version_number INT NOT NULL,
  content_markdown TEXT NOT NULL,
  content_blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
  change_summary TEXT,
  validated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  validated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,
  UNIQUE (organization_id, knowledge_object_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_versions_org_object
  ON knowledge_object_versions (organization_id, knowledge_object_id, version_number DESC);

CREATE INDEX IF NOT EXISTS idx_knowledge_versions_blocks_gin
  ON knowledge_object_versions USING GIN (content_blocks);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_knowledge_latest_version'
  ) THEN
    ALTER TABLE knowledge_objects
      ADD CONSTRAINT fk_knowledge_latest_version
      FOREIGN KEY (latest_version_id)
      REFERENCES knowledge_object_versions(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS knowledge_object_reviewers (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  knowledge_object_id TEXT NOT NULL REFERENCES knowledge_objects(id) ON DELETE CASCADE,
  reviewer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  required BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,
  UNIQUE (organization_id, knowledge_object_id, reviewer_user_id)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_reviewers_org_user
  ON knowledge_object_reviewers (organization_id, reviewer_user_id);

CREATE TABLE IF NOT EXISTS knowledge_tags (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,
  UNIQUE (organization_id, name)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_tags_org_name_lower
  ON knowledge_tags (organization_id, lower(name));

CREATE TABLE IF NOT EXISTS knowledge_object_tag_map (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  knowledge_object_id TEXT NOT NULL REFERENCES knowledge_objects(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES knowledge_tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,
  UNIQUE (organization_id, knowledge_object_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_tag_map_org_tag
  ON knowledge_object_tag_map (organization_id, tag_id);

DO $$
DECLARE
  org_table TEXT;
BEGIN
  FOREACH org_table IN ARRAY ARRAY[
    'knowledge_objects',
    'knowledge_object_versions',
    'knowledge_object_reviewers',
    'knowledge_tags',
    'knowledge_object_tag_map'
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
