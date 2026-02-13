import { z } from "zod";
import { addOrganizationDomain, listOrganizationDomains } from "@internalwiki/db";
import { jsonError, jsonOk, rateLimitError } from "@/lib/api";
import { requireSessionContext } from "@/lib/api-auth";
import { writeAuditEvent } from "@/lib/audit";
import { assertScopedOrgAccess } from "@/lib/organization";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveRequestId, withRequestId } from "@/lib/request-id";
import { enforceMutationSecurity } from "@/lib/security";

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

  const parsed = createDomainSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return jsonError(parsed.error.message, 422, withRequestId(requestId));
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

  return jsonOk({ domain }, withRequestId(requestId));
}
