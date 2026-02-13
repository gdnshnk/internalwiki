import { listActiveConnectorAccounts } from "@internalwiki/db";
import type { JobHelpers } from "graphile-worker";

function currentSyncBucketIso(): string {
  const now = new Date();
  const minuteBucket = Math.floor(now.getUTCMinutes() / 15) * 15;
  now.setUTCMinutes(minuteBucket, 0, 0);
  return now.toISOString();
}

export async function scheduleConnectorSyncs(_payload: Record<string, never>, helpers: JobHelpers): Promise<void> {
  const activeAccounts = await listActiveConnectorAccounts();
  const bucket = currentSyncBucketIso();

  for (const account of activeAccounts) {
    await helpers.addJob(
      "sync-connector",
      {
        organizationId: account.organizationId,
        connectorAccountId: account.id,
        connectorType: account.connectorType
      },
      {
        maxAttempts: 5,
        queueName: `sync:${account.id}`,
        jobKey: `sync:${account.organizationId}:${account.id}:${bucket}`
      }
    );
  }

  helpers.logger.info(`scheduleConnectorSyncs active=${activeAccounts.length} bucket=${bucket}`);
}
