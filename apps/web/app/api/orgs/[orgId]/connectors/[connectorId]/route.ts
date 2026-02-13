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

  const connector = await updateConnectorAccount(orgId, connectorId, {
    status: parsed.data.status,
    displayName: parsed.data.displayName,
    externalWorkspaceId: parsed.data.externalWorkspaceId,
    encryptedAccessToken: parsed.data.accessToken ? encryptSecret(parsed.data.accessToken) : undefined,
    encryptedRefreshToken: parsed.data.refreshToken ? encryptSecret(parsed.data.refreshToken) : undefined,
    tokenExpiresAt: parsed.data.tokenExpiresAt
  });

  if (!connector) {
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

  return jsonOk({ connector: toPublicConnector(connector) }, withRequestId(requestId));
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

  const deleted = await deleteConnectorAccount(orgId, connectorId);
  if (!deleted) {
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

  return jsonOk({ deleted: true }, withRequestId(requestId));
}
