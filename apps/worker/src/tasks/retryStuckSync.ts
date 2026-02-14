import { appendAuditEvent, listStuckSyncRuns } from "@internalwiki/db";
import type { JobHelpers } from "graphile-worker";

type RetryStuckSyncPayload = {
  olderThanMinutes?: number;
};

export async function retryStuckSync(payload: RetryStuckSyncPayload, helpers: JobHelpers): Promise<void> {
  const stuckRuns = await listStuckSyncRuns({
    olderThanMinutes: payload.olderThanMinutes ?? 45,
    limit: 100
  });

  for (const run of stuckRuns) {
    const bucket = new Date().toISOString().slice(0, 16);
    await helpers.addJob(
      "sync-connector",
      {
        organizationId: run.organizationId,
        connectorAccountId: run.connectorAccountId,
        connectorType: run.connectorType
      },
      {
        maxAttempts: 5,
        queueName: `sync:${run.connectorAccountId}`,
        jobKey: `retry-stuck:${run.organizationId}:${run.connectorAccountId}:${bucket}`
      }
    );

    await appendAuditEvent({
      organizationId: run.organizationId,
      eventType: "connector.sync.retry_stuck",
      entityType: "connector_sync_run",
      entityId: run.runId,
      payload: {
        connectorAccountId: run.connectorAccountId,
        startedAt: run.startedAt
      }
    });
  }

  helpers.logger.info(`retryStuckSync retried=${stuckRuns.length}`);
}
