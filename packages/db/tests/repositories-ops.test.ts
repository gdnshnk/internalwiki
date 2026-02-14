import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryMock } = vi.hoisted(() => ({
  queryMock: vi.fn()
}));

vi.mock("../src/client", () => ({
  query: queryMock,
  pool: {
    connect: vi.fn()
  }
}));

import {
  checkAndIncrementApiRateLimit,
  createUserSession,
  getActiveUserSession,
  getConnectorSyncStats,
  getUserOnboardingCompletedAt,
  markUserOnboardingCompleted,
  getRecentDeadLetterEvents,
  getReviewQueueStats,
  revokeUserSession
} from "../src/repositories";

describe("db repositories launch-critical helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calculates retryAfter for exceeded rate-limit buckets", async () => {
    queryMock.mockResolvedValueOnce([
      {
        bucket_key: "bucket:1",
        window_start: "2026-02-13T00:00:10.000Z",
        count: 6
      }
    ]);

    const result = await checkAndIncrementApiRateLimit({
      bucketKey: "bucket:1",
      windowMs: 1000,
      maxRequests: 5,
      nowMs: Date.parse("2026-02-13T00:00:10.250Z")
    });

    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBe(750);
    expect(result.record.count).toBe(6);
  });

  it("supports session create/read/revoke lifecycle", async () => {
    queryMock
      .mockResolvedValueOnce([
        {
          id: "sid_1",
          user_id: "user_1",
          organization_id: "org_1",
          expires_at: "2026-03-13T00:00:00.000Z",
          revoked_at: null,
          metadata: { ipAddress: "127.0.0.1" },
          created_at: "2026-02-13T00:00:00.000Z",
          updated_at: "2026-02-13T00:00:00.000Z"
        }
      ])
      .mockResolvedValueOnce([
        {
          id: "sid_1",
          user_id: "user_1",
          organization_id: "org_1",
          expires_at: "2026-03-13T00:00:00.000Z",
          revoked_at: null,
          metadata: { ipAddress: "127.0.0.1" },
          created_at: "2026-02-13T00:00:00.000Z",
          updated_at: "2026-02-13T00:00:00.000Z"
        }
      ])
      .mockResolvedValueOnce([{ id: "sid_1" }]);

    const created = await createUserSession({
      userId: "user_1",
      organizationId: "org_1",
      expiresAt: "2026-03-13T00:00:00.000Z",
      metadata: { ipAddress: "127.0.0.1" }
    });
    const active = await getActiveUserSession("sid_1");
    const revoked = await revokeUserSession("sid_1");

    expect(created.id).toBe("sid_1");
    expect(active?.userId).toBe("user_1");
    expect(revoked).toBe(true);
    expect(queryMock).toHaveBeenCalledTimes(3);
  });

  it("maps ops summary aggregate queries", async () => {
    queryMock
      .mockResolvedValueOnce([
        {
          total: 12,
          completed: 10,
          failed: 2,
          running: 0,
          transient_failures: 1,
          auth_failures: 1,
          payload_failures: 0,
          unknown_failures: 0
        }
      ])
      .mockResolvedValueOnce([
        {
          total: 55,
          completed: 50,
          failed: 5,
          running: 0,
          transient_failures: 2,
          auth_failures: 2,
          payload_failures: 1,
          unknown_failures: 0
        }
      ])
      .mockResolvedValueOnce([
        {
          total: 18,
          pending: 6,
          approved: 10,
          rejected: 2
        }
      ])
      .mockResolvedValueOnce([
        {
          last_24h: 1,
          last_7d: 4
        }
      ]);

    const sync = await getConnectorSyncStats("org_1");
    const review = await getReviewQueueStats("org_1");
    const deadLetters = await getRecentDeadLetterEvents("org_1");

    expect(sync.last24h.completed).toBe(10);
    expect(sync.last7d.failureByClassification.payload).toBe(1);
    expect(review.pending).toBe(6);
    expect(deadLetters.last7d).toBe(4);
  });

  it("reads onboarding completion timestamp by user id", async () => {
    queryMock.mockResolvedValueOnce([
      {
        onboarding_completed_at: "2026-02-14T16:00:00.000Z"
      }
    ]);

    const result = await getUserOnboardingCompletedAt("user_1");

    expect(result).toBe("2026-02-14T16:00:00.000Z");
  });

  it("marks onboarding completion idempotently", async () => {
    queryMock
      .mockResolvedValueOnce([
        {
          onboarding_completed_at: "2026-02-14T16:00:00.000Z"
        }
      ])
      .mockResolvedValueOnce([
        {
          onboarding_completed_at: "2026-02-14T16:00:00.000Z"
        }
      ]);

    const first = await markUserOnboardingCompleted("user_1");
    const second = await markUserOnboardingCompleted("user_1");

    expect(first).toBe("2026-02-14T16:00:00.000Z");
    expect(second).toBe("2026-02-14T16:00:00.000Z");
  });
});
