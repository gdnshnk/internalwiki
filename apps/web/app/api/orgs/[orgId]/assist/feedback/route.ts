import { z } from "zod";
import type { AssistantFeedbackRequest, AssistantFeedbackResponse } from "@internalwiki/core";
import { saveAssistantFeedback } from "@internalwiki/db";
import { jsonError, jsonOk, rateLimitError } from "@/lib/api";
import { requireSessionContext } from "@/lib/api-auth";
import { writeAuditEvent } from "@/lib/audit";
import { assertScopedOrgAccess } from "@/lib/organization";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveRequestId, withRequestId } from "@/lib/request-id";
import { enforceMutationSecurity } from "@/lib/security";

const feedbackSchema = z.object({
  threadId: z.string().min(8),
  messageId: z.string().min(8),
  vote: z.enum(["up", "down"]),
  reason: z.string().max(1000).optional()
});

export async function POST(
  request: Request,
  context: { params: Promise<{ orgId: string }> }
): Promise<Response> {
  const requestId = resolveRequestId(request);
  const securityError = enforceMutationSecurity(request);
  if (securityError) {
    return securityError;
  }

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
    key: `${session.organizationId}:${session.userId}:assist_feedback`,
    windowMs: 60_000,
    maxRequests: 90
  });
  if (!rate.allowed) {
    return rateLimitError({ retryAfterMs: rate.retryAfterMs, requestId });
  }

  const parsed = feedbackSchema.safeParse(await request.json().catch(() => ({} as AssistantFeedbackRequest)));
  if (!parsed.success) {
    return jsonError(parsed.error.message, 422, withRequestId(requestId));
  }

  const saved = await saveAssistantFeedback({
    organizationId: orgId,
    threadId: parsed.data.threadId,
    messageId: parsed.data.messageId,
    vote: parsed.data.vote,
    reason: parsed.data.reason,
    actorId: session.userId
  });

  if (!saved) {
    return jsonError("Message not found in this organization thread", 404, withRequestId(requestId));
  }

  await writeAuditEvent({
    organizationId: orgId,
    actorId: session.userId,
    eventType: "assistant.feedback",
    entityType: "chat_message",
    entityId: parsed.data.messageId,
    payload: {
      threadId: parsed.data.threadId,
      vote: parsed.data.vote,
      hasReason: Boolean(parsed.data.reason)
    }
  });

  return jsonOk<AssistantFeedbackResponse>({ ok: true }, withRequestId(requestId));
}
