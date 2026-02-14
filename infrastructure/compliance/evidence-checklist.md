# Compliance Evidence Checklist

## Runtime Mode
- Confirm mode is explicit:
  - `echo $INTERNALWIKI_COMPLIANCE_MODE`
  - Expected: `audit` during rollout weeks 1-2, then `enforce`.

## Database Controls
- Apply migrations:
  - `npm run db:migrate`
- Verify RLS helper functions and policies exist:
  - `psql "$DATABASE_URL" -c "select internalwiki_rls_mode(), internalwiki_rls_enforced();"`
  - `psql "$DATABASE_URL" -c "select * from internalwiki_rls_guardrails limit 10;"`

## Session Security
- Validate session policy endpoint and updates:
  - `GET /api/orgs/{orgId}/security/session-policies`
  - `POST /api/orgs/{orgId}/security/session-policies`
- Verify revoked session behavior (idle/force-reauth) in app logs:
  - Look for `auth.session.revoked`.

## Privacy Lifecycle
- Validate DSR export:
  - `POST /api/orgs/{orgId}/security/privacy/dsr/export`
- Validate DSR delete with and without legal hold:
  - `POST /api/orgs/{orgId}/security/privacy/dsr/delete`
- Confirm `privacy_requests` rows and audit events are created.

## Retention
- Run worker and inspect cleanup logs:
  - `npm run dev:worker`
  - Look for `privacyRetentionCleanup`.
- Optional manual run:
  - enqueue job `privacy-retention-cleanup`.

## API Protection Coverage
- Run compliance check:
  - `npm run compliance:check`
- Expected checks:
  - security headers present
  - mutating route guards/rate limits present
  - idempotency enabled on selected side-effect routes
  - no org-scoped repository function routes through system query helper

