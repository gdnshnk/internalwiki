import { getChatThread } from "@internalwiki/db";
import { jsonError, jsonOk } from "@/lib/api";
import { assertScopedOrgAccess } from "@/lib/organization";
import { getSessionContext } from "@/lib/session";

export async function GET(
  _request: Request,
  context: { params: Promise<{ orgId: string; threadId: string }> }
): Promise<Response> {
  const { orgId, threadId } = await context.params;
  const session = await getSessionContext();

  try {
    assertScopedOrgAccess({ session, targetOrgId: orgId, minimumRole: "viewer" });
  } catch (error) {
    return jsonError((error as Error).message, 403);
  }

  const thread = await getChatThread(orgId, threadId);
  if (!thread) {
    return jsonError("Thread not found", 404);
  }

  return jsonOk(thread);
}
