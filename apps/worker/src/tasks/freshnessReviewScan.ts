import { listOrganizationIds, runKnowledgeFreshnessReviewScan } from "@internalwiki/db";
import type { JobHelpers } from "graphile-worker";

type FreshnessReviewScanPayload = {
  organizationId?: string;
  limitPerOrg?: number;
  triggeredBy?: string;
};

export async function freshnessReviewScan(payload: FreshnessReviewScanPayload, helpers: JobHelpers): Promise<void> {
  const organizationIds = payload.organizationId ? [payload.organizationId] : await listOrganizationIds(1000);
  const limitPerOrg = Math.max(1, Math.min(2000, payload.limitPerOrg ?? 500));

  let totalMarked = 0;
  let totalTasks = 0;

  for (const organizationId of organizationIds) {
    const result = await runKnowledgeFreshnessReviewScan({
      organizationId,
      limit: limitPerOrg,
      createdBy: payload.triggeredBy
    });
    totalMarked += result.staleMarked;
    totalTasks += result.tasksUpserted;
  }

  helpers.logger.info(
    `freshnessReviewScan organizations=${organizationIds.length} staleMarked=${totalMarked} tasks=${totalTasks}`
  );
}
