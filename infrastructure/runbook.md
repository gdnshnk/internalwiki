# InternalWiki operational runbook

## Incident: connector sync failures

1. Pull connector run timeline:
- `GET /api/orgs/:orgId/connectors/:connectorId/runs`
2. Inspect latest failed run details:
- `GET /api/orgs/:orgId/connectors/:connectorId/runs/:runId`
3. Classify by failure:
- `transient`: retry and watch next scheduled run.
- `auth`: mark as reauth and rotate/refresh connector credentials.
- `payload`: inspect source item payload and parser behavior.
4. Replay sync:
- `POST /api/orgs/:orgId/connectors/:connectorId/sync`

## Incident: low answer quality

1. Inspect returned citations for coverage and relevance.
2. Recompute source scores for impacted documents.
3. Review rejected summaries in governance queue and regenerate.

## Procedure: `reauth_required` connector

1. Confirm connector state:
- `GET /api/orgs/:orgId/connectors`
2. Update connector credentials:
- `PATCH /api/orgs/:orgId/connectors/:connectorId`
3. Verify status returns to `active`.
4. Trigger an immediate sync and check run outcome.

## Procedure: dead-lettered sync jobs

1. Identify dead-letter audit events:
- `GET /api/orgs/:orgId/ops/summary`
2. Trace event in `audit_events` where `event_type = connector.sync.dead_letter`.
3. For repeated auth failures:
- force reauth and pause connector if needed.
4. For repeated transient failures:
- check provider status/rate limits and increase backoff if required.
5. Replay with manual sync trigger once underlying issue is resolved.

## Procedure: failed sync replay checklist

1. Validate connector account exists and is `active`.
2. Confirm latest run `status` and `failureClassification`.
3. Trigger replay sync endpoint.
4. Verify new run has:
- `items_seen > 0` for active sources.
- no dead-letter event created.
- cursor advanced on success.

## Security controls

- Ensure `organization_id` filters are applied to all reads/writes.
- Rotate OAuth and model API credentials regularly.
- Block cross-org access attempts and audit denied requests.
