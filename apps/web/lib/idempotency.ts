import { createHash } from "node:crypto";
import {
  createIdempotencyKeyRecord,
  finalizeIdempotencyKeyRecord,
  getIdempotencyKeyRecord
} from "@internalwiki/db";
import { jsonError, jsonOk } from "@/lib/api";
import { withRequestId } from "@/lib/request-id";

function hash(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export async function beginIdempotentMutation(input: {
  request: Request;
  requestId: string;
  organizationId: string;
  actorId?: string;
  payload: Record<string, unknown>;
}): Promise<
  | { keyHash: string; method: string; path: string }
  | { response: Response }
  | { keyHash: null; method: string; path: string }
> {
  const method = input.request.method.toUpperCase();
  const path = new URL(input.request.url).pathname;
  const rawKey = input.request.headers.get("Idempotency-Key")?.trim();
  if (!rawKey) {
    return { keyHash: null, method, path };
  }

  const keyHash = hash(rawKey);
  const requestHash = hash(JSON.stringify(input.payload ?? {}));

  const existing = await getIdempotencyKeyRecord({
    organizationId: input.organizationId,
    method,
    path,
    keyHash
  });
  if (existing) {
    if (existing.requestHash !== requestHash) {
      return {
        response: jsonError(
          "Idempotency-Key cannot be reused with a different payload.",
          409,
          withRequestId(input.requestId)
        )
      };
    }

    if (existing.status === 202) {
      return {
        response: jsonError(
          "A request with this Idempotency-Key is already in progress.",
          409,
          withRequestId(input.requestId)
        )
      };
    }

    return {
      response: jsonOk(existing.responseBody ?? { ok: true }, {
        status: existing.status,
        ...withRequestId(input.requestId)
      })
    };
  }

  const created = await createIdempotencyKeyRecord({
    organizationId: input.organizationId,
    method,
    path,
    keyHash,
    requestHash,
    createdBy: input.actorId
  });
  if (!created) {
    const concurrent = await getIdempotencyKeyRecord({
      organizationId: input.organizationId,
      method,
      path,
      keyHash
    });

    if (!concurrent) {
      return {
        response: jsonError(
          "Unable to reserve Idempotency-Key. Retry the request.",
          409,
          withRequestId(input.requestId)
        )
      };
    }

    if (concurrent.requestHash !== requestHash) {
      return {
        response: jsonError(
          "Idempotency-Key cannot be reused with a different payload.",
          409,
          withRequestId(input.requestId)
        )
      };
    }

    if (concurrent.status === 202) {
      return {
        response: jsonError(
          "A request with this Idempotency-Key is already in progress.",
          409,
          withRequestId(input.requestId)
        )
      };
    }

    return {
      response: jsonOk(concurrent.responseBody ?? { ok: true }, {
        status: concurrent.status,
        ...withRequestId(input.requestId)
      })
    };
  }

  return {
    keyHash,
    method,
    path
  };
}

export async function finalizeIdempotentMutation(input: {
  keyHash: string | null;
  organizationId: string;
  method: string;
  path: string;
  status: number;
  responseBody: Record<string, unknown>;
}): Promise<void> {
  if (!input.keyHash) {
    return;
  }

  await finalizeIdempotencyKeyRecord({
    organizationId: input.organizationId,
    method: input.method,
    path: input.path,
    keyHash: input.keyHash,
    status: input.status,
    responseBody: input.responseBody
  });
}
