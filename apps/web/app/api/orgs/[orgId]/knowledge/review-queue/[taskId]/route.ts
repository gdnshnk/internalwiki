import { z } from "zod";
import { updateKnowledgeReviewTask } from "@internalwiki/db";
import { jsonError, jsonOk, rateLimitError } from "@/lib/api";
import { requireSessionContext } from "@/lib/api-auth";
import { writeAuditEvent } from "@/lib/audit";
import { beginIdempotentMutation, finalizeIdempotentMutation } from "@/lib/idempotency";
import { assertScopedOrgAccess } from "@/lib/organization";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveRequestId, withRequestId } from "@/lib/request-id";
import { enforceMutationSecurity } from "@/lib/security";

const patchSchema = z.object({
  status: z.enum(["open", "in_progress", "resolved", "dismissed"]).optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  reason: z.string().min(2).max(400).optional(),
  metadata: z.record(z.unknown()).optional()
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ orgId: string; taskId: string }> }
): Promise<Response> {
  const requestId = resolveRequestId(request);
  const securityError = enforceMutationSecurity(request);
  if (securityError) {
    return securityError;
  }

  const { orgId, taskId } = await context.params;
  const sessionResult = await requireSessionContext(requestId);
  if (sessionResult instanceof Response) {
    return sessionResult;
  }
  const session = sessionResult;

  try {
    assertScopedOrgAccess({ session, targetOrgId: orgId, minimumRole: "editor" });
  } catch (error) {
    return jsonError((error as Error).message, 403, withRequestId(requestId));
  }

  const rate = await checkRateLimit({
    key: `${session.organizationId}:${session.userId}:knowledge_review_queue_patch`,
    windowMs: 60_000,
    maxRequests: 80
  });
  if (!rate.allowed) {
    return rateLimitError({ retryAfterMs: rate.retryAfterMs, requestId });
  }

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return jsonError(parsed.error.message, 422, withRequestId(requestId));
  }

  const idempotency = await beginIdempotentMutation({
    request,
    requestId,
    organizationId: orgId,
    actorId: session.userId,
    payload: parsed.data
  });
  if ("response" in idempotency) {
    return idempotency.response;
  }

  const item = await updateKnowledgeReviewTask({
    organizationId: orgId,
    taskId,
    status: parsed.data.status,
    priority: parsed.data.priority,
    reason: parsed.data.reason,
    metadata: parsed.data.metadata
  });

  if (!item) {
    await finalizeIdempotentMutation({
      keyHash: idempotency.keyHash,
      organizationId: orgId,
      method: idempotency.method,
      path: idempotency.path,
      status: 404,
      responseBody: { error: "Knowledge review task not found" }
    });
    return jsonError("Knowledge review task not found", 404, withRequestId(requestId));
  }

  await writeAuditEvent({
    organizationId: orgId,
    actorId: session.userId,
    eventType: "knowledge.review_task.update",
    entityType: "knowledge_review_task",
    entityId: taskId,
    payload: {
      status: item.status,
      priority: item.priority
    }
  });

  const responseBody = { item };
  await finalizeIdempotentMutation({
    keyHash: idempotency.keyHash,
    organizationId: orgId,
    method: idempotency.method,
    path: idempotency.path,
    status: 200,
    responseBody
  });

  return jsonOk(responseBody, withRequestId(requestId));
}
