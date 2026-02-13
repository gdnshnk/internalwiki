import { listReviewQueue } from "@internalwiki/db";
import { jsonError, jsonOk } from "@/lib/api";
import { assertScopedOrgAccess } from "@/lib/organization";
import { getSessionContext } from "@/lib/session";

export async function GET(
  _request: Request,
  context: { params: Promise<{ orgId: string }> }
): Promise<Response> {
  const { orgId } = await context.params;
  const session = await getSessionContext();

  try {
    assertScopedOrgAccess({ session, targetOrgId: orgId, minimumRole: "editor" });
  } catch (error) {
    return jsonError((error as Error).message, 403);
  }

  const items = await listReviewQueue(orgId);

  return jsonOk({ items });
}
