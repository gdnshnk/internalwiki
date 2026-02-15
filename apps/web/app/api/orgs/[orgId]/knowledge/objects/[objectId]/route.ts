import { z } from "zod";
import {
  appendKnowledgeEvent,
  archiveKnowledgeObject,
  getKnowledgeObjectById,
  listKnowledgeObjectDependencies,
  listKnowledgeObjectPermissionRules,
  listKnowledgeObjectReviewers,
  listKnowledgeObjectTags,
  listKnowledgeObjectVersions,
  replaceKnowledgeObjectDependencies,
  replaceKnowledgeObjectPermissionRules,
  replaceKnowledgeObjectReviewers,
  replaceKnowledgeObjectTags,
  updateKnowledgeObject
} from "@internalwiki/db";
import { jsonError, jsonOk, rateLimitError } from "@/lib/api";
import { requireSessionContext } from "@/lib/api-auth";
import { writeAuditEvent } from "@/lib/audit";
import { beginIdempotentMutation, finalizeIdempotentMutation } from "@/lib/idempotency";
import { assertScopedOrgAccess } from "@/lib/organization";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveRequestId, withRequestId } from "@/lib/request-id";
import { enforceMutationSecurity } from "@/lib/security";

const patchSchema = z.object({
  title: z.string().min(2).max(180).optional(),
  slug: z
    .string()
    .min(2)
    .max(160)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  ownerUserId: z.string().min(3).optional(),
  reviewIntervalDays: z.number().int().min(1).max(365).optional(),
  reviewDueAt: z.string().optional(),
  freshnessStatus: z.enum(["fresh", "stale", "at_risk"]).optional(),
  confidenceScore: z.number().min(0).max(1).optional(),
  lastValidatedAt: z.string().optional(),
  provenance: z.record(z.unknown()).optional(),
  permissionsMode: z.enum(["custom", "inherited_source_acl", "org_wide"]).optional(),
  tags: z.array(z.string().min(1).max(64)).max(30).optional(),
  reviewers: z
    .array(
      z.object({
        reviewerUserId: z.string().min(3),
        required: z.boolean().optional()
      })
    )
    .max(30)
    .optional(),
  dependencies: z
    .array(
      z.object({
        dependencyType: z.enum(["knowledge_object", "system", "repo"]),
        dependencyObjectId: z.string().optional(),
        dependencyRef: z.string().optional(),
        dependencyLabel: z.string().optional(),
        relationType: z.enum(["depends_on", "references", "validated_by"]).optional(),
        lastObservedVersion: z.string().optional()
      })
    )
    .max(50)
    .optional(),
  permissionRules: z
    .array(
      z.object({
        principalType: z.enum(["user", "group", "role", "org"]),
        principalKey: z.string().min(1),
        accessLevel: z.enum(["viewer", "editor", "admin"]),
        effect: z.enum(["allow", "deny"]).optional()
      })
    )
    .max(100)
    .optional()
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

  const item = await getKnowledgeObjectById(orgId, objectId);
  if (!item) {
    return jsonError("Knowledge object not found", 404, withRequestId(requestId));
  }

  const [reviewers, tags, dependencies, permissionRules, versions] = await Promise.all([
    listKnowledgeObjectReviewers({ organizationId: orgId, knowledgeObjectId: objectId }),
    listKnowledgeObjectTags({ organizationId: orgId, knowledgeObjectId: objectId }),
    listKnowledgeObjectDependencies({ organizationId: orgId, knowledgeObjectId: objectId }),
    listKnowledgeObjectPermissionRules({ organizationId: orgId, knowledgeObjectId: objectId }),
    listKnowledgeObjectVersions({ organizationId: orgId, knowledgeObjectId: objectId, limit: 20 })
  ]);

  return jsonOk({ item, reviewers, tags, dependencies, permissionRules, versions }, withRequestId(requestId));
}

export async function PATCH(
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
    key: `${session.organizationId}:${session.userId}:knowledge_object_patch`,
    windowMs: 60_000,
    maxRequests: 60
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

  const item = await updateKnowledgeObject({
    organizationId: orgId,
    knowledgeObjectId: objectId,
    title: parsed.data.title,
    slug: parsed.data.slug,
    ownerUserId: parsed.data.ownerUserId,
    reviewIntervalDays: parsed.data.reviewIntervalDays,
    reviewDueAt: parsed.data.reviewDueAt,
    freshnessStatus: parsed.data.freshnessStatus,
    confidenceScore: parsed.data.confidenceScore,
    lastValidatedAt: parsed.data.lastValidatedAt,
    provenance: parsed.data.provenance,
    permissionsMode: parsed.data.permissionsMode
  });

  if (!item) {
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

  if (parsed.data.tags) {
    await replaceKnowledgeObjectTags({
      organizationId: orgId,
      knowledgeObjectId: objectId,
      tags: parsed.data.tags,
      createdBy: session.userId
    });
  }

  if (parsed.data.reviewers) {
    await replaceKnowledgeObjectReviewers({
      organizationId: orgId,
      knowledgeObjectId: objectId,
      reviewers: parsed.data.reviewers,
      createdBy: session.userId
    });
  }

  if (parsed.data.dependencies) {
    await replaceKnowledgeObjectDependencies({
      organizationId: orgId,
      knowledgeObjectId: objectId,
      dependencies: parsed.data.dependencies,
      createdBy: session.userId
    });
  }

  if (parsed.data.permissionRules) {
    await replaceKnowledgeObjectPermissionRules({
      organizationId: orgId,
      knowledgeObjectId: objectId,
      rules: parsed.data.permissionRules,
      createdBy: session.userId
    });
  }

  await appendKnowledgeEvent({
    organizationId: orgId,
    knowledgeObjectId: objectId,
    eventType: "knowledge.updated",
    payload: {
      source: "knowledge.objects.patch"
    },
    createdBy: session.userId
  });

  await writeAuditEvent({
    organizationId: orgId,
    actorId: session.userId,
    eventType: "knowledge.object.update",
    entityType: "knowledge_object",
    entityId: objectId,
    payload: {
      title: item.title,
      freshnessStatus: item.freshnessStatus
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

export async function DELETE(
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
    assertScopedOrgAccess({ session, targetOrgId: orgId, minimumRole: "admin" });
  } catch (error) {
    return jsonError((error as Error).message, 403, withRequestId(requestId));
  }

  const rate = await checkRateLimit({
    key: `${session.organizationId}:${session.userId}:knowledge_object_delete`,
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
    payload: { objectId }
  });
  if ("response" in idempotency) {
    return idempotency.response;
  }

  const deleted = await archiveKnowledgeObject({
    organizationId: orgId,
    knowledgeObjectId: objectId
  });

  if (!deleted) {
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

  await writeAuditEvent({
    organizationId: orgId,
    actorId: session.userId,
    eventType: "knowledge.object.archive",
    entityType: "knowledge_object",
    entityId: objectId,
    payload: {
      archived: true
    }
  });

  const responseBody = { ok: true, archived: true };
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
