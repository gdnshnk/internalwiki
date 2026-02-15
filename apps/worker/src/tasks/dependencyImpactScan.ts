import { applyDependencyImpact, listOrganizationIds, listRecentDependencyUpdateEvents } from "@internalwiki/db";
import type { JobHelpers } from "graphile-worker";

type DependencyImpactScanPayload = {
  organizationId?: string;
  sinceMinutes?: number;
  triggeredBy?: string;
};

export async function dependencyImpactScan(payload: DependencyImpactScanPayload, helpers: JobHelpers): Promise<void> {
  const organizationIds = payload.organizationId ? [payload.organizationId] : await listOrganizationIds(1000);
  const sinceMinutes = Math.max(1, Math.min(24 * 60, payload.sinceMinutes ?? 30));

  let totalImpacted = 0;
  let totalTasks = 0;

  for (const organizationId of organizationIds) {
    const events = await listRecentDependencyUpdateEvents({
      organizationId,
      sinceMinutes,
      limit: 200
    });

    for (const event of events) {
      const result = await applyDependencyImpact({
        organizationId,
        dependencyObjectId: event.dependencyObjectId,
        dependencyRef: event.dependencyRef,
        createdBy: payload.triggeredBy
      });
      totalImpacted += result.impacted;
      totalTasks += result.tasksUpserted;
    }
  }

  helpers.logger.info(
    `dependencyImpactScan organizations=${organizationIds.length} impacted=${totalImpacted} tasks=${totalTasks}`
  );
}
