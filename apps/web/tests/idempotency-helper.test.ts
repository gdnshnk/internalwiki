import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getIdempotencyKeyRecordMock, createIdempotencyKeyRecordMock } = vi.hoisted(() => ({
  getIdempotencyKeyRecordMock: vi.fn(),
  createIdempotencyKeyRecordMock: vi.fn()
}));

vi.mock("@internalwiki/db", () => ({
  getIdempotencyKeyRecord: getIdempotencyKeyRecordMock,
  createIdempotencyKeyRecord: createIdempotencyKeyRecordMock,
  finalizeIdempotencyKeyRecord: vi.fn()
}));

import { beginIdempotentMutation } from "@/lib/idempotency";

describe("beginIdempotentMutation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("proceeds without idempotency key when header is absent", async () => {
    const result = await beginIdempotentMutation({
      request: new Request("http://localhost/api/orgs/org_1/security/session-policies", {
        method: "POST"
      }),
      requestId: "req_1",
      organizationId: "org_1",
      payload: { sessionMaxAgeMinutes: 120 }
    });

    expect("keyHash" in result && result.keyHash).toBe(null);
  });

  it("returns replayed response for completed key", async () => {
    getIdempotencyKeyRecordMock.mockResolvedValueOnce({
      requestHash: createHash("sha256").update(JSON.stringify({ a: 1 })).digest("hex"),
      status: 200,
      responseBody: { ok: true, replayed: true },
      responseHeaders: {},
      expiresAt: "2026-03-01T00:00:00.000Z"
    });

    const result = await beginIdempotentMutation({
      request: new Request("http://localhost/api/orgs/org_1/security/session-policies", {
        method: "POST",
        headers: {
          "Idempotency-Key": "idem-1"
        }
      }),
      requestId: "req_2",
      organizationId: "org_1",
      payload: { a: 1 }
    });

    expect("response" in result).toBe(true);
    if ("response" in result) {
      expect(result.response.status).toBe(200);
      expect(await result.response.json()).toEqual({ ok: true, replayed: true });
    }
  });

  it("returns in-progress conflict during concurrent reservation race", async () => {
    const payload = { a: 1 };
    const payloadHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");

    getIdempotencyKeyRecordMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        requestHash: payloadHash,
        status: 202,
        responseBody: undefined,
        responseHeaders: {},
        expiresAt: "2026-03-01T00:00:00.000Z"
      });
    createIdempotencyKeyRecordMock.mockResolvedValueOnce(false);

    const result = await beginIdempotentMutation({
      request: new Request("http://localhost/api/orgs/org_1/security/session-policies", {
        method: "POST",
        headers: {
          "Idempotency-Key": "idem-race"
        }
      }),
      requestId: "req_3",
      organizationId: "org_1",
      payload
    });

    expect("response" in result).toBe(true);
    if ("response" in result) {
      expect(result.response.status).toBe(409);
      expect(await result.response.json()).toMatchObject({
        error: expect.stringContaining("already in progress")
      });
    }
    expect(createIdempotencyKeyRecordMock).toHaveBeenCalledTimes(1);
    expect(getIdempotencyKeyRecordMock).toHaveBeenCalledTimes(2);
  });
});
