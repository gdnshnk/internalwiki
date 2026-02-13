ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS source_external_id TEXT,
  ADD COLUMN IF NOT EXISTS source_format TEXT,
  ADD COLUMN IF NOT EXISTS canonical_source_url TEXT;

ALTER TABLE document_versions
  ADD COLUMN IF NOT EXISTS source_last_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_version_label TEXT,
  ADD COLUMN IF NOT EXISTS source_checksum TEXT,
  ADD COLUMN IF NOT EXISTS connector_sync_run_id TEXT REFERENCES connector_sync_runs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_documents_org_source_external
  ON documents (organization_id, source_external_id);

CREATE INDEX IF NOT EXISTS idx_document_versions_org_sync_run
  ON document_versions (organization_id, connector_sync_run_id);

CREATE TABLE IF NOT EXISTS answer_claims (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  chat_message_id TEXT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  claim_text TEXT NOT NULL,
  claim_order INT NOT NULL,
  supported BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_answer_claims_org_message
  ON answer_claims (organization_id, chat_message_id, claim_order ASC);

CREATE TABLE IF NOT EXISTS answer_claim_citations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  answer_claim_id TEXT NOT NULL REFERENCES answer_claims(id) ON DELETE CASCADE,
  chunk_id TEXT NOT NULL REFERENCES document_chunks(id) ON DELETE CASCADE,
  start_offset INT NOT NULL,
  end_offset INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_answer_claim_citations_org_claim
  ON answer_claim_citations (organization_id, answer_claim_id);

CREATE TABLE IF NOT EXISTS marketing_waitlist_leads (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  company TEXT NOT NULL,
  role TEXT,
  source_page TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_marketing_waitlist_email_lower
  ON marketing_waitlist_leads (lower(email));

CREATE INDEX IF NOT EXISTS idx_marketing_waitlist_created
  ON marketing_waitlist_leads (created_at DESC);
