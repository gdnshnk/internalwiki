import { z } from "zod";
import { applyReviewAction } from "@internalwiki/db";
import { jsonError, jsonOk } from "@/lib/api";
import { assertScopedOrgAccess } from "@/lib/organization";
import { enforceMutationSecurity } from "@/lib/security";
import { getSessionContext } from "@/lib/session";

const reviewSchema = z.object({
  action: z.enum(["approve", "reject"]),
  reason: z.string().max(500).optional()
});

export async function POST(
  request: Request,
  context: { params: Promise<{ orgId: string; summaryId: string }> }
): Promise<Response> {
  const securityError = enforceMutationSecurity(request);
  if (securityError) {
    return securityError;
  }

  const { orgId, summaryId } = await context.params;
  const session = await getSessionContext();

  try {
    assertScopedOrgAccess({ session, targetOrgId: orgId, minimumRole: "editor" });
  } catch (error) {
    return jsonError((error as Error).message, 403);
  }

  const parsed = reviewSchema.safeParse(await request.json());
  if (!parsed.success) {
    return jsonError(parsed.error.message, 422);
  }

  const item = await applyReviewAction(orgId, summaryId, parsed.data.action);
  if (!item) {
    return jsonError("Summary not found in review queue", 404);
  }

  return jsonOk({ item });
}
