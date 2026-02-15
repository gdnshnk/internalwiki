import { z } from "zod";
import { getOrCreateSessionPolicy, revokeOrganizationSessions, updateSessionPolicy } from "@internalwiki/db";
import { jsonError, jsonOk, rateLimitError } from "@/lib/api";
import { requireSessionContext } from "@/lib/api-auth";
import { writeAuditEvent } from "@/lib/audit";
import { assertScopedOrgAccess } from "@/lib/organization";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveRequestId, withRequestId } from "@/lib/request-id";
import { enforceMutationSecurity } from "@/lib/security";
import { beginIdempotentMutation, finalizeIdempotentMutation } from "@/lib/idempotency";
import { requireBusinessFeature } from "@/lib/billing";

const policySchema = z.object({
  sessionMaxAgeMinutes: z.number().int().min(60).max(60 * 24 * 90),
  sessionIdleTimeoutMinutes: z.number().int().min(5).max(60 * 24 * 30),
  concurrentSessionLimit: z.number().int().min(1).max(100),
  forceReauthAfterMinutes: z.number().int().min(60).max(60 * 24 * 30),
  forceRevokeAll: z.boolean().optional()
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
    assertScopedOrgAccess({ session, targetOrgId: orgId, minimumRole: "admin" });
  } catch (error) {
    return jsonError((error as Error).message, 403, withRequestId(requestId));
  }

  const featureError = await requireBusinessFeature({
    organizationId: orgId,
    feature: "sso",
    requestId
  });
  if (featureError) {
    return featureError;
  }

  const rate = await checkRateLimit({
    key: `${session.organizationId}:${session.userId}:security_session_policy_read`,
    windowMs: 60_000,
    maxRequests: 120
  });
  if (!rate.allowed) {
    return rateLimitError({ retryAfterMs: rate.retryAfterMs, requestId });
  }

  return jsonOk({ policy: await getOrCreateSessionPolicy(orgId) }, withRequestId(requestId));
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
    feature: "sso",
    requestId
  });
  if (featureError) {
    return featureError;
  }

  const parsed = policySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return jsonError(parsed.error.message, 422, withRequestId(requestId));
  }

  const rate = await checkRateLimit({
    key: `${session.organizationId}:${session.userId}:security_session_policy_write`,
    windowMs: 60_000,
    maxRequests: 30
  });
  if (!rate.allowed) {
    return rateLimitError({ retryAfterMs: rate.retryAfterMs, requestId });
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

  const policy = await updateSessionPolicy({
    organizationId: orgId,
    sessionMaxAgeMinutes: parsed.data.sessionMaxAgeMinutes,
    sessionIdleTimeoutMinutes: parsed.data.sessionIdleTimeoutMinutes,
    concurrentSessionLimit: parsed.data.concurrentSessionLimit,
    forceReauthAfterMinutes: parsed.data.forceReauthAfterMinutes,
    createdBy: session.userId
  });

  const revokedSessions = parsed.data.forceRevokeAll ? await revokeOrganizationSessions(orgId, session.userId) : 0;

  await writeAuditEvent({
    organizationId: orgId,
    actorId: session.userId,
    eventType: "security.session_policy.updated",
    entityType: "org_security_policies",
    entityId: orgId,
    payload: {
      sessionMaxAgeMinutes: policy.sessionMaxAgeMinutes,
      sessionIdleTimeoutMinutes: policy.sessionIdleTimeoutMinutes,
      concurrentSessionLimit: policy.concurrentSessionLimit,
      forceReauthAfterMinutes: policy.forceReauthAfterMinutes,
      revokedSessions
    }
  });

  const responsePayload = { policy, revokedSessions };
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
