import {
  getCompliancePostureSummary,
  getOrCreateSessionPolicy,
  verifyAuditEventIntegrity
} from "@internalwiki/db";
import { jsonError, jsonOk, rateLimitError } from "@/lib/api";
import { requireSessionContext } from "@/lib/api-auth";
import { assertScopedOrgAccess } from "@/lib/organization";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveRequestId, withRequestId } from "@/lib/request-id";
import { getComplianceMode } from "@/lib/security";

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
    key: `${session.organizationId}:${session.userId}:security_compliance_posture`,
    windowMs: 60_000,
    maxRequests: 60
  });
  if (!rate.allowed) {
    return rateLimitError({ retryAfterMs: rate.retryAfterMs, requestId });
  }

  const [policy, posture, integrity] = await Promise.all([
    getOrCreateSessionPolicy(orgId),
    getCompliancePostureSummary({ organizationId: orgId }),
    verifyAuditEventIntegrity({ organizationId: orgId, limit: 200 })
  ]);

  return jsonOk(
    {
      organizationId: orgId,
      generatedAt: new Date().toISOString(),
      complianceMode: getComplianceMode(),
      controls: {
        tenantIsolation: {
          status: getComplianceMode() === "enforce" ? "enforced" : "audit_mode"
        },
        sessionPolicy: policy,
        privacy: {
          retentionDays: Number(process.env.INTERNALWIKI_RETENTION_DAYS ?? 90),
          activeLegalHolds: posture.activeLegalHolds,
          pendingPrivacyRequests: posture.pendingPrivacyRequests,
          completedPrivacyRequestsLast30d: posture.completedPrivacyRequestsLast30d
        },
        auditTrail: {
          hashChainValid: integrity.valid,
          eventsChecked: integrity.checked,
          legacyEventsWithoutHash: integrity.legacyEventsWithoutHash
        }
      }
    },
    withRequestId(requestId)
  );
}

