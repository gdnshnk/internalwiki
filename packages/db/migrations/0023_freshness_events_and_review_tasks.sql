CREATE TABLE IF NOT EXISTS knowledge_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  knowledge_object_id TEXT REFERENCES knowledge_objects(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'knowledge.updated',
      'knowledge.validated',
      'dependency.updated',
      'question.repeated',
      'answer.low_confidence'
    )
  ),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_knowledge_events_org_time
  ON knowledge_events (organization_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_knowledge_events_org_type
  ON knowledge_events (organization_id, event_type, occurred_at DESC);

CREATE TABLE IF NOT EXISTS knowledge_question_signals (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  normalized_question TEXT NOT NULL,
  sample_question TEXT NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  ask_count_7d INT NOT NULL DEFAULT 0,
  linked_knowledge_object_id TEXT REFERENCES knowledge_objects(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, normalized_question)
);

CREATE INDEX IF NOT EXISTS idx_question_signals_org_count
  ON knowledge_question_signals (organization_id, ask_count_7d DESC, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS knowledge_review_tasks (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  knowledge_object_id TEXT REFERENCES knowledge_objects(id) ON DELETE SET NULL,
  task_type TEXT NOT NULL CHECK (task_type IN ('scheduled_review', 'dependency_change', 'low_confidence', 'canonical_candidate')),
  status TEXT NOT NULL CHECK (status IN ('open', 'in_progress', 'resolved', 'dismissed')),
  priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  reason TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  due_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_review_tasks_org_status_due
  ON knowledge_review_tasks (organization_id, status, due_at ASC);

CREATE INDEX IF NOT EXISTS idx_review_tasks_org_type_status
  ON knowledge_review_tasks (organization_id, task_type, status);

DO $$
DECLARE
  org_table TEXT;
BEGIN
  FOREACH org_table IN ARRAY ARRAY[
    'knowledge_events',
    'knowledge_question_signals',
    'knowledge_review_tasks'
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
