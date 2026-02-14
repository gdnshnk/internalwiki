# InternalWiki Control Matrix (Code Baseline)

| Control Domain | Control Objective | Code Control | Evidence Command |
|---|---|---|---|
| Tenant Isolation | Prevent cross-tenant access | RLS policies + org/session DB context in `packages/db/migrations/0014_rls_runtime_enforcement.sql` and `packages/db/src/client.ts` | `npm run compliance:check` |
| Session Security | Enforce max-age, idle timeout, force-reauth, concurrency | Session policy API + runtime checks in `/Users/gideon/Desktop/Gideon Shonaike/CURRENT/Github/internalwiki/apps/web/lib/session.ts` and policy-backed session creation in auth callbacks | `npm --workspace @internalwiki/web run test -- tests/enterprise-ops-security-contracts.test.ts` |
| Anti-Abuse | Protect mutating routes | Mutation origin checks, route-level rate limits, and idempotency keys in API routes under `/Users/gideon/Desktop/Gideon Shonaike/CURRENT/Github/internalwiki/apps/web/app/api/orgs/[orgId]/...` | `npm run compliance:check` |
| Auditability | Immutable security/admin activity trace | Hash-chained audit events and audit export jobs in `packages/db/src/repositories.ts` and security routes | `npm --workspace @internalwiki/web run test -- tests/enterprise-ops-security-contracts.test.ts` |
| Privacy Lifecycle | DSR export/delete and legal hold exceptions | Privacy APIs under `/Users/gideon/Desktop/Gideon Shonaike/CURRENT/Github/internalwiki/apps/web/app/api/orgs/[orgId]/security/privacy/...` and DB tables in `0016_privacy_retention_controls.sql` | `npm run db:migrate` then call DSR APIs |
| Retention | Purge aged personal data | Daily worker cleanup task `apps/worker/src/tasks/privacyRetentionCleanup.ts` using `cleanupPrivacyRetention` | `npm --workspace @internalwiki/worker run typecheck` |
| Verification Pipeline | Operational compliance checks in CI/staging | `apps/web/scripts/compliance-check.ts` integrated via root `compliance:check` and `staging:check` | `npm run compliance:check` |

