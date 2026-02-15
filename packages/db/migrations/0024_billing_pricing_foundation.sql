CREATE TABLE IF NOT EXISTS organization_billing_settings (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_tier TEXT NOT NULL DEFAULT 'free' CHECK (plan_tier IN ('free', 'pro', 'business', 'enterprise')),
  overage_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  hard_cap_credits INT CHECK (hard_cap_credits IS NULL OR hard_cap_credits >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,
  UNIQUE (organization_id)
);

CREATE TABLE IF NOT EXISTS usage_meter_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('summary_delivered', 'summary_blocked')),
  credits NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (credits >= 0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_org_billing_settings_org
  ON organization_billing_settings (organization_id);

CREATE INDEX IF NOT EXISTS idx_usage_meter_events_org_time
  ON usage_meter_events (organization_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_usage_meter_events_org_type_time
  ON usage_meter_events (organization_id, event_type, occurred_at DESC);

DO $$
DECLARE
  org_table TEXT;
BEGIN
  FOREACH org_table IN ARRAY ARRAY[
    'organization_billing_settings',
    'usage_meter_events'
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
