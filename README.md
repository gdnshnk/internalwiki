# InternalWiki v1

Monorepo for InternalWiki: web app, worker, connectors, AI adapters, and shared domain logic.

## Workspaces

- `apps/web`: Next.js frontend + API routes
- `apps/worker`: Background sync/enrichment workers
- `packages/core`: Shared domain types, scoring, retrieval, RBAC utilities
- `packages/ai`: Provider abstraction + OpenAI adapter
- `packages/connectors`: Google and Notion connector adapters
- `packages/db`: Postgres schema, migrations, and data access helpers
- `infrastructure`: Environment, deployment, and runbook docs

## Quick start

1. Install dependencies: `npm install`
2. Copy env template: `cp infrastructure/.env.example .env`
3. Run DB migrations:
   - `psql "$DATABASE_URL" -f packages/db/migrations/0001_init.sql`
   - `psql "$DATABASE_URL" -f packages/db/migrations/0002_runtime_indexes.sql`
   - `psql "$DATABASE_URL" -f packages/db/migrations/0003_auth_security.sql`
   - `psql "$DATABASE_URL" -f packages/db/migrations/0004_quality_feedback.sql`
   - `psql "$DATABASE_URL" -f packages/db/migrations/0005_session_maintenance.sql`
   - `psql "$DATABASE_URL" -f packages/db/migrations/0006_traceability_marketing.sql`
4. Run web app: `npm run dev:web`
5. Run worker: `npm run dev:worker`

## Quality evaluation

- Run retrieval quality gate locally: `npm run test:quality`
- Run benchmark harness against a real org and persist eval rows:
  - `INTERNALWIKI_EVAL_ORG_ID=<org-id> npm run eval:retrieval`

## Notes

- MVP uses a multi-tenant org model and requires `organization_id` filtering on all domain data.
- External integrations are scaffolded with clear interfaces and can be extended with real OAuth token storage and API client implementations.
