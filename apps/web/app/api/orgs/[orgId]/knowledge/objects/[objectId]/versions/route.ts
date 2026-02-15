import { z } from "zod";
import {
  appendKnowledgeEvent,
  createKnowledgeObjectVersion,
  listKnowledgeObjectVersions
} from "@internalwiki/db";
import { jsonError, jsonOk, rateLimitError } from "@/lib/api";
import { requireSessionContext } from "@/lib/api-auth";
import { writeAuditEvent } from "@/lib/audit";
import { beginIdempotentMutation, finalizeIdempotentMutation } from "@/lib/idempotency";
import { assertScopedOrgAccess } from "@/lib/organization";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveRequestId, withRequestId } from "@/lib/request-id";
import { enforceMutationSecurity } from "@/lib/security";

const createVersionSchema = z.object({
  contentMarkdown: z.string().min(1),
  contentBlocks: z.array(z.record(z.unknown())).optional(),
  changeSummary: z.string().max(400).optional(),
  validatedAt: z.string().optional(),
  markValidated: z.boolean().optional()
});

export async function GET(
  request: Request,
  context: { params: Promise<{ orgId: string; objectId: string }> }
): Promise<Response> {
  const requestId = resolveRequestId(request);
  const { orgId, objectId } = await context.params;

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

  const versions = await listKnowledgeObjectVersions({
    organizationId: orgId,
    knowledgeObjectId: objectId,
    limit: 50
  });

  return jsonOk({ versions }, withRequestId(requestId));
}

export async function POST(
  request: Request,
  context: { params: Promise<{ orgId: string; objectId: string }> }
): Promise<Response> {
  const requestId = resolveRequestId(request);
  const securityError = enforceMutationSecurity(request);
  if (securityError) {
    return securityError;
  }

  const { orgId, objectId } = await context.params;
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
    key: `${session.organizationId}:${session.userId}:knowledge_version_create`,
    windowMs: 60_000,
    maxRequests: 60
  });
  if (!rate.allowed) {
    return rateLimitError({ retryAfterMs: rate.retryAfterMs, requestId });
  }

  const parsed = createVersionSchema.safeParse(await request.json());
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

  const version = await createKnowledgeObjectVersion({
    organizationId: orgId,
    knowledgeObjectId: objectId,
    contentMarkdown: parsed.data.contentMarkdown,
    contentBlocks: parsed.data.contentBlocks,
    changeSummary: parsed.data.changeSummary,
    validatedByUserId: parsed.data.markValidated ? session.userId : undefined,
    validatedAt: parsed.data.validatedAt,
    createdBy: session.userId
  });

  if (!version) {
    await finalizeIdempotentMutation({
      keyHash: idempotency.keyHash,
      organizationId: orgId,
      method: idempotency.method,
      path: idempotency.path,
      status: 404,
      responseBody: { error: "Knowledge object not found" }
    });
    return jsonError("Knowledge object not found", 404, withRequestId(requestId));
  }

  await appendKnowledgeEvent({
    organizationId: orgId,
    knowledgeObjectId: objectId,
    eventType: parsed.data.markValidated ? "knowledge.validated" : "knowledge.updated",
    payload: {
      source: "knowledge.versions.create",
      versionId: version.id,
      versionNumber: version.versionNumber
    },
    createdBy: session.userId
  });

  await writeAuditEvent({
    organizationId: orgId,
    actorId: session.userId,
    eventType: "knowledge.version.create",
    entityType: "knowledge_object",
    entityId: objectId,
    payload: {
      versionId: version.id,
      versionNumber: version.versionNumber
    }
  });

  const responseBody = { version };
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
