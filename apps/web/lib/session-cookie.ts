import { createHmac, timingSafeEqual } from "node:crypto";
import type { AuthIntent, SessionEnvelope } from "@internalwiki/core";
import { normalizeNextPath } from "@/lib/auth-next";

const DEFAULT_DEV_SIGNING_KEY = "internalwiki-dev-session-signing-key-change-me";
const VERSION = 1 as const;

type SignedCookiePayload = {
  exp: number;
  v: 1;
};

type AuthContextEnvelope = SignedCookiePayload & {
  intent: AuthIntent;
  next: string;
  inviteCode?: string;
  nonce?: string;
};

function getSigningKey(): string {
  const configured = process.env.INTERNALWIKI_SESSION_SIGNING_KEY;
  if (configured && configured.trim().length >= 16) {
    return configured;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "INTERNALWIKI_SESSION_SIGNING_KEY must be configured in production (minimum 16 characters recommended)."
    );
  }

  return DEFAULT_DEV_SIGNING_KEY;
}

function hmac(payload: string): string {
  return createHmac("sha256", getSigningKey()).update(payload).digest("base64url");
}

function sealPayload(payload: SignedCookiePayload & Record<string, unknown>): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = hmac(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function unsealPayload<T extends SignedCookiePayload>(raw: string | undefined): T | null {
  if (!raw) {
    return null;
  }

  const [encodedPayload, encodedSignature] = raw.split(".");
  if (!encodedPayload || !encodedSignature) {
    return null;
  }

  const expected = hmac(encodedPayload);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(encodedSignature);
  if (expectedBuffer.length !== actualBuffer.length) {
    return null;
  }

  if (!timingSafeEqual(expectedBuffer, actualBuffer)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as T;
    if (parsed.v !== VERSION || typeof parsed.exp !== "number") {
      return null;
    }
    if (Math.floor(Date.now() / 1000) >= parsed.exp) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function createSessionCookieValue(input: { sessionId: string; maxAgeSeconds?: number }): {
  value: string;
  expiresAtSeconds: number;
} {
  const maxAgeSeconds = input.maxAgeSeconds ?? 60 * 60 * 24 * 30;
  const expiresAtSeconds = Math.floor(Date.now() / 1000) + maxAgeSeconds;
  const payload: SessionEnvelope = {
    sid: input.sessionId,
    exp: expiresAtSeconds,
    v: VERSION
  };

  return {
    value: sealPayload(payload),
    expiresAtSeconds
  };
}

export function parseSessionCookieValue(raw: string | undefined): SessionEnvelope | null {
  const payload = unsealPayload<SessionEnvelope>(raw);
  if (!payload || typeof payload.sid !== "string" || payload.sid.length < 8) {
    return null;
  }
  return payload;
}

export function createAuthContextCookieValue(input: {
  intent: AuthIntent;
  next: string;
  inviteCode?: string;
  nonce?: string;
  maxAgeSeconds?: number;
}): { value: string; expiresAtSeconds: number } {
  const maxAgeSeconds = input.maxAgeSeconds ?? 60 * 10;
  const expiresAtSeconds = Math.floor(Date.now() / 1000) + maxAgeSeconds;
  const payload: AuthContextEnvelope = {
    intent: input.intent,
    next: normalizeNextPath(input.next),
    inviteCode: input.inviteCode?.trim() || undefined,
    nonce: input.nonce?.trim() || undefined,
    exp: expiresAtSeconds,
    v: VERSION
  };

  return {
    value: sealPayload(payload),
    expiresAtSeconds
  };
}

export function parseAuthContextCookieValue(raw: string | undefined): {
  intent: AuthIntent;
  next: string;
  inviteCode?: string;
  nonce?: string;
} | null {
  const payload = unsealPayload<AuthContextEnvelope>(raw);
  if (!payload) {
    return null;
  }

  return {
    intent: payload.intent,
    next: normalizeNextPath(payload.next),
    inviteCode: payload.inviteCode?.trim() || undefined,
    nonce: payload.nonce?.trim() || undefined
  };
}
