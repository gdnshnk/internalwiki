import { z } from "zod";
import { jsonError, jsonOk, rateLimitError } from "@/lib/api";
import { requireSessionContext } from "@/lib/api-auth";
import { writeAuditEvent } from "@/lib/audit";
import { toPublicConnector } from "@/lib/connector-response";
import { encryptSecret } from "@/lib/crypto";
import { assertScopedOrgAccess } from "@/lib/organization";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveRequestId, withRequestId } from "@/lib/request-id";
import { enforceMutationSecurity } from "@/lib/security";
import { beginIdempotentMutation, finalizeIdempotentMutation } from "@/lib/idempotency";
import { deleteConnectorAccount, updateConnectorAccount } from "@internalwiki/db";

const patchSchema = z.object({
  status: z.enum(["active", "reauth_required", "disabled"]).optional(),
  displayName: z.string().min(2).optional(),
  externalWorkspaceId: z.string().min(2).optional(),
  accessToken: z.string().min(8).optional(),
  refreshToken: z.string().min(8).optional(),
  tokenExpiresAt: z.string().optional()
});

export async function PATCH(
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
    assertScopedOrgAccess({ session, targetOrgId: orgId, minimumRole: "admin" });
  } catch (error) {
    return jsonError((error as Error).message, 403, withRequestId(requestId));
  }

  const patchRate = await checkRateLimit({
    key: `${session.organizationId}:${session.userId}:connector_patch`,
    windowMs: 60_000,
    maxRequests: 40
  });
  if (!patchRate.allowed) {
    return rateLimitError({ retryAfterMs: patchRate.retryAfterMs, requestId });
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

  const connector = await updateConnectorAccount(orgId, connectorId, {
    status: parsed.data.status,
    displayName: parsed.data.displayName,
    externalWorkspaceId: parsed.data.externalWorkspaceId,
    encryptedAccessToken: parsed.data.accessToken ? encryptSecret(parsed.data.accessToken) : undefined,
    encryptedRefreshToken: parsed.data.refreshToken ? encryptSecret(parsed.data.refreshToken) : undefined,
    tokenExpiresAt: parsed.data.tokenExpiresAt
  });

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

  await writeAuditEvent({
    organizationId: orgId,
    actorId: session.userId,
    eventType: "connector.update",
    entityType: "connector_account",
    entityId: connectorId,
    payload: {
      patch: {
        status: parsed.data.status,
        displayName: parsed.data.displayName,
        externalWorkspaceId: parsed.data.externalWorkspaceId,
        hasAccessToken: Boolean(parsed.data.accessToken),
        hasRefreshToken: Boolean(parsed.data.refreshToken)
      }
    }
  });

  const responsePayload = { connector: toPublicConnector(connector) };
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

export async function DELETE(
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
    assertScopedOrgAccess({ session, targetOrgId: orgId, minimumRole: "admin" });
  } catch (error) {
    return jsonError((error as Error).message, 403, withRequestId(requestId));
  }

  const deleteRate = await checkRateLimit({
    key: `${session.organizationId}:${session.userId}:connector_delete`,
    windowMs: 60_000,
    maxRequests: 20
  });
  if (!deleteRate.allowed) {
    return rateLimitError({ retryAfterMs: deleteRate.retryAfterMs, requestId });
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

  const deleted = await deleteConnectorAccount(orgId, connectorId);
  if (!deleted) {
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

  await writeAuditEvent({
    organizationId: orgId,
    actorId: session.userId,
    eventType: "connector.delete",
    entityType: "connector_account",
    entityId: connectorId,
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
