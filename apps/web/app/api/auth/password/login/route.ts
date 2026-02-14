import { z } from "zod";
import {
  createUserSession,
  getOrCreateSessionPolicy,
  getUserAuthByEmail,
  revokeOldestSessionsOverLimit
} from "@internalwiki/db";
import { jsonError, jsonOk, rateLimitError } from "@/lib/api";
import { normalizeNextPath } from "@/lib/auth-next";
import { verifyPassword } from "@/lib/password-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveRequestId, withRequestId } from "@/lib/request-id";
import { resolveUserMembershipByEmail } from "@/lib/self-serve-auth";
import { enforceMutationSecurity, requestClientMetadata } from "@/lib/security";
import { createSessionCookieValue } from "@/lib/session-cookie";
import { isWorkEmailAddress, normalizeEmail } from "@/lib/work-email";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  next: z.string().optional()
});

export async function POST(request: Request): Promise<Response> {
  const requestId = resolveRequestId(request);
  const securityError = enforceMutationSecurity(request);
  if (securityError) {
    return securityError;
  }

  const metadata = requestClientMetadata(request);
  const rate = await checkRateLimit({
    key: `auth_password_login:${metadata.ipAddress ?? "unknown"}`,
    windowMs: 60_000,
    maxRequests: 25
  });
  if (!rate.allowed) {
    return rateLimitError({ retryAfterMs: rate.retryAfterMs, requestId });
  }

  const parsed = loginSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return jsonError(parsed.error.message, 422, withRequestId(requestId));
  }

  const email = normalizeEmail(parsed.data.email);
  if (!isWorkEmailAddress(email)) {
    return jsonError("Use your work email address.", 422, withRequestId(requestId));
  }

  const userAuth = await getUserAuthByEmail(email);
  if (!userAuth?.passwordHash) {
    return jsonError("Invalid email or password.", 401, withRequestId(requestId));
  }

  const validPassword = await verifyPassword(parsed.data.password, userAuth.passwordHash);
  if (!validPassword) {
    return jsonError("Invalid email or password.", 401, withRequestId(requestId));
  }

  const membership = await resolveUserMembershipByEmail(email);
  if (!membership) {
    return jsonError("No workspace membership found for this account.", 403, withRequestId(requestId));
  }

  const sessionPolicy = await getOrCreateSessionPolicy(membership.organizationId);
  const maxAgeSeconds = Math.max(60 * 5, sessionPolicy.sessionMaxAgeMinutes * 60);
  const userSession = await createUserSession({
    userId: membership.userId,
    organizationId: membership.organizationId,
    expiresAt: new Date(Date.now() + maxAgeSeconds * 1000).toISOString(),
    issuedAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    metadata
  });
  await revokeOldestSessionsOverLimit({
    organizationId: membership.organizationId,
    userId: membership.userId,
    keepLimit: sessionPolicy.concurrentSessionLimit,
    reason: "concurrent_session_limit"
  });

  const sessionCookie = createSessionCookieValue({
    sessionId: userSession.id,
    maxAgeSeconds
  });

  const response = jsonOk(
    {
      ok: true,
      redirectTo: normalizeNextPath(parsed.data.next),
      organizationId: membership.organizationId
    },
    withRequestId(requestId)
  );
  response.cookies.set("iw_session", sessionCookie.value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds
  });

  return response;
}

