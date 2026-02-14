import { z } from "zod";
import {
  createUserSession,
  getOrCreateSessionPolicy,
  getUserAuthByEmail,
  revokeOldestSessionsOverLimit,
  setUserPasswordHash
} from "@internalwiki/db";
import { jsonError, jsonOk, rateLimitError } from "@/lib/api";
import { normalizeNextPath } from "@/lib/auth-next";
import { hashPassword, validatePasswordStrength } from "@/lib/password-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveRequestId, withRequestId } from "@/lib/request-id";
import { registerSelfServeUser } from "@/lib/self-serve-auth";
import { enforceMutationSecurity, requestClientMetadata } from "@/lib/security";
import { createSessionCookieValue } from "@/lib/session-cookie";
import { isWorkEmailAddress, normalizeEmail } from "@/lib/work-email";

const registerSchema = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  email: z.string().email(),
  password: z.string().min(1),
  confirmPassword: z.string().min(1),
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
    key: `auth_password_register:${metadata.ipAddress ?? "unknown"}`,
    windowMs: 60_000,
    maxRequests: 12
  });
  if (!rate.allowed) {
    return rateLimitError({ retryAfterMs: rate.retryAfterMs, requestId });
  }

  const parsed = registerSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return jsonError(parsed.error.message, 422, withRequestId(requestId));
  }

  if (parsed.data.password !== parsed.data.confirmPassword) {
    return jsonError("Password confirmation does not match.", 422, withRequestId(requestId));
  }

  const strengthError = validatePasswordStrength(parsed.data.password);
  if (strengthError) {
    return jsonError(strengthError, 422, withRequestId(requestId));
  }

  const email = normalizeEmail(parsed.data.email);
  if (!isWorkEmailAddress(email)) {
    return jsonError("Use a valid work email address (no personal email providers).", 422, withRequestId(requestId));
  }

  const existingAuth = await getUserAuthByEmail(email);
  if (existingAuth?.passwordHash) {
    return jsonError("An account already exists for this email. Sign in instead.", 409, withRequestId(requestId));
  }

  const displayName = `${parsed.data.firstName.trim()} ${parsed.data.lastName.trim()}`.trim();
  const membership = await registerSelfServeUser({
    email,
    displayName
  });

  const passwordHash = await hashPassword(parsed.data.password);
  await setUserPasswordHash(membership.userId, passwordHash);

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

