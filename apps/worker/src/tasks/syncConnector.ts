import type { ConnectorType } from "@internalwiki/core";
import { getConnector, ConnectorSyncError } from "@internalwiki/connectors";
import {
  appendAuditEvent,
  finishConnectorSyncRun,
  getConnectorAccount,
  getExternalItemChecksums,
  markConnectorReauthRequired,
  startConnectorSyncRun
} from "@internalwiki/db";
import type { JobHelpers } from "graphile-worker";
import { decryptSecret } from "../lib/crypto";

type SyncPayload = {
  organizationId: string;
  connectorType?: ConnectorType;
  connectorAccountId: string;
  cursor?: string;
  triggeredBy?: string;
};

type SyncFailureClassification = "transient" | "auth" | "payload";

export function classifySyncError(error: unknown): SyncFailureClassification {
  if (error instanceof ConnectorSyncError) {
    return error.classification;
  }

  const message = error instanceof Error ? error.message.toLowerCase() : String(error);
  if (message.includes("401") || message.includes("403") || message.includes("invalid_grant")) {
    return "auth";
  }
  if (message.includes("timeout") || message.includes("429") || message.includes("502") || message.includes("503")) {
    return "transient";
  }
  return "payload";
}

export async function syncConnector(payload: SyncPayload, helpers: JobHelpers): Promise<void> {
  const account = await getConnectorAccount(payload.organizationId, payload.connectorAccountId);
  if (!account) {
    throw new Error(`Connector account not found: ${payload.connectorAccountId}`);
  }

  if (account.status !== "active") {
    helpers.logger.warn(
      `Skipping sync for non-active connector account org=${payload.organizationId} connectorAccount=${payload.connectorAccountId} status=${account.status}`
    );
    return;
  }

  const run = await startConnectorSyncRun({
    organizationId: payload.organizationId,
    connectorAccountId: payload.connectorAccountId,
    createdBy: payload.triggeredBy
  });

  helpers.logger.info(
    `syncConnector started org=${payload.organizationId} connectorAccount=${payload.connectorAccountId} runId=${run.id} jobId=${helpers.job.id} attempt=${helpers.job.attempts + 1}/${helpers.job.max_attempts}`
  );

  let itemsSeen = 0;
  let itemsChanged = 0;
  let itemsSkipped = 0;
  let itemsFailed = 0;
  let nextCursor = account.syncCursor;

  try {
    const connectorType = payload.connectorType ?? account.connectorType;
    const connector = getConnector(connectorType);

    const syncResult = await connector.sync({
      connectorAccountId: payload.connectorAccountId,
      organizationId: payload.organizationId,
      lastCursor: payload.cursor ?? account.syncCursor,
      credentials: {
        accessToken: decryptSecret(account.encryptedAccessToken),
        refreshToken: account.encryptedRefreshToken ? decryptSecret(account.encryptedRefreshToken) : undefined,
        expiresAt: account.tokenExpiresAt
      }
    });

    itemsSeen = syncResult.items.length;
    nextCursor = syncResult.nextCursor ?? nextCursor ?? new Date().toISOString();

    const knownChecksums = await getExternalItemChecksums({
      organizationId: payload.organizationId,
      connectorAccountId: payload.connectorAccountId,
      externalIds: syncResult.items.map((item) => item.externalId)
    });

    for (const item of syncResult.items) {
      const existingChecksum = knownChecksums.get(item.externalId);
      if (existingChecksum && existingChecksum === item.checksum) {
        itemsSkipped += 1;
        continue;
      }

      itemsChanged += 1;
      await helpers.addJob(
        "enrich-document",
        {
          organizationId: payload.organizationId,
          connectorAccountId: payload.connectorAccountId,
          connectorType,
          syncRunId: run.id,
          externalId: item.externalId,
          checksum: item.checksum,
          sourceType: item.sourceType,
          sourceSystem: item.sourceSystem,
          aclPrincipalKeys: item.aclPrincipalKeys,
          sourceUrl: item.sourceUrl,
          canonicalSourceUrl: item.canonicalSourceUrl,
          title: item.title,
          owner: item.owner,
          author: item.author,
          content: item.content,
          updatedAt: item.updatedAt,
          sourceLastUpdatedAt: item.sourceLastUpdatedAt,
          sourceVersionLabel: item.sourceVersionLabel,
          sourceExternalId: item.sourceExternalId,
          sourceFormat: item.sourceFormat
        },
        {
          maxAttempts: 5,
          queueName: `enrich:${payload.connectorAccountId}`,
          jobKey: `${payload.organizationId}:${payload.connectorAccountId}:${item.externalId}:${item.checksum}`
        }
      );
    }

    await finishConnectorSyncRun({
      runId: run.id,
      organizationId: payload.organizationId,
      connectorAccountId: payload.connectorAccountId,
      status: "completed",
      itemsSeen,
      itemsChanged,
      itemsSkipped,
      itemsFailed: 0,
      nextCursor
    });

    await appendAuditEvent({
      organizationId: payload.organizationId,
      actorId: payload.triggeredBy,
      eventType: "connector.sync.completed",
      entityType: "connector_account",
      entityId: payload.connectorAccountId,
      payload: {
        runId: run.id,
        connectorType,
        itemsSeen,
        itemsChanged,
        itemsSkipped
      }
    });

    helpers.logger.info(
      `syncConnector completed org=${payload.organizationId} connectorAccount=${payload.connectorAccountId} runId=${run.id} jobId=${helpers.job.id} seen=${itemsSeen} changed=${itemsChanged} skipped=${itemsSkipped}`
    );
  } catch (error) {
    const classification = classifySyncError(error);
    const message = error instanceof Error ? error.message : String(error);
    itemsFailed = Math.max(1, itemsSeen - itemsChanged - itemsSkipped);

    if (classification === "auth") {
      await markConnectorReauthRequired(payload.organizationId, payload.connectorAccountId);
    }

    await finishConnectorSyncRun({
      runId: run.id,
      organizationId: payload.organizationId,
      connectorAccountId: payload.connectorAccountId,
      status: "failed",
      itemsSeen,
      itemsChanged,
      itemsSkipped,
      itemsFailed,
      failureClassification: classification,
      errorMessage: message
    });

    await appendAuditEvent({
      organizationId: payload.organizationId,
      actorId: payload.triggeredBy,
      eventType: "connector.sync.failed",
      entityType: "connector_account",
      entityId: payload.connectorAccountId,
      payload: {
        runId: run.id,
        classification,
        message
      }
    });

    helpers.logger.error(
      `syncConnector failed org=${payload.organizationId} connectorAccount=${payload.connectorAccountId} runId=${run.id} jobId=${helpers.job.id} classification=${classification} message=${message}`
    );

    const isFinalAttempt = helpers.job.attempts + 1 >= helpers.job.max_attempts;
    if (classification !== "transient" || isFinalAttempt) {
      await helpers.addJob(
        "sync-dead-letter",
        {
          organizationId: payload.organizationId,
          connectorAccountId: payload.connectorAccountId,
          connectorType: payload.connectorType ?? account.connectorType,
          runId: run.id,
          classification,
          reason: message
        },
        {
          maxAttempts: 1,
          jobKey: `dead:${payload.organizationId}:${payload.connectorAccountId}:${run.id}`
        }
      );
    }

    if (classification === "transient") {
      throw error;
    }
  }
}
