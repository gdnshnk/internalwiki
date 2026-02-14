# InternalWiki v1

Monorepo for InternalWiki: web app, worker, connectors, AI adapters, and shared domain logic.

## Workspaces

- `apps/web`: Next.js frontend + API routes
- `apps/worker`: Background sync/enrichment workers
- `packages/core`: Shared domain types, scoring, retrieval, RBAC utilities
- `packages/ai`: Provider abstraction + OpenAI adapter
- `packages/connectors`: Google, Slack, and Microsoft connector adapters
- `packages/db`: Postgres schema, migrations, and data access helpers
- `infrastructure`: Environment, deployment, and runbook docs

## Quick start

1. Install dependencies: `npm install`
2. Copy env template: `cp .env.example .env`
3. Run DB migrations: `npm run db:migrate`
4. Run web app: `npm run dev:web`
5. Run worker: `npm run dev:worker`

## Quality evaluation

- Run retrieval quality gate locally: `npm run test:quality`
- Run benchmark harness against a real org and persist eval rows:
  - `INTERNALWIKI_EVAL_ORG_ID=<org-id> npm run eval:retrieval`

## Notes

- MVP uses a multi-tenant org model and requires `organization_id` filtering on all domain data.
- Supported connector scope is Google Workspace, Slack, and Microsoft 365 (Teams, SharePoint, OneDrive).
- Notion is deprecated now and will be fully sunset 60 days after the deprecation release.
