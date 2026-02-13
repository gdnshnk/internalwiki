import { appendAuditEvent, markConnectorReauthRequired } from "@internalwiki/db";
import type { ConnectorType } from "@internalwiki/core";
import type { JobHelpers } from "graphile-worker";

type SyncDeadLetterPayload = {
  organizationId: string;
  connectorAccountId: string;
  connectorType: ConnectorType;
  runId: string;
  classification: "transient" | "auth" | "payload";
  reason: string;
};

export async function syncDeadLetter(payload: SyncDeadLetterPayload, helpers: JobHelpers): Promise<void> {
  if (payload.classification === "auth") {
    await markConnectorReauthRequired(payload.organizationId, payload.connectorAccountId);
  }

  await appendAuditEvent({
    organizationId: payload.organizationId,
    eventType: "connector.sync.dead_letter",
    entityType: "connector_account",
    entityId: payload.connectorAccountId,
    payload: {
      runId: payload.runId,
      connectorType: payload.connectorType,
      classification: payload.classification,
      reason: payload.reason
    }
  });

  helpers.logger.error(
    `syncDeadLetter org=${payload.organizationId} connectorAccount=${payload.connectorAccountId} runId=${payload.runId} jobId=${helpers.job.id} classification=${payload.classification} reason=${payload.reason}`
  );
}
