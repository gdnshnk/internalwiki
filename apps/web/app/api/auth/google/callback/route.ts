import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { AuthErrorCode, AuthIntent } from "@internalwiki/core";
import {
  consumeRegistrationInvite,
  createConnectorAccount,
  createMembership,
  createOrUpdateUser,
  createUserSession,
  getOrCreateSessionPolicy,
  getUserByEmail,
  getRegistrationInviteByCode,
  listConnectorAccounts,
  listOrganizationDomains,
  revokeOldestSessionsOverLimit,
  resolveMembership,
  updateConnectorAccount
} from "@internalwiki/db";
import { jsonError, jsonOk, rateLimitError } from "@/lib/api";
import { normalizeNextPath } from "@/lib/auth-next";
import { encryptSecret } from "@/lib/crypto";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveRequestId, withRequestId } from "@/lib/request-id";
import { safeError, safeInfo } from "@/lib/safe-log";
import { requestClientMetadata } from "@/lib/security";
import { createSessionCookieValue, parseAuthContextCookieValue } from "@/lib/session-cookie";

type GoogleTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  id_token?: string;
  error?: string;
  error_description?: string;
};

type GoogleIdTokenPayload = {
  iss: string;
  aud: string | string[];
  exp: number;
  iat?: number;
  nonce?: string;
  sub: string;
  email: string;
  name?: string;
  hd?: string;
};

type GoogleJwk = {
  kty: string;
  kid: string;
  n: string;
  e: string;
  alg?: string;
  use?: string;
};

type GoogleJwksResponse = {
  keys: GoogleJwk[];
};

let cachedGoogleJwks: { keys: GoogleJwk[]; expiresAt: number } | null = null;

function parseCacheMaxAgeSeconds(cacheControl: string | null): number {
  if (!cacheControl) {
    return 300;
  }
  const match = cacheControl.match(/max-age=(\d+)/i);
  return match ? Number(match[1]) : 300;
}

