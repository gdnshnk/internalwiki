import { z } from "zod";
import { addOrganizationDomain, listOrganizationDomains } from "@internalwiki/db";
import { jsonError, jsonOk, rateLimitError } from "@/lib/api";
import { requireSessionContext } from "@/lib/api-auth";
import { writeAuditEvent } from "@/lib/audit";
import { assertScopedOrgAccess } from "@/lib/organization";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveRequestId, withRequestId } from "@/lib/request-id";
import { enforceMutationSecurity } from "@/lib/security";
import { beginIdempotentMutation, finalizeIdempotentMutation } from "@/lib/idempotency";
import { requireBusinessFeature } from "@/lib/billing";

const createDomainSchema = z.object({
  domain: z.string().min(3),
  verified: z.boolean().optional()
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
    feature: "domainInviteControls",
    requestId
  });
  if (featureError) {
    return featureError;
  }

  const rate = await checkRateLimit({
    key: `${session.organizationId}:${session.userId}:security_domain_create`,
    windowMs: 60_000,
    maxRequests: 25
  });
  if (!rate.allowed) {
    return rateLimitError({ retryAfterMs: rate.retryAfterMs, requestId });
  }

  return jsonOk(
    {
      domains: await listOrganizationDomains(orgId)
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

  const parsed = createDomainSchema.safeParse(await request.json().catch(() => ({})));
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

  const domain = await addOrganizationDomain({
    organizationId: orgId,
    domain: parsed.data.domain,
    verifiedAt: parsed.data.verified === false ? undefined : new Date().toISOString(),
    createdBy: session.userId
  });

  await writeAuditEvent({
    organizationId: orgId,
    actorId: session.userId,
    eventType: "security.domain.created",
    entityType: "organization_domain",
    entityId: domain.id,
    payload: {
      domain: domain.domain
    }
  });

  const responsePayload = { domain };
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
