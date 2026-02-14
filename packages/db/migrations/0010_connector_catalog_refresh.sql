ALTER TABLE connector_accounts
ADD COLUMN IF NOT EXISTS deprecated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS sunset_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS deprecation_reason TEXT;

ALTER TABLE connector_accounts
DROP CONSTRAINT IF EXISTS connector_accounts_connector_type_check;

ALTER TABLE connector_accounts
ADD CONSTRAINT connector_accounts_connector_type_check CHECK (
  connector_type IN (
    'google_drive',
    'google_docs',
    'slack',
    'microsoft_teams',
    'microsoft_sharepoint',
    'microsoft_onedrive',
    'notion'
  )
);

UPDATE connector_accounts
SET
  deprecated_at = COALESCE(deprecated_at, NOW()),
  sunset_at = COALESCE(sunset_at, NOW() + INTERVAL '60 days'),
  deprecation_reason = COALESCE(
    deprecation_reason,
    'Notion is deprecated. Migrate to Slack or Microsoft integrations before sunset.'
  ),
  updated_at = NOW()
WHERE connector_type = 'notion';
