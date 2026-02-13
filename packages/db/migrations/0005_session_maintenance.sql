CREATE INDEX IF NOT EXISTS idx_user_sessions_revoked_expires
  ON user_sessions (revoked_at, expires_at);

CREATE INDEX IF NOT EXISTS idx_user_sessions_cleanup_expired
  ON user_sessions (expires_at)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_api_rate_limits_cleanup_window
  ON api_rate_limits (window_start);
