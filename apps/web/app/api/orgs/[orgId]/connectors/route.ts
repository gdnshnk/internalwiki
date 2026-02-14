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
import { enqueueSyncConnectorJob } from "@/lib/worker-jobs";
import { createConnectorAccount, listConnectorAccounts, upsertUserSourceIdentity } from "@internalwiki/db";
import { randomUUID } from "node:crypto";

const connectorSchema = z.object({
  connectorType: z.enum([
    "google_drive",
    "google_docs",
    "slack",
    "microsoft_teams",
    "microsoft_sharepoint",
    "microsoft_onedrive",
    "notion"
  ]),
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

  if (parsedBody.data.connectorType === "notion") {
    return jsonError(
      "Notion is deprecated and cannot be newly connected. Use Slack or Microsoft integrations.",
      410,
      withRequestId(requestId)
    );
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

  if (
    parsedBody.data.connectorType === "slack" ||
    parsedBody.data.connectorType === "microsoft_teams" ||
    parsedBody.data.connectorType === "microsoft_sharepoint" ||
    parsedBody.data.connectorType === "microsoft_onedrive"
  ) {
    const sourceSystem = parsedBody.data.connectorType === "slack" ? "slack" : "microsoft";
    await upsertUserSourceIdentity({
      organizationId: orgId,
      userId: session.userId,
      sourceSystem,
      sourceUserKey: `email:${session.email.toLowerCase()}`,
      displayName: session.email,
      createdBy: session.userId
    });
    await upsertUserSourceIdentity({
      organizationId: orgId,
      userId: session.userId,
      sourceSystem,
      sourceUserKey: `org:${orgId}:member`,
      displayName: "Organization member access",
      createdBy: session.userId
    });
  }

  let queuedSync: { jobId: string; jobKey: string } | null = null;
  try {
    queuedSync = await enqueueSyncConnectorJob({
      organizationId: orgId,
      connectorAccountId: connector.id,
      connectorType: connector.connectorType,
      triggeredBy: session.userId
    });
  } catch (error) {
    console.error("[ConnectorCreate] Failed to enqueue initial sync job", error);
  }

  await writeAuditEvent({
    organizationId: orgId,
    actorId: session.userId,
    eventType: "connector.create",
    entityType: "connector_account",
    entityId: connector.id,
    payload: {
      connectorType: connector.connectorType,
      displayName: connector.displayName,
      syncQueued: Boolean(queuedSync),
      queueJobId: queuedSync?.jobId ?? null
    }
  });

  return jsonOk(
    {
      connector: toPublicConnector(connector),
      syncQueued: Boolean(queuedSync),
      queueJobId: queuedSync?.jobId ?? null,
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
