import { jsonError } from "@/lib/api";
import { safeError, safeInfo } from "@/lib/safe-log";
import { randomUUID } from "node:crypto";

const MUTATING_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);
const complianceMode = process.env.INTERNALWIKI_COMPLIANCE_MODE === "enforce" ? "enforce" : "audit";
const configuredIpAllowlist = (process.env.INTERNALWIKI_IP_ALLOWLIST_CIDRS ?? "")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);

function parseIpv4(value: string): number | null {
  const parts = value.trim().split(".");
  if (parts.length !== 4) {
    return null;
  }
  const numbers = parts.map((part) => Number(part));
  if (numbers.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  return (
    ((numbers[0] ?? 0) << 24) |
    ((numbers[1] ?? 0) << 16) |
    ((numbers[2] ?? 0) << 8) |
    (numbers[3] ?? 0)
  ) >>> 0;
}

function isIpv4InCidr(ipAddress: string, cidr: string): boolean {
  const [network, prefixPart] = cidr.split("/");
  const ip = parseIpv4(ipAddress);
  const base = network ? parseIpv4(network) : null;
  const prefix = Number(prefixPart);
  if (ip === null || base === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    return false;
  }
  if (prefix === 0) {
    return true;
  }
  const mask = (0xffffffff << (32 - prefix)) >>> 0;
  return (ip & mask) === (base & mask);
}

function isIpAllowedByCidrList(ipAddress: string): boolean {
  return configuredIpAllowlist.some((entry) => {
    if (entry === "*") {
      return true;
    }
    if (entry.includes("/")) {
      return isIpv4InCidr(ipAddress, entry);
    }
    return entry === ipAddress;
  });
}

function getRequestIpAddress(headerStore: Headers): string | null {
  const forwarded = headerStore.get("x-forwarded-for") ?? "";
  const fromForwarded = forwarded
    .split(",")
    .map((entry) => entry.trim())
    .find(Boolean);
  return fromForwarded ?? headerStore.get("x-real-ip");
}

function enforceOptionalIpAllowlist(request: Request, requestId: string): Response | null {
  if (configuredIpAllowlist.length === 0) {
    return null;
  }

  const ipAddress = getRequestIpAddress(request.headers);
  if (!ipAddress || isIpAllowedByCidrList(ipAddress)) {
    return null;
  }

  if (complianceMode === "audit") {
    safeInfo("security.ip_allowlist.audit_violation", {
      requestId,
      path: request.url,
      method: request.method,
      ipAddress
    });
    return null;
  }

  safeError("security.ip_allowlist.denied", {
    requestId,
    path: request.url,
    method: request.method,
    ipAddress
  });
  return jsonError("Client IP is not allowed for this operation", 403, {
    headers: {
      "x-request-id": requestId
    }
  });
}

export function getComplianceMode(): "audit" | "enforce" {
  return complianceMode;
}

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

  const allowlistError = enforceOptionalIpAllowlist(request, requestId);
  if (allowlistError) {
    return allowlistError;
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
