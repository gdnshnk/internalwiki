import { z } from "zod";
import { updateRegistrationInvite } from "@internalwiki/db";
import { jsonError, jsonOk, rateLimitError } from "@/lib/api";
import { requireSessionContext } from "@/lib/api-auth";
import { writeAuditEvent } from "@/lib/audit";
import { assertScopedOrgAccess } from "@/lib/organization";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveRequestId, withRequestId } from "@/lib/request-id";
import { enforceMutationSecurity } from "@/lib/security";
import { beginIdempotentMutation, finalizeIdempotentMutation } from "@/lib/idempotency";
import { requireBusinessFeature } from "@/lib/billing";

const patchInviteSchema = z
  .object({
    revoke: z.boolean().optional(),
    expiresAt: z.string().datetime().optional(),
    expiresInHours: z.number().int().min(1).max(24 * 90).optional()
  })
  .refine((input) => input.revoke || input.expiresAt || input.expiresInHours, {
    message: "Specify revoke and/or new expiry."
  });

export async function PATCH(
  request: Request,
  context: { params: Promise<{ orgId: string; inviteId: string }> }
): Promise<Response> {
  const requestId = resolveRequestId(request);
  const securityError = enforceMutationSecurity(request);
  if (securityError) {
    return securityError;
  }

  const { orgId, inviteId } = await context.params;
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
    key: `${session.organizationId}:${session.userId}:security_invite_patch`,
    windowMs: 60_000,
    maxRequests: 30
  });
  if (!rate.allowed) {
    return rateLimitError({ retryAfterMs: rate.retryAfterMs, requestId });
  }

  const parsed = patchInviteSchema.safeParse(await request.json().catch(() => ({})));
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

  const expiresAt =
    parsed.data.expiresAt ??
    (parsed.data.expiresInHours
      ? new Date(Date.now() + parsed.data.expiresInHours * 60 * 60 * 1000).toISOString()
      : undefined);

  const invite = await updateRegistrationInvite(orgId, inviteId, {
    expiresAt,
    revokedAt: parsed.data.revoke ? new Date().toISOString() : undefined
  });
  if (!invite) {
    await finalizeIdempotentMutation({
      keyHash: idempotency.keyHash,
      organizationId: orgId,
      method: idempotency.method,
      path: idempotency.path,
      status: 404,
      responseBody: { error: "Invite not found" }
    });
    return jsonError("Invite not found", 404, withRequestId(requestId));
  }

  await writeAuditEvent({
    organizationId: orgId,
    actorId: session.userId,
    eventType: "security.invite.updated",
    entityType: "registration_invite",
    entityId: inviteId,
    payload: {
      revoke: parsed.data.revoke ?? false,
      expiresAt: expiresAt ?? null
    }
  });

  const responsePayload = { invite };
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
