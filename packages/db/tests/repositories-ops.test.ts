import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryMock } = vi.hoisted(() => ({
  queryMock: vi.fn()
}));

vi.mock("../src/client", () => ({
  query: queryMock,
  queryOrg: vi.fn((_organizationId: string, text: string, params: unknown[] = []) => queryMock(text, params)),
  querySystem: vi.fn((text: string, params: unknown[] = []) => queryMock(text, params)),
  pool: {
    connect: vi.fn()
  }
}));

import {
  checkAndIncrementApiRateLimit,
  createUserSession,
  createIdempotencyKeyRecord,
  getActiveUserSession,
  getConnectorSyncStats,
  getOrgEntitlements,
  getOrganizationBillingUsage,
  getIdempotencyKeyRecord,
  getOrCreateSessionPolicy,
  getOrCreateUserMemoryProfile,
  getPersonalizationMemoryContext,
  listAuditExportJobs,
  listUserMemoryEntries,
  getUserOnboardingCompletedAt,
  markUserOnboardingCompleted,
  getRecentDeadLetterEvents,
  getReviewQueueStats,
  revokeUserSession,
  recordUsageMeterEvent,
  upsertUserMemoryEntry,
  verifyAuditEventIntegrity
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
          issued_at: "2026-02-13T00:00:00.000Z",
          last_seen_at: "2026-02-13T00:00:00.000Z",
          expires_at: "2026-03-13T00:00:00.000Z",
          revoked_at: null,
          revoked_reason: null,
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
          issued_at: "2026-02-13T00:00:00.000Z",
          last_seen_at: "2026-02-13T00:00:00.000Z",
          expires_at: "2026-03-13T00:00:00.000Z",
          revoked_at: null,
          revoked_reason: null,
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

  it("creates and maps user memory profile defaults", async () => {
    queryMock.mockResolvedValueOnce([
      {
        organization_id: "org_1",
        user_id: "user_1",
        personalization_enabled: false,
        profile_summary: null,
        retention_days: 90,
        policy_acknowledged_at: null,
        last_used_at: null,
        created_at: "2026-02-14T00:00:00.000Z",
        updated_at: "2026-02-14T00:00:00.000Z"
      }
    ]);

    const profile = await getOrCreateUserMemoryProfile({
      organizationId: "org_1",
      userId: "user_1",
      createdBy: "user_1"
    });

    expect(profile.personalizationEnabled).toBe(false);
    expect(profile.retentionDays).toBe(90);
  });

  it("upserts memory entry and lists active entries", async () => {
    queryMock
      .mockResolvedValueOnce([
        {
          organization_id: "org_1",
          user_id: "user_1",
          personalization_enabled: true,
          profile_summary: "prefers concise",
          retention_days: 90,
          policy_acknowledged_at: "2026-02-14T00:00:00.000Z",
          last_used_at: null,
          created_at: "2026-02-14T00:00:00.000Z",
          updated_at: "2026-02-14T00:00:00.000Z"
        }
      ])
      .mockResolvedValueOnce([
        {
          id: "mem_1",
          organization_id: "org_1",
          user_id: "user_1",
          memory_key: "tone",
          memory_value: "direct",
          sensitivity: "low",
          source: "manual",
          expires_at: null,
          created_at: "2026-02-14T00:00:00.000Z",
          updated_at: "2026-02-14T00:00:00.000Z"
        }
      ])
      .mockResolvedValueOnce([
        {
          id: "mem_1",
          organization_id: "org_1",
          user_id: "user_1",
          memory_key: "tone",
          memory_value: "direct",
          sensitivity: "low",
          source: "manual",
          expires_at: null,
          created_at: "2026-02-14T00:00:00.000Z",
          updated_at: "2026-02-14T00:00:00.000Z"
        }
      ]);

    const entry = await upsertUserMemoryEntry({
      organizationId: "org_1",
      userId: "user_1",
      key: "tone",
      value: "direct"
    });
    const entries = await listUserMemoryEntries({
      organizationId: "org_1",
      userId: "user_1"
    });

    expect(entry.key).toBe("tone");
    expect(entries[0]?.value).toBe("direct");
  });

  it("returns disabled personalization context when profile opt-in is off", async () => {
    queryMock.mockResolvedValueOnce([
      {
        organization_id: "org_1",
        user_id: "user_1",
        personalization_enabled: false,
        profile_summary: null,
        retention_days: 90,
        policy_acknowledged_at: null,
        last_used_at: null,
        created_at: "2026-02-14T00:00:00.000Z",
        updated_at: "2026-02-14T00:00:00.000Z"
      }
    ]);

    const context = await getPersonalizationMemoryContext({
      organizationId: "org_1",
      userId: "user_1"
    });

    expect(context.enabled).toBe(false);
  });

  it("returns default session policy shape", async () => {
    queryMock.mockResolvedValueOnce([
      {
        organization_id: "org_1",
        session_max_age_minutes: 43200,
        session_idle_timeout_minutes: 1440,
        concurrent_session_limit: 10,
        force_reauth_after_minutes: 10080,
        created_at: "2026-02-14T00:00:00.000Z",
        updated_at: "2026-02-14T00:00:00.000Z"
      }
    ]);

    const policy = await getOrCreateSessionPolicy("org_1");
    expect(policy.concurrentSessionLimit).toBe(10);
    expect(policy.forceReauthAfterMinutes).toBe(10080);
  });

  it("maps audit export jobs list", async () => {
    queryMock.mockResolvedValueOnce([
      {
        id: "export_1",
        organization_id: "org_1",
        requested_by: "user_1",
        status: "completed",
        filters: {},
        rows_exported: 28,
        started_at: "2026-02-14T00:00:00.000Z",
        completed_at: "2026-02-14T00:01:00.000Z",
        download_url: "inline://audit-export/export_1",
        error_message: null,
        created_at: "2026-02-14T00:00:00.000Z",
        updated_at: "2026-02-14T00:01:00.000Z"
      }
    ]);

    const jobs = await listAuditExportJobs("org_1", 5);
    expect(jobs[0]?.rowsExported).toBe(28);
    expect(jobs[0]?.status).toBe("completed");
  });

  it("does not bill reader-only seats", async () => {
    queryMock
      .mockResolvedValueOnce([
        {
          id: "bill_1",
          organization_id: "org_1",
          plan_tier: "pro",
          overage_enabled: true,
          hard_cap_credits: null,
          created_at: "2026-02-14T00:00:00.000Z",
          updated_at: "2026-02-14T00:00:00.000Z"
        }
      ])
      .mockResolvedValueOnce([
        {
          admin_count: 1,
          creator_count: 2,
          reader_count: 17,
          total_count: 20
        }
      ]);

    const entitlements = await getOrgEntitlements("org_1");

    expect(entitlements.billableSeats.total).toBe(3);
    expect(entitlements.readerSeats).toBe(17);
    expect(entitlements.limits.includedCreditsMonthly).toBe(750);
  });

  it("forces blocked usage events to zero credits", async () => {
    queryMock.mockResolvedValue([]);

    await recordUsageMeterEvent({
      orgId: "org_1",
      type: "summary_delivered",
      credits: 1
    });
    await recordUsageMeterEvent({
      orgId: "org_1",
      type: "summary_blocked",
      credits: 1
    });

    const deliveredArgs = queryMock.mock.calls[0]?.[1] as unknown[];
    const blockedArgs = queryMock.mock.calls[1]?.[1] as unknown[];
    expect(deliveredArgs[3]).toBe(1);
    expect(blockedArgs[3]).toBe(0);
  });

  it("computes monthly usage with included credits and blocked counters", async () => {
    queryMock
      .mockResolvedValueOnce([
        {
          id: "bill_1",
          organization_id: "org_1",
          plan_tier: "free",
          overage_enabled: true,
          hard_cap_credits: null,
          created_at: "2026-02-14T00:00:00.000Z",
          updated_at: "2026-02-14T00:00:00.000Z"
        }
      ])
      .mockResolvedValueOnce([
        {
          admin_count: 1,
          creator_count: 1,
          reader_count: 8,
          total_count: 10
        }
      ])
      .mockResolvedValueOnce([
        {
          delivered_count: 12,
          blocked_count: 5,
          delivered_credits: "12"
        }
      ]);

    const usage = await getOrganizationBillingUsage({
      organizationId: "org_1",
      periodStart: "2026-02-01T00:00:00.000Z",
      periodEnd: "2026-03-01T00:00:00.000Z"
    });

    expect(usage.credits.included).toBe(100);
    expect(usage.credits.consumed).toBe(12);
    expect(usage.credits.blockedResponseCount).toBe(5);
    expect(usage.credits.blockedResponsesCharged).toBe(0);
  });

  it("validates audit hash chain integrity", async () => {
    queryMock.mockResolvedValueOnce([
      {
        id: "event_a",
        actor_id: "user_1",
        event_type: "security.session_policy.updated",
        entity_type: "org_security_policies",
        entity_id: "org_1",
        payload: { concurrentSessionLimit: 10 },
        prev_hash: null,
        event_hash: "38d55ca706cfe566042023fcb8aee302f84d63d7d363ca6aa8d3dc7ca2e66787"
      }
    ]);

    const result = await verifyAuditEventIntegrity({ organizationId: "org_1", limit: 50 });
    expect(result.valid).toBe(true);
    expect(result.checked).toBe(1);
  });

  it("returns idempotency key replay metadata", async () => {
    queryMock.mockResolvedValueOnce([
      {
        id: "idem_1",
        organization_id: "org_1",
        method: "POST",
        path: "/api/orgs/org_1/security/session-policies",
        key_hash: "abc",
        request_hash: "def",
        status: 200,
        response_body: { ok: true },
        response_headers: { "x-request-id": "r1" },
        expires_at: "2026-02-15T00:00:00.000Z",
        created_at: "2026-02-14T00:00:00.000Z",
        updated_at: "2026-02-14T00:00:01.000Z"
      }
    ]);

    const replay = await getIdempotencyKeyRecord({
      organizationId: "org_1",
      method: "POST",
      path: "/api/orgs/org_1/security/session-policies",
      keyHash: "abc"
    });

    expect(replay?.status).toBe(200);
    expect(replay?.requestHash).toBe("def");
  });

  it("reports whether an idempotency reservation was inserted", async () => {
    queryMock.mockResolvedValueOnce([{ id: "idem_1" }]).mockResolvedValueOnce([]);

    const inserted = await createIdempotencyKeyRecord({
      organizationId: "org_1",
      method: "POST",
      path: "/api/orgs/org_1/security/session-policies",
      keyHash: "abc",
      requestHash: "def",
      createdBy: "user_1"
    });

    const deduped = await createIdempotencyKeyRecord({
      organizationId: "org_1",
      method: "POST",
      path: "/api/orgs/org_1/security/session-policies",
      keyHash: "abc",
      requestHash: "def",
      createdBy: "user_1"
    });

    expect(inserted).toBe(true);
    expect(deduped).toBe(false);
  });
});
