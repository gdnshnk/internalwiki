import { jsonError, jsonOk } from "@/lib/api";
import { assertScopedOrgAccess } from "@/lib/organization";
import { getSessionContext } from "@/lib/session";
import { getConnectorSyncRun } from "@internalwiki/db";

export async function GET(
  _request: Request,
  context: { params: Promise<{ orgId: string; connectorId: string; runId: string }> }
): Promise<Response> {
  const { orgId, connectorId, runId } = await context.params;
  const session = await getSessionContext();

  try {
    assertScopedOrgAccess({ session, targetOrgId: orgId, minimumRole: "viewer" });
  } catch (error) {
    return jsonError((error as Error).message, 403);
  }

  const run = await getConnectorSyncRun(orgId, connectorId, runId);
  if (!run) {
    return jsonError("Sync run not found", 404);
  }

  return jsonOk({ run });
}
