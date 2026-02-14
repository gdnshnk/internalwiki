import { NextRequest } from "next/server";
import { revokeUserSession } from "@internalwiki/db";
import { jsonOk, rateLimitError } from "@/lib/api";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveRequestId, withRequestId } from "@/lib/request-id";
import { enforceMutationSecurity, requestClientMetadata } from "@/lib/security";
import { parseSessionCookieValue } from "@/lib/session-cookie";

export async function POST(request: NextRequest): Promise<Response> {
  const requestId = resolveRequestId(request);
  const securityError = enforceMutationSecurity(request);
  if (securityError) {
    return securityError;
  }

  const metadata = requestClientMetadata(request);
  const rate = await checkRateLimit({
    key: `auth_logout:${metadata.ipAddress ?? "unknown"}`,
    windowMs: 60_000,
    maxRequests: 90
  });
  if (!rate.allowed) {
    return rateLimitError({ retryAfterMs: rate.retryAfterMs, requestId });
  }

  const sessionEnvelope = parseSessionCookieValue(request.cookies.get("iw_session")?.value);
  if (sessionEnvelope) {
    await revokeUserSession(sessionEnvelope.sid, "user_logout");
  }

  const response = jsonOk({ ok: true }, withRequestId(requestId));
  response.cookies.set("iw_session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0
  });

  return response;
}
