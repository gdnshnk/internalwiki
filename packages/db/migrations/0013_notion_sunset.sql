UPDATE connector_accounts
SET
  status = 'disabled',
  deprecated_at = COALESCE(deprecated_at, NOW()),
  sunset_at = COALESCE(sunset_at, NOW()),
  deprecation_reason = COALESCE(
    deprecation_reason,
    'Notion support is sunset. New retrieval is disabled for Notion sources.'
  ),
  updated_at = NOW()
WHERE connector_type = 'notion';
