import { z } from "zod";
import {
  appendKnowledgeEvent,
  createKnowledgeObject,
  createKnowledgeObjectVersion,
  listKnowledgeObjects,
  replaceKnowledgeObjectDependencies,
  replaceKnowledgeObjectPermissionRules,
  replaceKnowledgeObjectReviewers,
  replaceKnowledgeObjectTags
} from "@internalwiki/db";
import { jsonError, jsonOk, rateLimitError } from "@/lib/api";
import { requireSessionContext } from "@/lib/api-auth";
import { writeAuditEvent } from "@/lib/audit";
import { beginIdempotentMutation, finalizeIdempotentMutation } from "@/lib/idempotency";
import { assertScopedOrgAccess } from "@/lib/organization";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveRequestId, withRequestId } from "@/lib/request-id";
import { enforceMutationSecurity } from "@/lib/security";

const createKnowledgeObjectSchema = z.object({
  title: z.string().min(2).max(180),
  slug: z
    .string()
    .min(2)
    .max(160)
    .regex(/^[a-z0-9-]+$/),
  ownerUserId: z.string().min(3).optional(),
  sourceType: z.enum(["manual", "generated", "imported"]).default("manual"),
  reviewIntervalDays: z.number().int().min(1).max(365),
  reviewDueAt: z.string().optional(),
  freshnessStatus: z.enum(["fresh", "stale", "at_risk"]).optional(),
  confidenceScore: z.number().min(0).max(1).optional(),
  lastValidatedAt: z.string().optional(),
  provenance: z.record(z.unknown()).optional(),
  permissionsMode: z.enum(["custom", "inherited_source_acl", "org_wide"]).default("custom"),
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
    .optional(),
  initialVersion: z
    .object({
      contentMarkdown: z.string().min(1),
      contentBlocks: z.array(z.record(z.unknown())).optional(),
      changeSummary: z.string().max(400).optional(),
      validatedAt: z.string().optional()
    })
    .optional()
});

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

  const url = new URL(request.url);
  const freshnessStatusParam = url.searchParams.get("freshnessStatus");
  const ownerUserId = url.searchParams.get("ownerUserId") ?? undefined;
  const includeArchived = url.searchParams.get("includeArchived") === "1";
  const tags = url.searchParams.getAll("tag").filter(Boolean);

  const items = await listKnowledgeObjects({
    organizationId: orgId,
    includeArchived,
    freshnessStatus:
      freshnessStatusParam === "fresh" || freshnessStatusParam === "stale" || freshnessStatusParam === "at_risk"
        ? freshnessStatusParam
        : undefined,
    ownerUserId,
    tags
  });

  return jsonOk({ items }, withRequestId(requestId));
}

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
    assertScopedOrgAccess({ session, targetOrgId: orgId, minimumRole: "editor" });
  } catch (error) {
    return jsonError((error as Error).message, 403, withRequestId(requestId));
  }

  const rate = await checkRateLimit({
    key: `${session.organizationId}:${session.userId}:knowledge_object_create`,
    windowMs: 60_000,
    maxRequests: 30
  });
  if (!rate.allowed) {
    return rateLimitError({ retryAfterMs: rate.retryAfterMs, requestId });
  }

  const parsed = createKnowledgeObjectSchema.safeParse(await request.json());
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

  const created = await createKnowledgeObject({
    organizationId: orgId,
    title: parsed.data.title,
    slug: parsed.data.slug,
    ownerUserId: parsed.data.ownerUserId ?? session.userId,
    sourceType: parsed.data.sourceType,
    reviewIntervalDays: parsed.data.reviewIntervalDays,
    reviewDueAt: parsed.data.reviewDueAt,
    freshnessStatus: parsed.data.freshnessStatus,
    confidenceScore: parsed.data.confidenceScore,
    lastValidatedAt: parsed.data.lastValidatedAt,
    provenance: parsed.data.provenance,
    permissionsMode: parsed.data.permissionsMode,
    createdBy: session.userId
  });

  if (parsed.data.tags) {
    await replaceKnowledgeObjectTags({
      organizationId: orgId,
      knowledgeObjectId: created.id,
      tags: parsed.data.tags,
      createdBy: session.userId
    });
  }

  if (parsed.data.reviewers) {
    await replaceKnowledgeObjectReviewers({
      organizationId: orgId,
      knowledgeObjectId: created.id,
      reviewers: parsed.data.reviewers,
      createdBy: session.userId
    });
  }

  if (parsed.data.dependencies) {
    await replaceKnowledgeObjectDependencies({
      organizationId: orgId,
      knowledgeObjectId: created.id,
      dependencies: parsed.data.dependencies,
      createdBy: session.userId
    });
  }

  if (parsed.data.permissionRules) {
    await replaceKnowledgeObjectPermissionRules({
      organizationId: orgId,
      knowledgeObjectId: created.id,
      rules: parsed.data.permissionRules,
      createdBy: session.userId
    });
  }

  if (parsed.data.initialVersion) {
    await createKnowledgeObjectVersion({
      organizationId: orgId,
      knowledgeObjectId: created.id,
      contentMarkdown: parsed.data.initialVersion.contentMarkdown,
      contentBlocks: parsed.data.initialVersion.contentBlocks,
      changeSummary: parsed.data.initialVersion.changeSummary,
      validatedByUserId: session.userId,
      validatedAt: parsed.data.initialVersion.validatedAt,
      createdBy: session.userId
    });
  }

  await appendKnowledgeEvent({
    organizationId: orgId,
    knowledgeObjectId: created.id,
    eventType: "knowledge.updated",
    payload: {
      source: "knowledge.objects.create"
    },
    createdBy: session.userId
  });

  await writeAuditEvent({
    organizationId: orgId,
    actorId: session.userId,
    eventType: "knowledge.object.create",
    entityType: "knowledge_object",
    entityId: created.id,
    payload: {
      slug: created.slug,
      sourceType: created.sourceType,
      reviewIntervalDays: created.reviewIntervalDays
    }
  });

  const responseBody = { item: created };
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
