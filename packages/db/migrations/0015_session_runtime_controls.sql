ALTER TABLE user_sessions
ADD COLUMN IF NOT EXISTS issued_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS revoked_reason TEXT;

UPDATE user_sessions
SET
  issued_at = COALESCE(issued_at, created_at, NOW()),
  last_seen_at = COALESCE(last_seen_at, updated_at, created_at, NOW())
WHERE issued_at IS NULL
   OR last_seen_at IS NULL;

ALTER TABLE user_sessions
ALTER COLUMN issued_at SET DEFAULT NOW(),
ALTER COLUMN last_seen_at SET DEFAULT NOW();

ALTER TABLE user_sessions
ALTER COLUMN issued_at SET NOT NULL,
ALTER COLUMN last_seen_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_sessions_org_user_last_seen
  ON user_sessions (organization_id, user_id, revoked_at, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_sessions_org_user_issued
  ON user_sessions (organization_id, user_id, revoked_at, issued_at ASC);

