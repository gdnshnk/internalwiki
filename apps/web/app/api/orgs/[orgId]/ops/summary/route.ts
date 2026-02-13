import type { OpsSummaryResponse } from "@internalwiki/core";
import {
  countDocumentsByOrganization,
  getConnectorSyncStats,
  getRecentDeadLetterEvents,
  getReviewQueueStats
} from "@internalwiki/db";
import { jsonError, jsonOk, rateLimitError } from "@/lib/api";
import { requireSessionContext } from "@/lib/api-auth";
import { assertScopedOrgAccess } from "@/lib/organization";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveRequestId, withRequestId } from "@/lib/request-id";

export async function GET(
  request: Request,
  context: { params: Promise<{ orgId: string }> }
): Promise<Response> {
  const requestId = resolveRequestId(request);
  const { orgId } = await context.params;
  const sessionResult = await requireSessionContext(requestId);
  if (sessionResult instanceof Response) {
    return sessionResult;
  }
  const session = sessionResult;

  try {
    assertScopedOrgAccess({ session, targetOrgId: orgId, minimumRole: "admin" });
  } catch (error) {
    return jsonError((error as Error).message, 403, withRequestId(requestId));
  }

  const rate = await checkRateLimit({
    key: `${session.organizationId}:${session.userId}:ops_summary`,
    windowMs: 60_000,
    maxRequests: 120
  });
  if (!rate.allowed) {
    return rateLimitError({ retryAfterMs: rate.retryAfterMs, requestId });
  }

  const [syncRuns, documentsIndexed, reviewQueue, deadLetters] = await Promise.all([
    getConnectorSyncStats(orgId),
    countDocumentsByOrganization(orgId),
    getReviewQueueStats(orgId),
    getRecentDeadLetterEvents(orgId)
  ]);

  const payload: OpsSummaryResponse = {
    organizationId: orgId,
    generatedAt: new Date().toISOString(),
    syncRuns,
    documents: {
      indexed: documentsIndexed
    },
    reviewQueue,
    deadLetters
  };

  return jsonOk(payload, withRequestId(requestId));
}
