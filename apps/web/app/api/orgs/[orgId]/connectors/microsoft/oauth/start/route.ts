import { randomUUID } from "node:crypto";
import { z } from "zod";
import { jsonError, jsonOk, rateLimitError } from "@/lib/api";
import { requireSessionContext } from "@/lib/api-auth";
import { normalizeNextPath } from "@/lib/auth-next";
import { assertScopedOrgAccess } from "@/lib/organization";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveRequestId, withRequestId } from "@/lib/request-id";
import { enforceMutationSecurity } from "@/lib/security";

const bodySchema = z.object({
  connectorType: z.enum(["microsoft_teams", "microsoft_sharepoint", "microsoft_onedrive"]),
  next: z.string().optional()
});

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

  const rate = await checkRateLimit({
    key: `${orgId}:${session.userId}:microsoft_oauth_start`,
    windowMs: 60_000,
    maxRequests: 30
  });
  if (!rate.allowed) {
    return rateLimitError({ retryAfterMs: rate.retryAfterMs, requestId });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return jsonError(parsed.error.message, 422, withRequestId(requestId));
  }

  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const redirectUri = process.env.MICROSOFT_OAUTH_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return jsonError("Microsoft OAuth is not configured", 500, withRequestId(requestId));
  }

  const state = randomUUID();
  const next = normalizeNextPath(parsed.data.next ?? "/app/settings/connectors");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    response_mode: "query",
    scope:
      process.env.MICROSOFT_OAUTH_SCOPES ??
      "openid profile offline_access User.Read Files.Read.All Sites.Read.All ChannelMessage.Read.All Chat.Read",
    state
  });

  const response = jsonOk(
    {
      authorizeUrl: `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`
    },
    withRequestId(requestId)
  );
  response.cookies.set(`iw_microsoft_oauth_state_${orgId}`, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10
  });
  response.cookies.set(`iw_microsoft_oauth_next_${orgId}`, next, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10
  });
  response.cookies.set(`iw_microsoft_connector_type_${orgId}`, parsed.data.connectorType, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10
  });

  return response;
}
