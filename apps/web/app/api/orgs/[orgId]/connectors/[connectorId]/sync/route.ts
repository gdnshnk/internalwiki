import { jsonError, jsonOk, rateLimitError } from "@/lib/api";
import { requireSessionContext } from "@/lib/api-auth";
import { writeAuditEvent } from "@/lib/audit";
import { assertScopedOrgAccess } from "@/lib/organization";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveRequestId, withRequestId } from "@/lib/request-id";
import { enforceMutationSecurity } from "@/lib/security";
import { enqueueSyncConnectorJob } from "@/lib/worker-jobs";
import { beginIdempotentMutation, finalizeIdempotentMutation } from "@/lib/idempotency";
import { getConnectorAccount } from "@internalwiki/db";

export async function POST(
  request: Request,
  context: { params: Promise<{ orgId: string; connectorId: string }> }
): Promise<Response> {
  const requestId = resolveRequestId(request);
  const securityError = enforceMutationSecurity(request);
  if (securityError) {
    return securityError;
  }

  const { orgId, connectorId } = await context.params;
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
    key: `${session.organizationId}:${session.userId}:connector_sync_trigger`,
    windowMs: 60_000,
    maxRequests: 20
  });
  if (!rate.allowed) {
    return rateLimitError({ retryAfterMs: rate.retryAfterMs, requestId });
  }

  const idempotency = await beginIdempotentMutation({
    request,
    requestId,
    organizationId: orgId,
    actorId: session.userId,
    payload: { connectorId }
  });
  if ("response" in idempotency) {
    return idempotency.response;
  }

  const connector = await getConnectorAccount(orgId, connectorId);
  if (!connector) {
    await finalizeIdempotentMutation({
      keyHash: idempotency.keyHash,
      organizationId: orgId,
      method: idempotency.method,
      path: idempotency.path,
      status: 404,
      responseBody: { error: "Connector account not found" }
    });
    return jsonError("Connector account not found", 404, withRequestId(requestId));
  }

  const queued = await enqueueSyncConnectorJob({
    organizationId: orgId,
    connectorAccountId: connectorId,
    connectorType: connector.connectorType,
    triggeredBy: session.userId
  });

  await writeAuditEvent({
    organizationId: orgId,
    actorId: session.userId,
    eventType: "connector.sync.triggered",
    entityType: "connector_account",
    entityId: connectorId,
    payload: {
      requestedAt: new Date().toISOString(),
      jobId: queued.jobId,
      jobKey: queued.jobKey
    }
  });

  const responsePayload = {
    status: "queued",
    connectorId,
    jobId: queued.jobId,
    scheduledAt: new Date().toISOString(),
    nextScheduledSync: new Date(Date.now() + 15 * 60 * 1000).toISOString()
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
