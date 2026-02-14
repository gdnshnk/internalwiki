ALTER TABLE users
ADD COLUMN IF NOT EXISTS password_hash TEXT,
ADD COLUMN IF NOT EXISTS password_set_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_password_set_at
  ON users (password_set_at DESC)
  WHERE password_hash IS NOT NULL;

