import { z } from "zod";
import {
  clearUserMemory,
  deleteUserMemoryEntry,
  getOrCreateUserMemoryProfile,
  listUserMemoryEntries,
  updateUserMemoryProfile,
  upsertUserMemoryEntry
} from "@internalwiki/db";
import { jsonError, jsonOk, rateLimitError } from "@/lib/api";
import { requireSessionContext } from "@/lib/api-auth";
import { writeAuditEvent } from "@/lib/audit";
import { beginIdempotentMutation, finalizeIdempotentMutation } from "@/lib/idempotency";
import { assertScopedOrgAccess } from "@/lib/organization";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveRequestId, withRequestId } from "@/lib/request-id";
import { enforceMutationSecurity } from "@/lib/security";

const upsertEntrySchema = z.object({
  key: z.string().min(2).max(64),
  value: z.string().min(1).max(600),
  sensitivity: z.enum(["low", "medium", "high"]).optional(),
  expiresAt: z.string().datetime().nullable().optional()
});

const updateSchema = z
  .object({
    personalizationEnabled: z.boolean().optional(),
    profileSummary: z.string().max(600).nullable().optional(),
    retentionDays: z.number().int().min(7).max(365).optional(),
    upsertEntry: upsertEntrySchema.optional(),
    deleteEntryKey: z.string().min(2).max(64).optional()
  })
  .refine(
    (value) =>
      value.personalizationEnabled !== undefined ||
      Object.prototype.hasOwnProperty.call(value, "profileSummary") ||
      value.retentionDays !== undefined ||
      value.upsertEntry !== undefined ||
      value.deleteEntryKey !== undefined,
    { message: "At least one update field is required." }
  );

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

  const rate = await checkRateLimit({
    key: `${session.organizationId}:${session.userId}:memory_profile_read`,
    windowMs: 60_000,
    maxRequests: 120
  });
  if (!rate.allowed) {
    return rateLimitError({ retryAfterMs: rate.retryAfterMs, requestId });
  }

  const [profile, entries] = await Promise.all([
    getOrCreateUserMemoryProfile({
      organizationId: orgId,
      userId: session.userId,
      createdBy: session.userId
    }),
    listUserMemoryEntries({
      organizationId: orgId,
      userId: session.userId,
      limit: 25
    })
  ]);

  return jsonOk({ profile, entries }, withRequestId(requestId));
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
    assertScopedOrgAccess({ session, targetOrgId: orgId, minimumRole: "viewer" });
  } catch (error) {
    return jsonError((error as Error).message, 403, withRequestId(requestId));
  }

  const rate = await checkRateLimit({
    key: `${session.organizationId}:${session.userId}:memory_profile_write`,
    windowMs: 60_000,
    maxRequests: 45
  });
  if (!rate.allowed) {
    return rateLimitError({ retryAfterMs: rate.retryAfterMs, requestId });
  }

  const parsed = updateSchema.safeParse(await request.json().catch(() => ({})));
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

  const payload = parsed.data;
  if (
    payload.personalizationEnabled !== undefined ||
    Object.prototype.hasOwnProperty.call(payload, "profileSummary") ||
    payload.retentionDays !== undefined
  ) {
    await updateUserMemoryProfile({
      organizationId: orgId,
      userId: session.userId,
      personalizationEnabled: payload.personalizationEnabled,
      profileSummary: payload.profileSummary,
      retentionDays: payload.retentionDays,
      createdBy: session.userId
    });
  } else {
    await getOrCreateUserMemoryProfile({
      organizationId: orgId,
      userId: session.userId,
      createdBy: session.userId
    });
  }

  if (payload.upsertEntry) {
    await upsertUserMemoryEntry({
      organizationId: orgId,
      userId: session.userId,
      key: payload.upsertEntry.key,
      value: payload.upsertEntry.value,
      sensitivity: payload.upsertEntry.sensitivity,
      source: "manual",
      expiresAt: payload.upsertEntry.expiresAt ?? null,
      createdBy: session.userId
    });
  }

  if (payload.deleteEntryKey) {
    await deleteUserMemoryEntry({
      organizationId: orgId,
      userId: session.userId,
      key: payload.deleteEntryKey
    });
  }

  const [profile, entries] = await Promise.all([
    getOrCreateUserMemoryProfile({
      organizationId: orgId,
      userId: session.userId,
      createdBy: session.userId
    }),
    listUserMemoryEntries({
      organizationId: orgId,
      userId: session.userId,
      limit: 25
    })
  ]);

  await writeAuditEvent({
    organizationId: orgId,
    actorId: session.userId,
    eventType: "security.memory.updated",
    entityType: "user_memory_profile",
    entityId: `${orgId}:${session.userId}`,
    payload: {
      personalizationEnabled: profile.personalizationEnabled,
      retentionDays: profile.retentionDays,
      updatedProfileSummary: Object.prototype.hasOwnProperty.call(payload, "profileSummary"),
      upsertedEntryKey: payload.upsertEntry?.key ?? null,
      deletedEntryKey: payload.deleteEntryKey ?? null,
      entryCount: entries.length
    }
  });

  const responsePayload = { profile, entries };
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
    assertScopedOrgAccess({ session, targetOrgId: orgId, minimumRole: "viewer" });
  } catch (error) {
    return jsonError((error as Error).message, 403, withRequestId(requestId));
  }

  const rate = await checkRateLimit({
    key: `${session.organizationId}:${session.userId}:memory_profile_clear`,
    windowMs: 60_000,
    maxRequests: 10
  });
  if (!rate.allowed) {
    return rateLimitError({ retryAfterMs: rate.retryAfterMs, requestId });
  }

  const idempotency = await beginIdempotentMutation({
    request,
    requestId,
    organizationId: orgId,
    actorId: session.userId,
    payload: { action: "clear_user_memory" }
  });
  if ("response" in idempotency) {
    return idempotency.response;
  }

  const result = await clearUserMemory({
    organizationId: orgId,
    userId: session.userId
  });

  await writeAuditEvent({
    organizationId: orgId,
    actorId: session.userId,
    eventType: "security.memory.cleared",
    entityType: "user_memory_profile",
    entityId: `${orgId}:${session.userId}`,
    payload: result
  });

  const responsePayload = {
    ok: true,
    ...result
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