async function getGoogleJwks(): Promise<GoogleJwk[]> {
  if (cachedGoogleJwks && cachedGoogleJwks.expiresAt > Date.now()) {
    return cachedGoogleJwks.keys;
  }

  const response = await fetch("https://www.googleapis.com/oauth2/v3/certs", {
    method: "GET"
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch Google JWKS (${response.status})`);
  }

  const payload = (await response.json()) as GoogleJwksResponse;
  if (!Array.isArray(payload.keys) || payload.keys.length === 0) {
    throw new Error("Google JWKS payload was empty");
  }

  const maxAgeSeconds = parseCacheMaxAgeSeconds(response.headers.get("cache-control"));
  cachedGoogleJwks = {
    keys: payload.keys,
    expiresAt: Date.now() + maxAgeSeconds * 1000
  };
  return payload.keys;
}

function decodeJwtPart<T>(value: string): T {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
}

async function verifyGoogleIdToken(input: {
  idToken: string;
  clientId: string;
  expectedNonce?: string;
}): Promise<GoogleIdTokenPayload> {
  const parts = input.idToken.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid id_token format");
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeJwtPart<{ alg: string; kid?: string }>(encodedHeader);
  if (header.alg !== "RS256" || !header.kid) {
    throw new Error("Unsupported id_token algorithm");
  }

  const jwks = await getGoogleJwks();
  const jwk = jwks.find((key) => key.kid === header.kid && key.kty === "RSA");
  if (!jwk) {
    throw new Error("Unable to find signing key for id_token");
  }

  const cryptoKey = await globalThis.crypto.subtle.importKey(
    "jwk",
    {
      kty: "RSA",
      n: jwk.n,
      e: jwk.e,
      alg: "RS256",
      ext: true
    },
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256"
    },
    false,
    ["verify"]
  );

  const signature = Buffer.from(encodedSignature, "base64url");
  const message = Buffer.from(`${encodedHeader}.${encodedPayload}`);
  const valid = await globalThis.crypto.subtle.verify("RSASSA-PKCS1-v1_5", cryptoKey, signature, message);
  if (!valid) {
    throw new Error("id_token signature verification failed");
  }

  const payload = decodeJwtPart<GoogleIdTokenPayload>(encodedPayload);
  const allowedIssuers = new Set(["https://accounts.google.com", "accounts.google.com"]);
  if (!allowedIssuers.has(payload.iss)) {
    throw new Error("id_token issuer is invalid");
  }

  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes(input.clientId)) {
    throw new Error("id_token audience mismatch");
  }

  if (!payload.exp || Date.now() >= payload.exp * 1000) {
    throw new Error("id_token is expired");
  }

  if (input.expectedNonce && payload.nonce !== input.expectedNonce) {
    throw new Error("id_token nonce mismatch");
  }

  if (!payload.sub || !payload.email) {
    throw new Error("Missing required claims in id_token");
  }

  return payload;
}

function prefersJson(request: NextRequest): boolean {
  const acceptHeader = request.headers.get("accept") ?? "";
  return acceptHeader.includes("application/json") && !acceptHeader.includes("text/html");
}

function clearOAuthCookies(response: NextResponse): void {
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0
  };
  response.cookies.set("google_oauth_state", "", cookieOptions);
  response.cookies.set("iw_auth_ctx", "", cookieOptions);
}

function loginErrorRedirect(
  request: NextRequest,
  input: {
    error: AuthErrorCode;
    nextPath?: string;
    intent?: AuthIntent;
    requestId?: string;
  }
): NextResponse {
  const loginUrl = new URL("/auth/login", request.nextUrl.origin);
  loginUrl.searchParams.set("next", normalizeNextPath(input.nextPath ?? "/app"));
  loginUrl.searchParams.set("error", input.error);
  if (input.intent) {
    loginUrl.searchParams.set("intent", input.intent);
  }
  const response = NextResponse.redirect(loginUrl);
  if (input.requestId) {
    response.headers.set("x-request-id", input.requestId);
  }
  clearOAuthCookies(response);
  return response;
}

export async function GET(request: NextRequest): Promise<Response> {
  const requestId = resolveRequestId(request);
  const metadata = requestClientMetadata(request);
  try {
    const rate = await checkRateLimit({
      key: `auth_google_callback:${metadata.ipAddress ?? "unknown"}`,
      windowMs: 60_000,
      maxRequests: 60
    });
    if (!rate.allowed) {
      return rateLimitError({ retryAfterMs: rate.retryAfterMs, requestId });
    }
  } catch (error) {
    safeError("auth.google.callback.rate_limit_unavailable", {
      requestId,
      message: (error as Error).message
    });
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const stateCookie = request.cookies.get("google_oauth_state")?.value;
  const authContextCookie = request.cookies.get("iw_auth_ctx")?.value;
  const authContext = parseAuthContextCookieValue(authContextCookie);

  const nextPath = normalizeNextPath(authContext?.next ?? "/app");
  const intent = authContext?.intent ?? "login";

  if (!code) {
    return jsonError("Missing OAuth code", 400, withRequestId(requestId));
  }

  if (!state || !stateCookie || state !== stateCookie) {
    if (prefersJson(request)) {
      return jsonError("OAuth state verification failed", 400, withRequestId(requestId));
    }
    return loginErrorRedirect(request, { error: "no_account", nextPath, intent, requestId });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI ?? "http://localhost:3000/api/auth/google/callback";

  if (!clientId || !clientSecret) {
    return jsonError("Google OAuth is not configured", 500, withRequestId(requestId));
  }

  const tokenBody = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code"
  });

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: tokenBody
  });

  const tokenPayload = (await tokenResponse.json()) as GoogleTokenResponse;

  if (!tokenResponse.ok || tokenPayload.error) {
    safeError("google.oauth.token_exchange_failed", {
      requestId,
      status: tokenResponse.status,
      error: tokenPayload.error ?? "unknown",
      errorDescription: tokenPayload.error_description
    });
    return jsonError("Failed to exchange OAuth code for token", 502, withRequestId(requestId));
  }

  if (!tokenPayload.id_token || !tokenPayload.access_token) {
    return jsonError("OAuth response missing required tokens", 502, withRequestId(requestId));
  }

  let idClaims: GoogleIdTokenPayload;
  try {
    idClaims = await verifyGoogleIdToken({
      idToken: tokenPayload.id_token,
      clientId,
      expectedNonce: authContext?.nonce
    });
  } catch (error) {
    safeError("google.oauth.id_token_invalid", {
      requestId,
      message: (error as Error).message
    });
    if (prefersJson(request)) {
      return jsonError(`Invalid id_token: ${(error as Error).message}`, 400, withRequestId(requestId));
    }
    return loginErrorRedirect(request, { error: "no_account", nextPath, intent, requestId });
  }

  const email = idClaims.email.trim().toLowerCase();
  const emailDomain = email.split("@")[1]?.toLowerCase();
  if (!emailDomain) {
    if (prefersJson(request)) {
      return jsonError("Unable to resolve email domain from Google account", 422, withRequestId(requestId));
    }
    return loginErrorRedirect(request, { error: "domain_not_allowed", nextPath, intent, requestId });
  }

  const existingUser = await getUserByEmail(email);
  const userId = existingUser?.id ?? `user_google_${idClaims.sub}`;

  let membership: Awaited<ReturnType<typeof resolveMembership>> | null = null;

  if (intent === "login") {
    membership = await resolveMembership({ email });
    if (!membership) {
      if (prefersJson(request)) {
        return jsonError("No authenticated membership found for this account", 403, withRequestId(requestId));
      }
      return loginErrorRedirect(request, { error: "no_account", nextPath, intent: "login", requestId });
    }
  } else {
    const inviteCode = authContext?.inviteCode;
    if (!inviteCode) {
      if (prefersJson(request)) {
        return jsonError("Invite code is required for registration", 422, withRequestId(requestId));
      }
      return loginErrorRedirect(request, { error: "invalid_invite", nextPath, intent: "register", requestId });
    }

    const invite = await getRegistrationInviteByCode(inviteCode);
    if (!invite || invite.revokedAt || invite.usedAt) {
      if (prefersJson(request)) {
        return jsonError("Invite is invalid or already used", 403, withRequestId(requestId));
      }
      return loginErrorRedirect(request, { error: "invalid_invite", nextPath, intent: "register", requestId });
    }

    if (new Date(invite.expiresAt).getTime() <= Date.now()) {
      if (prefersJson(request)) {
        return jsonError("Invite has expired", 403, withRequestId(requestId));
      }
      return loginErrorRedirect(request, { error: "invite_expired", nextPath, intent: "register", requestId });
    }

    if (invite.email && invite.email.toLowerCase() !== email) {
      if (prefersJson(request)) {
        return jsonError("Invite does not match account email", 403, withRequestId(requestId));
      }
      return loginErrorRedirect(request, { error: "invalid_invite", nextPath, intent: "register", requestId });
    }

    if (invite.domain && invite.domain.toLowerCase() !== emailDomain) {
      if (prefersJson(request)) {
        return jsonError("Invite does not match account domain", 403, withRequestId(requestId));
      }
      return loginErrorRedirect(request, { error: "invalid_invite", nextPath, intent: "register", requestId });
    }

    const domains = await listOrganizationDomains(invite.organizationId);
    const allowed = domains.some((domain) => domain.domain.toLowerCase() === emailDomain);
    if (!allowed) {
      if (prefersJson(request)) {
        return jsonError("Email domain is not allowed for this organization", 403, withRequestId(requestId));
      }
      return loginErrorRedirect(request, { error: "domain_not_allowed", nextPath, intent: "register", requestId });
    }

    const consumed = await consumeRegistrationInvite({
      inviteId: invite.id,
      organizationId: invite.organizationId,
      usedBy: userId
    });
    if (!consumed) {
      if (prefersJson(request)) {
        return jsonError("Invite is no longer valid", 403, withRequestId(requestId));
      }
      return loginErrorRedirect(request, { error: "invalid_invite", nextPath, intent: "register", requestId });
    }

    await createOrUpdateUser({
      id: userId,
      email,
      displayName: idClaims.name
    });
    await createMembership({
      organizationId: invite.organizationId,
      userId,
      role: invite.role,
      createdBy: invite.createdBy ?? userId
    });

    membership = await resolveMembership({
      userId,
      organizationId: invite.organizationId
    });
  }

  if (!membership) {
    if (prefersJson(request)) {
      return jsonError("Unable to resolve membership after authentication", 403, withRequestId(requestId));
    }
    return loginErrorRedirect(request, { error: "no_account", nextPath, intent, requestId });
  }

  const existingConnectors = await listConnectorAccounts(membership.organizationId);
  const existingGoogleConnector = existingConnectors.find((connector) => connector.connectorType === "google_docs");
  const encryptedAccessToken = encryptSecret(tokenPayload.access_token);
  const encryptedRefreshToken = tokenPayload.refresh_token ? encryptSecret(tokenPayload.refresh_token) : undefined;
  const tokenExpiresAt = tokenPayload.expires_in
    ? new Date(Date.now() + tokenPayload.expires_in * 1000).toISOString()
    : undefined;

  if (existingGoogleConnector) {
    await updateConnectorAccount(membership.organizationId, existingGoogleConnector.id, {
      status: "active",
      encryptedAccessToken,
      encryptedRefreshToken,
      tokenExpiresAt
    });
  } else {
    await createConnectorAccount({
      id: randomUUID(),
      organizationId: membership.organizationId,
      connectorType: "google_docs",
      encryptedAccessToken,
      encryptedRefreshToken,
      tokenExpiresAt,
      status: "active",
      displayName: "Google Workspace",
      externalWorkspaceId: idClaims.hd ?? emailDomain,
      createdBy: membership.userId
    });
  }

  const sessionPolicy = await getOrCreateSessionPolicy(membership.organizationId);
  const maxAgeSeconds = Math.max(60 * 5, sessionPolicy.sessionMaxAgeMinutes * 60);
  const userSession = await createUserSession({
    userId: membership.userId,
    organizationId: membership.organizationId,
    expiresAt: new Date(Date.now() + maxAgeSeconds * 1000).toISOString(),
    issuedAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    metadata,
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

  const response = prefersJson(request)
    ? jsonOk(
        {
          message: "OAuth login successful",
          organizationId: membership.organizationId,
          redirectTo: nextPath
        },
        withRequestId(requestId)
      )
    : NextResponse.redirect(new URL(nextPath, request.nextUrl.origin));

  if (!prefersJson(request)) {
    response.headers.set("x-request-id", requestId);
  }

  response.cookies.set("iw_session", sessionCookie.value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds
  });
  clearOAuthCookies(response);

  safeInfo("google.oauth.callback.success", {
    requestId,
    organizationId: membership.organizationId,
    userId: membership.userId,
    intent
  });

  return response;
}
