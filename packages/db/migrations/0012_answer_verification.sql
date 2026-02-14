CREATE TABLE IF NOT EXISTS answer_verification_runs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  chat_message_id TEXT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('passed', 'blocked')),
  reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  citation_coverage NUMERIC NOT NULL,
  unsupported_claims INT NOT NULL DEFAULT 0,
  permission_filtered_out_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,
  UNIQUE (organization_id, chat_message_id)
);

CREATE INDEX IF NOT EXISTS idx_answer_verification_runs_org_created
  ON answer_verification_runs (organization_id, created_at DESC);

DO $$
BEGIN
  ALTER TABLE answer_verification_runs ENABLE ROW LEVEL SECURITY;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'answer_verification_runs'
      AND policyname = 'org_isolation_select'
  ) THEN
    CREATE POLICY org_isolation_select ON answer_verification_runs
      FOR SELECT
      USING (internalwiki_current_org_id() IS NULL OR organization_id = internalwiki_current_org_id());
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'answer_verification_runs'
      AND policyname = 'org_isolation_modify'
  ) THEN
    CREATE POLICY org_isolation_modify ON answer_verification_runs
      FOR ALL
      USING (internalwiki_current_org_id() IS NULL OR organization_id = internalwiki_current_org_id())
      WITH CHECK (internalwiki_current_org_id() IS NULL OR organization_id = internalwiki_current_org_id());
  END IF;
END
$$;
