ALTER TABLE answer_verification_runs
  ADD COLUMN IF NOT EXISTS contract_version TEXT,
  ADD COLUMN IF NOT EXISTS grounded_status TEXT CHECK (grounded_status IN ('passed', 'blocked')),
  ADD COLUMN IF NOT EXISTS freshness_status TEXT CHECK (freshness_status IN ('passed', 'blocked')),
  ADD COLUMN IF NOT EXISTS permission_status TEXT CHECK (permission_status IN ('passed', 'blocked')),
  ADD COLUMN IF NOT EXISTS freshness_window_days INT,
  ADD COLUMN IF NOT EXISTS freshness_coverage NUMERIC,
  ADD COLUMN IF NOT EXISTS stale_citation_count INT,
  ADD COLUMN IF NOT EXISTS citation_count INT,
  ADD COLUMN IF NOT EXISTS historical_override BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_answer_verification_runs_org_status_window
  ON answer_verification_runs (organization_id, status, created_at DESC);
