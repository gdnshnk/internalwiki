import { randomUUID } from "node:crypto";

export function resolveRequestId(request: Request): string {
  const inbound = request.headers.get("x-request-id")?.trim();
  if (inbound && inbound.length > 0 && inbound.length <= 128) {
    return inbound;
  }
  return randomUUID();
}

export function withRequestId(requestId: string, init?: ResponseInit): ResponseInit {
  const headers = new Headers(init?.headers);
  headers.set("x-request-id", requestId);
  return {
    ...(init ?? {}),
    headers
  };
}
