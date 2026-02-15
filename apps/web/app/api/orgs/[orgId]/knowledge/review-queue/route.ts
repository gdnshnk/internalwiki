import { listKnowledgeReviewTasks } from "@internalwiki/db";
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
    assertScopedOrgAccess({ session, targetOrgId: orgId, minimumRole: "viewer" });
  } catch (error) {
    return jsonError((error as Error).message, 403, withRequestId(requestId));
  }

  const rate = await checkRateLimit({
    key: `${session.organizationId}:${session.userId}:knowledge_review_queue_get`,
    windowMs: 60_000,
    maxRequests: 120
  });
  if (!rate.allowed) {
    return rateLimitError({ retryAfterMs: rate.retryAfterMs, requestId });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const taskType = url.searchParams.get("taskType");

  const items = await listKnowledgeReviewTasks({
    organizationId: orgId,
    status:
      status === "open" || status === "in_progress" || status === "resolved" || status === "dismissed"
        ? status
        : undefined,
    taskType:
      taskType === "scheduled_review" ||
      taskType === "dependency_change" ||
      taskType === "low_confidence" ||
      taskType === "canonical_candidate"
        ? taskType
        : undefined,
    limit: 200
  });

  return jsonOk({ items }, withRequestId(requestId));
}
