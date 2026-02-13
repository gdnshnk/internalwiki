# Deployment guide (Vercel staging + managed Postgres)

## Services

- `apps/web`: deployed to Vercel (Next.js app + API routes)
- `apps/worker`: deployed as a separate long-running Node process
- Managed Postgres with `pgvector` enabled

## Environment

1. Start from `infrastructure/.env.staging.example`.
2. Set production-safe values for:
- `DATABASE_URL`
- `INTERNALWIKI_ENCRYPTION_KEY`
- `INTERNALWIKI_SESSION_SIGNING_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI`
- `OPENAI_API_KEY`
3. Keep:
- `NODE_ENV=production`
- `PG_SSL=true`
- `PG_SSL_ALLOW_SELF_SIGNED=false`

## Database setup

1. Enable `vector` extension in Postgres.
2. Run migrations in order:
- `packages/db/migrations/0001_init.sql`
- `packages/db/migrations/0002_runtime_indexes.sql`
- `packages/db/migrations/0003_auth_security.sql`
- `packages/db/migrations/0004_quality_feedback.sql`
- `packages/db/migrations/0005_session_maintenance.sql`
- `packages/db/migrations/0006_traceability_marketing.sql`
3. From repo root:
- `npm run db:migrate`

## Web deploy (Vercel)

1. Import repo in Vercel.
2. Set project root to `apps/web`.
3. Set install command: `npm install`.
4. Set build command: `npm run --workspace @internalwiki/web build`.
5. Set runtime env vars from staging template.
6. Deploy and verify:
- `GET /api/health`
- `GET /api/ready`

## Worker deploy

1. Deploy a Node 20+ service running from repo root.
2. Start command:
- `npm run dev:worker` (staging)
- `npm --workspace @internalwiki/worker run build && node apps/worker/dist/index.js` (release)
3. Use the same `DATABASE_URL`, crypto keys, OAuth settings, and API keys as web.
4. Verify cron activity:
- `schedule-connector-syncs` every 15 minutes
- `maintenance-auth-cleanup` hourly

## Pre-deploy gate

Run from repo root before each staging release:

- `npm run staging:check`

## Smoke checks

1. Auth:
- `POST /api/auth/google/start`
2. Assistant:
- `POST /api/orgs/:orgId/assist/query`
3. Ops:
- `GET /api/orgs/:orgId/ops/summary` (admin session)
4. Connector sync:
- `POST /api/orgs/:orgId/connectors/:connectorId/sync`
