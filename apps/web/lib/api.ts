import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

export function jsonOk<T>(data: T, init?: ResponseInit): NextResponse<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("x-request-id")) {
    headers.set("x-request-id", randomUUID());
  }

  return NextResponse.json(data, { status: 200, ...init, headers });
}

export function jsonError(message: string, status = 400, init?: ResponseInit): NextResponse<{ error: string }> {
  return jsonOk({ error: message }, { status, ...(init ?? {}) });
}

export function rateLimitError(input: { retryAfterMs: number; requestId?: string }): NextResponse<{ error: string }> {
  const retryAfterSeconds = Math.max(1, Math.ceil(input.retryAfterMs / 1000));
  const headers = new Headers();
  headers.set("Retry-After", String(retryAfterSeconds));
  if (input.requestId) {
    headers.set("x-request-id", input.requestId);
  }

  return jsonError(`Rate limit exceeded. Retry after ${retryAfterSeconds}s`, 429, {
    headers
  });
}
