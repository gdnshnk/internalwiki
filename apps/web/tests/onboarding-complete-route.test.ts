import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  enforceMutationSecurityMock,
  requireSessionContextMock,
  listConnectorAccountsMock,
  countDocumentsByOrganizationMock,
  listChatThreadsMock,
  getUserOnboardingCompletedAtMock,
  markUserOnboardingCompletedMock,
  writeAuditEventMock,
  checkRateLimitMock
} = vi.hoisted(() => ({
  enforceMutationSecurityMock: vi.fn(),
  requireSessionContextMock: vi.fn(),
  listConnectorAccountsMock: vi.fn(),
  countDocumentsByOrganizationMock: vi.fn(),
  listChatThreadsMock: vi.fn(),
  getUserOnboardingCompletedAtMock: vi.fn(),
  markUserOnboardingCompletedMock: vi.fn(),
  writeAuditEventMock: vi.fn(),
  checkRateLimitMock: vi.fn()
}));

vi.mock("@/lib/security", () => ({
  enforceMutationSecurity: enforceMutationSecurityMock
}));

vi.mock("@/lib/api-auth", () => ({
  requireSessionContext: requireSessionContextMock
}));

vi.mock("@/lib/audit", () => ({
  writeAuditEvent: writeAuditEventMock
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: checkRateLimitMock
}));

vi.mock("@internalwiki/db", () => ({
  listConnectorAccounts: listConnectorAccountsMock,
  countDocumentsByOrganization: countDocumentsByOrganizationMock,
  listChatThreads: listChatThreadsMock,
  getUserOnboardingCompletedAt: getUserOnboardingCompletedAtMock,
  markUserOnboardingCompleted: markUserOnboardingCompletedMock
}));

import { POST as onboardingCompletePost } from "@/app/api/onboarding/complete/route";

const session = {
  userId: "user_1",
  email: "owner@company.com",
  organizationId: "org_1",
  role: "owner" as const
};

describe("onboarding completion route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enforceMutationSecurityMock.mockReturnValue(null);
    checkRateLimitMock.mockResolvedValue({ allowed: true, retryAfterMs: 0 });
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

    const response = await onboardingCompletePost(
      new Request("http://localhost/api/onboarding/complete", {
        method: "POST",
        headers: {
          origin: "http://localhost",
          "content-type": "application/json"
        }
      })
    );

    expect(response.status).toBe(401);
    expect(markUserOnboardingCompletedMock).not.toHaveBeenCalled();
  });

  it("returns completed false when checklist is incomplete", async () => {
    requireSessionContextMock.mockResolvedValueOnce(session);
    listConnectorAccountsMock.mockResolvedValueOnce([]);
    countDocumentsByOrganizationMock.mockResolvedValueOnce(0);
    listChatThreadsMock.mockResolvedValueOnce([]);
    getUserOnboardingCompletedAtMock.mockResolvedValueOnce(undefined);

    const response = await onboardingCompletePost(
      new Request("http://localhost/api/onboarding/complete", {
        method: "POST",
        headers: {
          origin: "http://localhost",
          "content-type": "application/json"
        }
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      ok: true,
      completed: false,
      progress: {
        connected: false,
        synced: false,
        askedFirstQuestion: false
      }
    });
    expect(markUserOnboardingCompletedMock).not.toHaveBeenCalled();
    expect(writeAuditEventMock).not.toHaveBeenCalled();
  });

  it("marks onboarding complete and writes audit event when all steps are done", async () => {
    requireSessionContextMock.mockResolvedValueOnce(session);
    listConnectorAccountsMock.mockResolvedValueOnce([{ id: "connector_1" }]);
    countDocumentsByOrganizationMock.mockResolvedValueOnce(3);
    listChatThreadsMock.mockResolvedValueOnce([{ id: "thread_1" }]);
    getUserOnboardingCompletedAtMock.mockResolvedValueOnce(undefined);
    markUserOnboardingCompletedMock.mockResolvedValueOnce("2026-02-14T15:00:00.000Z");

    const response = await onboardingCompletePost(
      new Request("http://localhost/api/onboarding/complete", {
        method: "POST",
        headers: {
          origin: "http://localhost",
          "content-type": "application/json"
        }
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.completed).toBe(true);
    expect(markUserOnboardingCompletedMock).toHaveBeenCalledWith("user_1");
    expect(writeAuditEventMock).toHaveBeenCalledTimes(1);
  });

  it("stays idempotent when user is already completed", async () => {
    requireSessionContextMock.mockResolvedValueOnce(session);
    listConnectorAccountsMock.mockResolvedValueOnce([{ id: "connector_1" }]);
    countDocumentsByOrganizationMock.mockResolvedValueOnce(5);
    listChatThreadsMock.mockResolvedValueOnce([{ id: "thread_1" }]);
    getUserOnboardingCompletedAtMock.mockResolvedValueOnce("2026-02-14T15:00:00.000Z");

    const response = await onboardingCompletePost(
      new Request("http://localhost/api/onboarding/complete", {
        method: "POST",
        headers: {
          origin: "http://localhost",
          "content-type": "application/json"
        }
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.completed).toBe(true);
    expect(markUserOnboardingCompletedMock).not.toHaveBeenCalled();
    expect(writeAuditEventMock).not.toHaveBeenCalled();
  });
});
