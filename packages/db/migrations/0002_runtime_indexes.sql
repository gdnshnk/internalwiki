ALTER TABLE connector_accounts
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS external_workspace_id TEXT;

ALTER TABLE connector_sync_runs
  ADD COLUMN IF NOT EXISTS items_skipped INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS items_failed INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failure_classification TEXT;

CREATE INDEX IF NOT EXISTS idx_connector_accounts_org_status
  ON connector_accounts (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_connector_accounts_status_updated
  ON connector_accounts (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_sync_runs_org_connector_started
  ON connector_sync_runs (organization_id, connector_account_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_external_items_org_source
  ON external_items (organization_id, source_type, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_document_versions_org_doc_created
  ON document_versions (organization_id, document_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_source_scores_org_total
  ON source_scores (organization_id, total_score DESC);

CREATE INDEX IF NOT EXISTS idx_review_queue_org_created
  ON review_queue_items (organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_messages_org_thread_created
  ON chat_messages (organization_id, thread_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_events_org_event_occurred
  ON audit_events (organization_id, event_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_documents_org_source
  ON documents (organization_id, source_type, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_document_chunks_org_version_idx
  ON document_chunks (organization_id, document_version_id, chunk_index);

CREATE INDEX IF NOT EXISTS idx_document_chunks_text_search
  ON document_chunks
  USING GIN (to_tsvector('english', text_content));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE indexname = 'idx_chunk_embeddings_vector_ivfflat'
  ) THEN
    CREATE INDEX idx_chunk_embeddings_vector_ivfflat
      ON chunk_embeddings
      USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION prevent_citation_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Citation rows are immutable and append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_answer_citations_immutable ON answer_citations;
CREATE TRIGGER trg_answer_citations_immutable
  BEFORE UPDATE OR DELETE ON answer_citations
  FOR EACH ROW EXECUTE FUNCTION prevent_citation_mutation();

DROP TRIGGER IF EXISTS trg_summary_citations_immutable ON summary_citations;
CREATE TRIGGER trg_summary_citations_immutable
  BEFORE UPDATE OR DELETE ON summary_citations
  FOR EACH ROW EXECUTE FUNCTION prevent_citation_mutation();
