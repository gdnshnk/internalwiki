import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireSessionContextMock,
  assertScopedOrgAccessMock,
  checkRateLimitMock,
  getOrCreateUserMemoryProfileMock,
  listUserMemoryEntriesMock,
  updateUserMemoryProfileMock,
  upsertUserMemoryEntryMock,
  deleteUserMemoryEntryMock,
  clearUserMemoryMock,
  writeAuditEventMock,
  beginIdempotentMutationMock,
  finalizeIdempotentMutationMock
} = vi.hoisted(() => ({
  requireSessionContextMock: vi.fn(),
  assertScopedOrgAccessMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
  getOrCreateUserMemoryProfileMock: vi.fn(),
  listUserMemoryEntriesMock: vi.fn(),
  updateUserMemoryProfileMock: vi.fn(),
  upsertUserMemoryEntryMock: vi.fn(),
  deleteUserMemoryEntryMock: vi.fn(),
  clearUserMemoryMock: vi.fn(),
  writeAuditEventMock: vi.fn(),
  beginIdempotentMutationMock: vi.fn(),
  finalizeIdempotentMutationMock: vi.fn()
}));

vi.mock("@/lib/api-auth", () => ({
  requireSessionContext: requireSessionContextMock
}));

vi.mock("@/lib/organization", () => ({
  assertScopedOrgAccess: assertScopedOrgAccessMock
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: checkRateLimitMock
}));

vi.mock("@/lib/audit", () => ({
  writeAuditEvent: writeAuditEventMock
}));

vi.mock("@/lib/idempotency", () => ({
  beginIdempotentMutation: beginIdempotentMutationMock,
  finalizeIdempotentMutation: finalizeIdempotentMutationMock
}));

vi.mock("@internalwiki/db", () => ({
  getOrCreateUserMemoryProfile: getOrCreateUserMemoryProfileMock,
  listUserMemoryEntries: listUserMemoryEntriesMock,
  updateUserMemoryProfile: updateUserMemoryProfileMock,
  upsertUserMemoryEntry: upsertUserMemoryEntryMock,
  deleteUserMemoryEntry: deleteUserMemoryEntryMock,
  clearUserMemory: clearUserMemoryMock
}));

import {
  DELETE as memoryDelete,
  GET as memoryGet,
  POST as memoryPost
} from "@/app/api/orgs/[orgId]/security/personalization-memory/route";

const session = {
  userId: "user_1",
  email: "owner@company.com",
  organizationId: "org_1",
  role: "owner" as const
};

const memoryProfile = {
  organizationId: "org_1",
  userId: "user_1",
  personalizationEnabled: true,
  profileSummary: "Prefers concise summaries",
  retentionDays: 90,
  policyAcknowledgedAt: "2026-02-14T00:00:00.000Z",
  createdAt: "2026-02-14T00:00:00.000Z",
  updatedAt: "2026-02-14T00:00:00.000Z"
};

const memoryEntries = [
  {
    id: "mem_1",
    organizationId: "org_1",
    userId: "user_1",
    key: "tone",
    value: "direct",
    sensitivity: "low" as const,
    source: "manual" as const,
    createdAt: "2026-02-14T00:00:00.000Z",
    updatedAt: "2026-02-14T00:00:00.000Z"
  }
];

describe("personalization memory route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireSessionContextMock.mockResolvedValue(session);
    assertScopedOrgAccessMock.mockReturnValue(undefined);
    checkRateLimitMock.mockResolvedValue({ allowed: true, retryAfterMs: 0 });
    getOrCreateUserMemoryProfileMock.mockResolvedValue(memoryProfile);
    listUserMemoryEntriesMock.mockResolvedValue(memoryEntries);
    updateUserMemoryProfileMock.mockResolvedValue(memoryProfile);
    upsertUserMemoryEntryMock.mockResolvedValue(memoryEntries[0]);
    deleteUserMemoryEntryMock.mockResolvedValue(true);
    clearUserMemoryMock.mockResolvedValue({
      clearedEntries: 1,
      profileReset: true
    });
    beginIdempotentMutationMock.mockResolvedValue({
      keyHash: "hash_1",
      method: "POST",
      path: "/api/orgs/org_1/security/personalization-memory"
    });
    finalizeIdempotentMutationMock.mockResolvedValue(undefined);
    writeAuditEventMock.mockResolvedValue(undefined);
  });

  it("returns 401 when session is missing", async () => {
    requireSessionContextMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: {
          "content-type": "application/json"
        }
      })
    );

    const response = await memoryGet(new Request("http://localhost/api/orgs/org_1/security/personalization-memory"), {
      params: Promise.resolve({ orgId: "org_1" })
    });

    expect(response.status).toBe(401);
  });

  it("updates profile and entries", async () => {
    const response = await memoryPost(
      new Request("http://localhost/api/orgs/org_1/security/personalization-memory", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost",
          "idempotency-key": "idem-memory-1"
        },
        body: JSON.stringify({
          personalizationEnabled: true,
          upsertEntry: {
            key: "tone",
            value: "direct",
            sensitivity: "low"
          }
        })
      }),
      { params: Promise.resolve({ orgId: "org_1" }) }
    );

    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.profile.personalizationEnabled).toBe(true);
    expect(upsertUserMemoryEntryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org_1",
        userId: "user_1",
        key: "tone"
      })
    );
  });

  it("clears user memory", async () => {
    const response = await memoryDelete(
      new Request("http://localhost/api/orgs/org_1/security/personalization-memory", {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost",
          "idempotency-key": "idem-memory-clear"
        }
      }),
      { params: Promise.resolve({ orgId: "org_1" }) }
    );

    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(clearUserMemoryMock).toHaveBeenCalledWith({ organizationId: "org_1", userId: "user_1" });
  });
});
