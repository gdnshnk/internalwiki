import {
  appendAuditEvent,
  createIncidentEvent,
  getAnswerVerificationWindowStats,
  listOpenIncidentEvents,
  listOrganizationIds,
  listRecentAnswerVerificationRuns,
  recordEvalCases,
  recordEvalRun
} from "@internalwiki/db";
import type { JobHelpers } from "graphile-worker";

type QualityEvalLoopPayload = {
  organizationId?: string;
  windowMinutes?: number;
  minSamples?: number;
  minPassRate?: number;
  triggeredBy?: string;
  triggerReason?: string;
  sourceRequestId?: string;
};

function hasOpenQualityIncident(
  incidents: Awaited<ReturnType<typeof listOpenIncidentEvents>>,
  eventType: string
): boolean {
  return incidents.some((incident) => incident.eventType === eventType);
}

export async function qualityEvalLoop(payload: QualityEvalLoopPayload, helpers: JobHelpers): Promise<void> {
  const orgIds = payload.organizationId ? [payload.organizationId] : await listOrganizationIds(1000);
  const windowMinutes = Math.max(1, payload.windowMinutes ?? 30);
  const minSamples = Math.max(1, payload.minSamples ?? 5);
  const minPassRate = Math.min(100, Math.max(1, payload.minPassRate ?? 85));

  for (const organizationId of orgIds) {
    const [stats, recentRuns] = await Promise.all([
      getAnswerVerificationWindowStats({ organizationId, windowMinutes }),
      listRecentAnswerVerificationRuns({ organizationId, windowMinutes, limit: 25 })
    ]);

    if (recentRuns.length === 0) {
      continue;
    }

    const evalRun = await recordEvalRun({
      organizationId,
      totalCases: recentRuns.length,
      scoreGoodPct: stats.passRate,
      metadata: {
        source: "production_flywheel",
        windowMinutes,
        triggerReason: payload.triggerReason ?? "scheduled",
        blocked: stats.blocked,
        groundednessBlocked: stats.groundednessBlocked,
        freshnessBlocked: stats.freshnessBlocked,
        permissionSafetyBlocked: stats.permissionSafetyBlocked
      },
      createdBy: payload.triggeredBy
    });

    await recordEvalCases({
      organizationId,
      runId: evalRun.id,
      createdBy: payload.triggeredBy,
      cases: recentRuns.map((run) => ({
        queryText: `chat_message:${run.chatMessageId}`,
        expectedCitations: null,
        actualCitations: run.citationCoverage > 0 ? ["citation_present"] : [],
        verdict: run.status === "blocked" ? "bad" : "good",
        notes: [
          `status=${run.status}`,
          `grounded=${run.groundednessStatus}`,
          `freshness=${run.freshnessStatus}`,
          `permission=${run.permissionSafetyStatus}`,
          `coverage=${run.citationCoverage.toFixed(2)}`,
          ...run.reasons
        ].join("; ")
      }))
    });

    await appendAuditEvent({
      organizationId,
      actorId: payload.triggeredBy,
      eventType: "quality.eval.loop.completed",
      entityType: "retrieval_eval_run",
      entityId: evalRun.id,
      payload: {
        sourceRequestId: payload.sourceRequestId ?? null,
        triggerReason: payload.triggerReason ?? "scheduled",
        windowMinutes,
        totalCases: recentRuns.length,
        blocked: stats.blocked,
        passRate: stats.passRate
      }
    });

    if (stats.total >= minSamples && stats.passRate < minPassRate) {
      const openIncidents = await listOpenIncidentEvents(organizationId);
      if (!hasOpenQualityIncident(openIncidents, "answer_quality_regression")) {
        await createIncidentEvent({
          organizationId,
          severity: stats.passRate < minPassRate - 20 ? "critical" : "warning",
          eventType: "answer_quality_regression",
          summary: `Answer quality pass rate dropped to ${stats.passRate.toFixed(2)}% in the last ${windowMinutes} minutes.`,
          metadata: {
            windowMinutes,
            minPassRate,
            total: stats.total,
            blocked: stats.blocked,
            groundednessBlocked: stats.groundednessBlocked,
            freshnessBlocked: stats.freshnessBlocked,
            permissionSafetyBlocked: stats.permissionSafetyBlocked
          },
          createdBy: payload.triggeredBy
        });
      }
    }
  }

  helpers.logger.info(
    `qualityEvalLoop organizations=${orgIds.length} windowMinutes=${windowMinutes} minPassRate=${minPassRate}`
  );
}
