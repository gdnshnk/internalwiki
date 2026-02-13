CREATE TABLE IF NOT EXISTS assistant_feedback (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  thread_id TEXT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  chat_message_id TEXT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  vote TEXT NOT NULL CHECK (vote IN ('up', 'down')),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,
  UNIQUE (organization_id, chat_message_id, created_by)
);

CREATE INDEX IF NOT EXISTS idx_assistant_feedback_org_created
  ON assistant_feedback (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_assistant_feedback_org_vote
  ON assistant_feedback (organization_id, vote, created_at DESC);

CREATE TABLE IF NOT EXISTS retrieval_eval_runs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  score_good_pct NUMERIC,
  total_cases INT NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_retrieval_eval_runs_org_started
  ON retrieval_eval_runs (organization_id, started_at DESC);

CREATE TABLE IF NOT EXISTS retrieval_eval_cases (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL REFERENCES retrieval_eval_runs(id) ON DELETE CASCADE,
  query_text TEXT NOT NULL,
  expected_citations JSONB,
  actual_citations JSONB,
  verdict TEXT NOT NULL DEFAULT 'unknown' CHECK (verdict IN ('good', 'bad', 'unknown')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_retrieval_eval_cases_run
  ON retrieval_eval_cases (run_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_retrieval_eval_cases_org_verdict
  ON retrieval_eval_cases (organization_id, verdict, created_at DESC);
