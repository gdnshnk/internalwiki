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
import { createConnectorAccount, listConnectorAccounts } from "@internalwiki/db";
import { randomUUID } from "node:crypto";

const connectorSchema = z.object({
  connectorType: z.enum(["google_drive", "google_docs", "notion"]),
  displayName: z.string().min(2),
  externalWorkspaceId: z.string().min(2),
  accessToken: z.string().min(8),
  refreshToken: z.string().min(8).optional(),
  tokenExpiresAt: z.string().optional()
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
    key: `${session.organizationId}:${session.userId}:connector_create`,
    windowMs: 60_000,
    maxRequests: 30
  });
  if (!rate.allowed) {
    return rateLimitError({ retryAfterMs: rate.retryAfterMs, requestId });
  }

  const parsedBody = connectorSchema.safeParse(await request.json());
  if (!parsedBody.success) {
    return jsonError(parsedBody.error.message, 422, withRequestId(requestId));
  }

  const connector = await createConnectorAccount({
    id: randomUUID(),
    organizationId: orgId,
    connectorType: parsedBody.data.connectorType,
    encryptedAccessToken: encryptSecret(parsedBody.data.accessToken),
    encryptedRefreshToken: parsedBody.data.refreshToken
      ? encryptSecret(parsedBody.data.refreshToken)
      : undefined,
    tokenExpiresAt: parsedBody.data.tokenExpiresAt,
    createdBy: session.userId,
    status: "active",
    displayName: parsedBody.data.displayName,
    externalWorkspaceId: parsedBody.data.externalWorkspaceId
  });

  await writeAuditEvent({
    organizationId: orgId,
    actorId: session.userId,
    eventType: "connector.create",
    entityType: "connector_account",
    entityId: connector.id,
    payload: {
      connectorType: connector.connectorType,
      displayName: connector.displayName
    }
  });

  return jsonOk(
    {
      connector: toPublicConnector(connector),
      allConnectors: (await listConnectorAccounts(orgId)).map(toPublicConnector)
    },
    withRequestId(requestId)
  );
}

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

  return jsonOk({ connectors: (await listConnectorAccounts(orgId)).map(toPublicConnector) }, withRequestId(requestId));
}
