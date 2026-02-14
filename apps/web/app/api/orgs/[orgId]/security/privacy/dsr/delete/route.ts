import { z } from "zod";
import {
  createPrivacyDeleteRequest,
  getUserByEmail,
  resolveMembership
} from "@internalwiki/db";
import { jsonError, jsonOk, rateLimitError } from "@/lib/api";
import { requireSessionContext } from "@/lib/api-auth";
import { writeAuditEvent } from "@/lib/audit";
import { beginIdempotentMutation, finalizeIdempotentMutation } from "@/lib/idempotency";
import { assertScopedOrgAccess } from "@/lib/organization";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveRequestId, withRequestId } from "@/lib/request-id";
import { enforceMutationSecurity } from "@/lib/security";

const dsrDeleteSchema = z.object({
  userId: z.string().min(2).optional(),
  email: z.string().email().optional()
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
    assertScopedOrgAccess({ session, targetOrgId: orgId, minimumRole: "admin" });
  } catch (error) {
    return jsonError((error as Error).message, 403, withRequestId(requestId));
  }

  const rate = await checkRateLimit({
    key: `${session.organizationId}:${session.userId}:privacy_dsr_delete`,
    windowMs: 60_000,
    maxRequests: 8
  });
  if (!rate.allowed) {
    return rateLimitError({ retryAfterMs: rate.retryAfterMs, requestId });
  }

  const parsed = dsrDeleteSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return jsonError(parsed.error.message, 422, withRequestId(requestId));
  }

  let subjectUserId = parsed.data.userId ?? session.userId;
  if (!parsed.data.userId && parsed.data.email) {
    const user = await getUserByEmail(parsed.data.email.trim().toLowerCase());
    if (!user) {
      return jsonError("User not found", 404, withRequestId(requestId));
    }
    subjectUserId = user.id;
  }

  const membership = await resolveMembership({
    userId: subjectUserId,
    organizationId: orgId
  });
  if (!membership) {
    return jsonError("User is not a member of this organization", 404, withRequestId(requestId));
  }

  const idempotency = await beginIdempotentMutation({
    request,
    requestId,
    organizationId: orgId,
    actorId: session.userId,
    payload: {
      subjectUserId
    }
  });
  if ("response" in idempotency) {
    return idempotency.response;
  }

  const deleteResult = await createPrivacyDeleteRequest({
    organizationId: orgId,
    subjectUserId,
    requestedBy: session.userId
  });

  await writeAuditEvent({
    organizationId: orgId,
    actorId: session.userId,
    eventType: "security.privacy.dsr_delete",
    entityType: "privacy_request",
    entityId: deleteResult.request.id,
    payload: {
      subjectUserId,
      status: deleteResult.request.status,
      legalHoldBlocked: deleteResult.legalHoldBlocked,
      deleted: deleteResult.deleted
    }
  });

  const responsePayload = {
    request: deleteResult.request,
    deleted: deleteResult.deleted,
    legalHoldBlocked: deleteResult.legalHoldBlocked,
    deletedCounts: deleteResult.deletedCounts
  };
  await finalizeIdempotentMutation({
    keyHash: idempotency.keyHash,
    organizationId: orgId,
    method: idempotency.method,
    path: idempotency.path,
    status: 200,
    responseBody: responsePayload
  });

  return jsonOk(responsePayload, withRequestId(requestId));
}

