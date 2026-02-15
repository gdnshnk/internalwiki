import { listOrganizationIds, rollupKnowledgeQuestionSignals } from "@internalwiki/db";
import type { JobHelpers } from "graphile-worker";

type CanonicalQuestionRollupPayload = {
  organizationId?: string;
  minCount?: number;
  triggeredBy?: string;
};

export async function canonicalQuestionRollup(
  payload: CanonicalQuestionRollupPayload,
  helpers: JobHelpers
): Promise<void> {
  const organizationIds = payload.organizationId ? [payload.organizationId] : await listOrganizationIds(1000);
  const minCount = Math.max(2, Math.min(20, payload.minCount ?? 3));

  let totalCandidates = 0;
  let totalTasks = 0;

  for (const organizationId of organizationIds) {
    const result = await rollupKnowledgeQuestionSignals({
      organizationId,
      minCount,
      createdBy: payload.triggeredBy
    });
    totalCandidates += result.candidates;
    totalTasks += result.tasksUpserted;
  }

  helpers.logger.info(
    `canonicalQuestionRollup organizations=${organizationIds.length} candidates=${totalCandidates} tasks=${totalTasks}`
  );
}
