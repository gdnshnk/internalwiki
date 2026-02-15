import { randomBytes } from "node:crypto";
import { z } from "zod";
import { createRegistrationInvite, listRegistrationInvites } from "@internalwiki/db";
import { jsonError, jsonOk, rateLimitError } from "@/lib/api";
import { requireSessionContext } from "@/lib/api-auth";
import { writeAuditEvent } from "@/lib/audit";
import { assertScopedOrgAccess } from "@/lib/organization";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveRequestId, withRequestId } from "@/lib/request-id";
import { enforceMutationSecurity } from "@/lib/security";
import { beginIdempotentMutation, finalizeIdempotentMutation } from "@/lib/idempotency";
import { requireBusinessFeature } from "@/lib/billing";

const createInviteSchema = z
  .object({
    email: z.string().email().optional(),
    domain: z.string().min(3).optional(),
    role: z.enum(["admin", "editor", "viewer"]).default("viewer"),
    expiresInHours: z.number().int().min(1).max(24 * 90).default(24 * 7)
  })
  .refine((input) => Boolean(input.email || input.domain), {
    message: "Either email or domain is required."
  });

function generateInviteCode(): string {
  return randomBytes(10).toString("hex").toUpperCase();
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
    key: `${session.organizationId}:${session.userId}:security_invite_create`,
    windowMs: 60_000,
    maxRequests: 30
  });
  if (!rate.allowed) {
    return rateLimitError({ retryAfterMs: rate.retryAfterMs, requestId });
  }

  return jsonOk(
    {
      invites: await listRegistrationInvites(orgId)
    },
    withRequestId(requestId)
  );
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

  const parsed = createInviteSchema.safeParse(await request.json().catch(() => ({})));
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

  const code = generateInviteCode();
  const invite = await createRegistrationInvite({
    organizationId: orgId,
    code,
    email: parsed.data.email,
    domain: parsed.data.domain,
    role: parsed.data.role,
    expiresAt: new Date(Date.now() + parsed.data.expiresInHours * 60 * 60 * 1000).toISOString(),
    createdBy: session.userId
  });

  await writeAuditEvent({
    organizationId: orgId,
    actorId: session.userId,
    eventType: "security.invite.created",
    entityType: "registration_invite",
    entityId: invite.id,
    payload: {
      role: invite.role,
      email: invite.email ?? null,
      domain: invite.domain ?? null,
      expiresAt: invite.expiresAt
    }
  });

  const responsePayload = {
    invite,
    inviteCode: code
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
