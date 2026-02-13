import { jsonError } from "@/lib/api";
import { safeError } from "@/lib/safe-log";
import { randomUUID } from "node:crypto";

const MUTATING_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

export function enforceMutationSecurity(request: Request): Response | null {
  if (!MUTATING_METHODS.has(request.method.toUpperCase())) {
    return null;
  }

  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  const origin = request.headers.get("origin");
  if (!origin) {
    safeError("security.mutation.denied", {
      requestId,
      reason: "missing_origin",
      method: request.method,
      path: request.url
    });
    return jsonError("Missing origin header", 403, {
      headers: {
        "x-request-id": requestId
      }
    });
  }

  let expectedOrigin: string;
  try {
    expectedOrigin = new URL(request.url).origin;
  } catch {
    safeError("security.mutation.denied", {
      requestId,
      reason: "invalid_request_origin",
      method: request.method,
      path: request.url,
      origin
    });
    return jsonError("Invalid request origin", 400, {
      headers: {
        "x-request-id": requestId
      }
    });
  }

  if (origin !== expectedOrigin) {
    safeError("security.mutation.denied", {
      requestId,
      reason: "cross_origin",
      method: request.method,
      path: request.url,
      origin,
      expectedOrigin
    });
    return jsonError("Cross-origin request denied", 403, {
      headers: {
        "x-request-id": requestId
      }
    });
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "same-site" && fetchSite !== "none") {
    safeError("security.mutation.denied", {
      requestId,
      reason: "cross_site",
      method: request.method,
      path: request.url,
      fetchSite
    });
    return jsonError("Cross-site request denied", 403, {
      headers: {
        "x-request-id": requestId
      }
    });
  }

  return null;
}

export function requestClientMetadata(request: Request): Record<string, unknown> {
  return requestClientMetadataFromHeaders(request.headers);
}

export function requestClientMetadataFromHeaders(headerStore: Headers): Record<string, unknown> {
  const forwarded = headerStore.get("x-forwarded-for");
  const ipAddress = forwarded?.split(",")[0]?.trim() || null;
  const userAgent = headerStore.get("user-agent") ?? null;

  return {
    ipAddress,
    userAgent
  };
}
