import { getAnswerQualityContractSummary, getLatestVerificationStatus } from "@internalwiki/db";
import { jsonError, jsonOk, rateLimitError } from "@/lib/api";
import { requireSessionContext } from "@/lib/api-auth";
import { assertScopedOrgAccess } from "@/lib/organization";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveRequestId, withRequestId } from "@/lib/request-id";

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
    key: `${session.organizationId}:${session.userId}:verification_status`,
    windowMs: 60_000,
    maxRequests: 120
  });
  if (!rate.allowed) {
    return rateLimitError({ retryAfterMs: rate.retryAfterMs, requestId });
  }

  const [status, contract] = await Promise.all([
    getLatestVerificationStatus(orgId),
    getAnswerQualityContractSummary(orgId)
  ]);
  return jsonOk(
    {
      threshold: {
        citationCoverage: contract.policy.groundedness.minCitationCoverage,
        unsupportedClaims: contract.policy.groundedness.maxUnsupportedClaims
      },
      ...status,
      qualityContract: {
        version: contract.version,
        policy: contract.policy,
        rolling7d: contract.rolling7d,
        latest: contract.latest
      }
    },
    withRequestId(requestId)
  );
}
