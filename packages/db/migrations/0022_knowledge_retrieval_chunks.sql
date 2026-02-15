CREATE TABLE IF NOT EXISTS knowledge_object_chunks (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  knowledge_object_version_id TEXT NOT NULL REFERENCES knowledge_object_versions(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  text_content TEXT NOT NULL,
  token_count INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,
  UNIQUE (organization_id, knowledge_object_version_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_org_version
  ON knowledge_object_chunks (organization_id, knowledge_object_version_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_fts
  ON knowledge_object_chunks USING GIN (to_tsvector('english', text_content));

CREATE TABLE IF NOT EXISTS knowledge_object_chunk_embeddings (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  chunk_id TEXT NOT NULL REFERENCES knowledge_object_chunks(id) ON DELETE CASCADE,
  embedding vector(1536) NOT NULL,
  embedding_model TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,
  UNIQUE (organization_id, chunk_id)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunk_embeddings_ivfflat
  ON knowledge_object_chunk_embeddings
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

DO $$
DECLARE
  org_table TEXT;
BEGIN
  FOREACH org_table IN ARRAY ARRAY[
    'knowledge_object_chunks',
    'knowledge_object_chunk_embeddings'
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
