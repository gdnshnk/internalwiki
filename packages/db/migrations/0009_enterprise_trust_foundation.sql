ALTER TABLE audit_events
ADD COLUMN IF NOT EXISTS prev_hash TEXT,
ADD COLUMN IF NOT EXISTS event_hash TEXT;

CREATE TABLE IF NOT EXISTS org_security_policies (
  organization_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  session_max_age_minutes INT NOT NULL DEFAULT 43200,
  session_idle_timeout_minutes INT NOT NULL DEFAULT 1440,
  concurrent_session_limit INT NOT NULL DEFAULT 10,
  force_reauth_after_minutes INT NOT NULL DEFAULT 10080,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

CREATE TABLE IF NOT EXISTS audit_export_jobs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  requested_by TEXT,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  rows_exported INT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  download_url TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_export_jobs_org_created
  ON audit_export_jobs (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_export_jobs_org_status
  ON audit_export_jobs (organization_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS incident_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  event_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'resolved')),
  summary TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_incident_events_org_status_occurred
  ON incident_events (organization_id, status, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_incident_events_org_type_occurred
  ON incident_events (organization_id, event_type, occurred_at DESC);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status INT NOT NULL,
  response_body JSONB,
  response_headers JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,
  UNIQUE (organization_id, method, path, key_hash)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expires
  ON idempotency_keys (expires_at);

CREATE OR REPLACE FUNCTION internalwiki_current_org_id()
RETURNS TEXT
LANGUAGE SQL
STABLE
AS $$
  SELECT NULLIF(current_setting('internalwiki.org_id', true), '');
$$;

DO $$
DECLARE
  org_table TEXT;
BEGIN
  FOREACH org_table IN ARRAY ARRAY[
    'memberships',
    'connector_accounts',
    'connector_sync_runs',
    'external_items',
    'documents',
    'document_versions',
    'document_chunks',
    'chunk_embeddings',
    'summaries',
    'summary_citations',
    'source_scores',
    'chat_threads',
    'chat_messages',
    'answer_citations',
    'review_queue_items',
    'review_actions',
    'audit_events',
    'organization_domains',
    'registration_invites',
    'user_sessions',
    'assistant_feedback',
    'retrieval_eval_runs',
    'retrieval_eval_cases',
    'answer_claims',
    'answer_claim_citations',
    'org_security_policies',
    'audit_export_jobs',
    'incident_events',
    'idempotency_keys'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', org_table);

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = org_table
        AND policyname = 'org_isolation_select'
    ) THEN
      EXECUTE format(
        'CREATE POLICY org_isolation_select ON %I FOR SELECT USING (internalwiki_current_org_id() IS NULL OR organization_id = internalwiki_current_org_id())',
        org_table
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = org_table
        AND policyname = 'org_isolation_modify'
    ) THEN
      EXECUTE format(
        'CREATE POLICY org_isolation_modify ON %I FOR ALL USING (internalwiki_current_org_id() IS NULL OR organization_id = internalwiki_current_org_id()) WITH CHECK (internalwiki_current_org_id() IS NULL OR organization_id = internalwiki_current_org_id())',
        org_table
      );
    END IF;
  END LOOP;
END
$$;

CREATE OR REPLACE VIEW internalwiki_rls_guardrails AS
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  EXISTS (
    SELECT 1
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename = c.relname
  ) AS has_policy
FROM pg_class c
JOIN pg_namespace n
  ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns cols
    WHERE cols.table_schema = 'public'
      AND cols.table_name = c.relname
      AND cols.column_name = 'organization_id'
  )
ORDER BY c.relname;
