import {
  countOrganizationAclEntries,
  getAclCoverageByConnector,
  listConnectorAccounts,
  listUserSourceIdentityKeys
} from "@internalwiki/db";
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
    assertScopedOrgAccess({ session, targetOrgId: orgId, minimumRole: "admin" });
  } catch (error) {
    return jsonError((error as Error).message, 403, withRequestId(requestId));
  }

  const rate = await checkRateLimit({
    key: `${session.organizationId}:${session.userId}:permissions_diagnostics`,
    windowMs: 60_000,
    maxRequests: 80
  });
  if (!rate.allowed) {
    return rateLimitError({ retryAfterMs: rate.retryAfterMs, requestId });
  }

  const [connectors, identityKeys, aclEntries, coverage] = await Promise.all([
    listConnectorAccounts(orgId),
    listUserSourceIdentityKeys({ organizationId: orgId, userId: session.userId }),
    countOrganizationAclEntries(orgId),
    getAclCoverageByConnector(orgId)
  ]);

  return jsonOk(
    {
      connectors: connectors.map((connector) => ({
        id: connector.id,
        connectorType: connector.connectorType,
        status: connector.status
      })),
      actor: {
        userId: session.userId,
        identityKeys
      },
      aclEntries,
      coverage
    },
    withRequestId(requestId)
  );
}
