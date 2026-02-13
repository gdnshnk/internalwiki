import { jsonError, jsonOk } from "@/lib/api";
import { listDocuments } from "@/lib/demo-data";
import { assertScopedOrgAccess } from "@/lib/organization";
import { getSessionContext } from "@/lib/session";

export async function GET(
  request: Request,
  context: { params: Promise<{ orgId: string }> }
): Promise<Response> {
  const { orgId } = await context.params;
  const session = await getSessionContext();

  try {
    assertScopedOrgAccess({ session, targetOrgId: orgId, minimumRole: "viewer" });
  } catch (error) {
    return jsonError((error as Error).message, 403);
  }

  const url = new URL(request.url);
  const rawMinScore = Number(url.searchParams.get("minScore") ?? "0");
  const minScore = Number.isFinite(rawMinScore) ? rawMinScore : 0;

  let docs = await listDocuments(orgId);
  docs = docs.filter((doc) => (doc.sourceScore?.total ?? 0) >= minScore);

  return jsonOk({ documents: docs });
}
