import { listOrganizationIds, queueLowConfidenceKnowledgeReviewTasks } from "@internalwiki/db";
import type { JobHelpers } from "graphile-worker";

type LowConfidenceReviewQueuePayload = {
  organizationId?: string;
  confidenceThreshold?: number;
  windowMinutes?: number;
  triggeredBy?: string;
};

export async function lowConfidenceReviewQueue(
  payload: LowConfidenceReviewQueuePayload,
  helpers: JobHelpers
): Promise<void> {
  const organizationIds = payload.organizationId ? [payload.organizationId] : await listOrganizationIds(1000);

  let totalQueued = 0;
  for (const organizationId of organizationIds) {
    const result = await queueLowConfidenceKnowledgeReviewTasks({
      organizationId,
      confidenceThreshold: payload.confidenceThreshold,
      windowMinutes: payload.windowMinutes,
      createdBy: payload.triggeredBy
    });
    totalQueued += result.queued;
  }

  helpers.logger.info(`lowConfidenceReviewQueue organizations=${organizationIds.length} queued=${totalQueued}`);
}
