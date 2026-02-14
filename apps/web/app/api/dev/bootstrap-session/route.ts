import { z } from "zod";
import {
  addOrganizationDomain,
  createUserSession,
  getOrCreateSessionPolicy,
  listOrganizationDomains,
  revokeOldestSessionsOverLimit,
  upsertGoogleUserAndEnsureMembership
} from "@internalwiki/db";
import { jsonError, jsonOk, rateLimitError } from "@/lib/api";
import { normalizeNextPath } from "@/lib/auth-next";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveRequestId, withRequestId } from "@/lib/request-id";
import { safeInfo } from "@/lib/safe-log";
import { enforceMutationSecurity, requestClientMetadata } from "@/lib/security";
import { createSessionCookieValue } from "@/lib/session-cookie";

const bootstrapSchema = z.object({
  email: z.string().email().optional(),
  organizationSlug: z.string().min(2).optional(),
  organizationName: z.string().min(2).optional(),
  next: z.string().optional()
});

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

export async function POST(request: Request): Promise<Response> {
  const requestId = resolveRequestId(request);
  const securityError = enforceMutationSecurity(request);
  if (securityError) {
    return securityError;
  }

  if (process.env.NODE_ENV === "production") {
    return jsonError("Not found", 404, withRequestId(requestId));
  }

  if (!process.env.DATABASE_URL) {
    return jsonError("DATABASE_URL is required to bootstrap a local session.", 503, withRequestId(requestId));
  }

  const metadata = requestClientMetadata(request);
  const rate = await checkRateLimit({
    key: `auth_dev_bootstrap:${metadata.ipAddress ?? "unknown"}`,
    windowMs: 60_000,
    maxRequests: 20
  });
  if (!rate.allowed) {
    return rateLimitError({ retryAfterMs: rate.retryAfterMs, requestId });
  }

  const parsed = bootstrapSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return jsonError(parsed.error.message, 422, withRequestId(requestId));
  }

  const email = parsed.data.email ?? "dev@internalwiki.local";
  const organizationSlug = slugify(parsed.data.organizationSlug ?? "internalwiki-dev") || "internalwiki-dev";
  const organizationName = parsed.data.organizationName ?? "InternalWiki Dev";
  const nextPath = normalizeNextPath(parsed.data.next ?? "/app");
  const googleSub = `local-${slugify(email)}`;

  const membership = await upsertGoogleUserAndEnsureMembership({
    googleSub,
    email,
    displayName: "Local Dev User",
    organizationSlug,
    organizationName,
    role: "owner"
  });

  const existingDomains = await listOrganizationDomains(membership.organizationId);
  if (existingDomains.length === 0) {
    const emailDomain = email.split("@")[1]?.toLowerCase();
    if (emailDomain) {
      await addOrganizationDomain({
        organizationId: membership.organizationId,
        domain: emailDomain,
        verifiedAt: new Date().toISOString(),
        createdBy: membership.userId
      });
    }
  }

  const sessionPolicy = await getOrCreateSessionPolicy(membership.organizationId);
  const maxAgeSeconds = Math.max(60 * 5, sessionPolicy.sessionMaxAgeMinutes * 60);
  const userSession = await createUserSession({
    userId: membership.userId,
    organizationId: membership.organizationId,
    expiresAt: new Date(Date.now() + maxAgeSeconds * 1000).toISOString(),
    issuedAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    metadata: requestClientMetadata(request),
    createdBy: membership.userId
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
      redirectTo: nextPath,
      organizationId: membership.organizationId
    },
    withRequestId(requestId)
  );
  response.cookies.set("iw_session", sessionCookie.value, {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds
  });

  safeInfo("auth.dev.bootstrap.success", {
    organizationId: membership.organizationId,
    userId: membership.userId
  });

  return response;
}
