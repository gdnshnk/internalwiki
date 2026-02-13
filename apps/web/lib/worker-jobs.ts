import type { ConnectorType } from "@internalwiki/core";

type SyncConnectorJobPayload = {
  organizationId: string;
  connectorAccountId: string;
  connectorType: ConnectorType;
  triggeredBy?: string;
};

type WorkerUtilsLike = {
  addJob: (
    identifier: string,
    payload: Record<string, unknown>,
    spec: {
      maxAttempts?: number;
      queueName?: string;
      jobKey?: string;
    }
  ) => Promise<{ id: string }>;
};

let workerUtilsPromise: Promise<WorkerUtilsLike> | null = null;

async function getWorkerUtils() {
  if (!workerUtilsPromise) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is required to enqueue worker jobs");
    }
    workerUtilsPromise = (async () => {
      const { makeWorkerUtils } = await import("graphile-worker");
      const utils = await makeWorkerUtils({ connectionString });
      return utils as WorkerUtilsLike;
    })();
  }
  return workerUtilsPromise;
}

function currentSyncBucketIso(): string {
  const now = new Date();
  const minuteBucket = Math.floor(now.getUTCMinutes() / 15) * 15;
  now.setUTCMinutes(minuteBucket, 0, 0);
  return now.toISOString();
}

export async function enqueueSyncConnectorJob(payload: SyncConnectorJobPayload): Promise<{
  jobId: string;
  jobKey: string;
}> {
  const workerUtils = await getWorkerUtils();
  const bucket = currentSyncBucketIso();
  const jobKey = `sync:${payload.organizationId}:${payload.connectorAccountId}:${bucket}`;

  const job = await workerUtils.addJob("sync-connector", payload, {
    maxAttempts: 5,
    queueName: `sync:${payload.connectorAccountId}`,
    jobKey
  });

  return {
    jobId: job.id,
    jobKey
  };
}
