import { deleteOrganizationDomain } from "@internalwiki/db";
import { jsonError, jsonOk, rateLimitError } from "@/lib/api";
import { requireSessionContext } from "@/lib/api-auth";
import { writeAuditEvent } from "@/lib/audit";
import { assertScopedOrgAccess } from "@/lib/organization";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveRequestId, withRequestId } from "@/lib/request-id";
import { enforceMutationSecurity } from "@/lib/security";
import { beginIdempotentMutation, finalizeIdempotentMutation } from "@/lib/idempotency";
import { requireBusinessFeature } from "@/lib/billing";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ orgId: string; domainId: string }> }
): Promise<Response> {
  const requestId = resolveRequestId(request);
  const securityError = enforceMutationSecurity(request);
  if (securityError) {
    return securityError;
  }

  const { orgId, domainId } = await context.params;
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

  const featureError = await requireBusinessFeature({
    organizationId: orgId,
    feature: "domainInviteControls",
    requestId
  });
  if (featureError) {
    return featureError;
  }

  const rate = await checkRateLimit({
    key: `${session.organizationId}:${session.userId}:security_domain_delete`,
    windowMs: 60_000,
    maxRequests: 25
  });
  if (!rate.allowed) {
    return rateLimitError({ retryAfterMs: rate.retryAfterMs, requestId });
  }

  const idempotency = await beginIdempotentMutation({
    request,
    requestId,
    organizationId: orgId,
    actorId: session.userId,
    payload: { domainId }
  });
  if ("response" in idempotency) {
    return idempotency.response;
  }

  const deleted = await deleteOrganizationDomain(orgId, domainId);
  if (!deleted) {
    await finalizeIdempotentMutation({
      keyHash: idempotency.keyHash,
      organizationId: orgId,
      method: idempotency.method,
      path: idempotency.path,
      status: 404,
      responseBody: { error: "Domain not found" }
    });
    return jsonError("Domain not found", 404, withRequestId(requestId));
  }

  await writeAuditEvent({
    organizationId: orgId,
    actorId: session.userId,
    eventType: "security.domain.deleted",
    entityType: "organization_domain",
    entityId: domainId,
    payload: {}
  });

  const responsePayload = { deleted: true };
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
