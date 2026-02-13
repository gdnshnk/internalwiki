import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AuthStartRequest, AuthStartResponse } from "@internalwiki/core";
import { jsonError, jsonOk, rateLimitError } from "@/lib/api";
import { normalizeNextPath } from "@/lib/auth-next";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveRequestId, withRequestId } from "@/lib/request-id";
import { safeError } from "@/lib/safe-log";
import { createAuthContextCookieValue } from "@/lib/session-cookie";
import { enforceMutationSecurity, requestClientMetadata } from "@/lib/security";

const startSchema = z.object({
  next: z.string().optional(),
  intent: z.enum(["login", "register"]).optional(),
  inviteCode: z.string().min(6).max(128).optional()
});

export async function POST(request: Request): Promise<Response> {
  const requestId = resolveRequestId(request);
  const securityError = enforceMutationSecurity(request);
  if (securityError) {
    return securityError;
  }

  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  const clientId = process.env.GOOGLE_CLIENT_ID;

  if (!redirectUri || !clientId) {
    return jsonError("Google OAuth is not configured", 500, withRequestId(requestId));
  }

  try {
    const metadata = requestClientMetadata(request);
    const rate = await checkRateLimit({
      key: `auth_google_start:${metadata.ipAddress ?? "unknown"}`,
      windowMs: 60_000,
      maxRequests: 30
    });
    if (!rate.allowed) {
      return rateLimitError({ retryAfterMs: rate.retryAfterMs, requestId });
    }
  } catch (error) {
    safeError("auth.google.start.rate_limit_unavailable", {
      requestId,
      message: (error as Error).message
    });
  }

  const parsed = startSchema.safeParse(await request.json().catch(() => ({} as AuthStartRequest)));
  if (!parsed.success) {
    return jsonError(parsed.error.message, 422, withRequestId(requestId));
  }

  const next = normalizeNextPath(parsed.data.next);
  const intent = parsed.data.intent ?? "login";
  if (intent === "register" && !parsed.data.inviteCode) {
    return jsonError("Invite code is required for registration", 422, withRequestId(requestId));
  }

  const stateNonce = randomUUID();
  const oauthNonce = randomUUID();
  const authContext = createAuthContextCookieValue({
    intent,
    next,
    inviteCode: parsed.data.inviteCode,
    nonce: oauthNonce
  });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    scope: [
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/documents.readonly"
    ].join(" "),
    prompt: "consent",
    state: stateNonce,
    nonce: oauthNonce
  });

  const response = jsonOk<AuthStartResponse>(
    {
      authorizeUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
    },
    withRequestId(requestId)
  );

  response.cookies.set("google_oauth_state", stateNonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10
  });
  response.cookies.set("iw_auth_ctx", authContext.value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10
  });

  return response;
}
