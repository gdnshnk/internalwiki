CREATE OR REPLACE FUNCTION internalwiki_rls_mode()
RETURNS TEXT
LANGUAGE SQL
STABLE
AS $$
  SELECT COALESCE(NULLIF(current_setting('internalwiki.rls_mode', true), ''), 'audit');
$$;

CREATE OR REPLACE FUNCTION internalwiki_rls_enforced()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT internalwiki_rls_mode() = 'enforce';
$$;

CREATE OR REPLACE FUNCTION internalwiki_rls_bypass_enabled()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT COALESCE(NULLIF(current_setting('internalwiki.rls_bypass', true), ''), 'off') = 'on';
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
    'idempotency_keys',
    'source_principals',
    'source_principal_memberships',
    'user_source_identities',
    'external_item_acl_entries',
    'answer_verification_runs'
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
