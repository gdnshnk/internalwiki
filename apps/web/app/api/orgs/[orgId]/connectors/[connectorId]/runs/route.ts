import { jsonError, jsonOk } from "@/lib/api";
import { assertScopedOrgAccess } from "@/lib/organization";
import { getSessionContext } from "@/lib/session";
import { listConnectorSyncRuns } from "@internalwiki/db";

export async function GET(
  request: Request,
  context: { params: Promise<{ orgId: string; connectorId: string }> }
): Promise<Response> {
  const { orgId, connectorId } = await context.params;
  const session = await getSessionContext();

  try {
    assertScopedOrgAccess({ session, targetOrgId: orgId, minimumRole: "viewer" });
  } catch (error) {
    return jsonError((error as Error).message, 403);
  }

  const url = new URL(request.url);
  const limitRaw = Number(url.searchParams.get("limit") ?? "20");
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, limitRaw)) : 20;

  const runs = await listConnectorSyncRuns(orgId, connectorId, limit);
  return jsonOk({ runs });
}
