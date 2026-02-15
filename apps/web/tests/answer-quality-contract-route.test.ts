import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireSessionContextMock,
  assertScopedOrgAccessMock,
  checkRateLimitMock,
  getAnswerQualityContractSummaryMock
} = vi.hoisted(() => ({
  requireSessionContextMock: vi.fn(),
  assertScopedOrgAccessMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
  getAnswerQualityContractSummaryMock: vi.fn()
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

vi.mock("@internalwiki/db", () => ({
  getAnswerQualityContractSummary: getAnswerQualityContractSummaryMock
}));

import { GET as answerQualityContractGet } from "@/app/api/orgs/[orgId]/answer-quality/contract/route";

const session = {
  userId: "user_1",
  email: "admin@company.com",
  organizationId: "org_1",
  role: "admin" as const
};

describe("answer quality contract route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireSessionContextMock.mockResolvedValue(session);
    assertScopedOrgAccessMock.mockReturnValue(undefined);
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

    const response = await answerQualityContractGet(
      new Request("http://localhost/api/orgs/org_1/answer-quality/contract"),
      { params: Promise.resolve({ orgId: "org_1" }) }
    );

    expect(response.status).toBe(401);
  });

  it("returns 403 when scoped org access is denied", async () => {
    assertScopedOrgAccessMock.mockImplementationOnce(() => {
      throw new Error("Forbidden");
    });

    const response = await answerQualityContractGet(
      new Request("http://localhost/api/orgs/org_1/answer-quality/contract"),
      { params: Promise.resolve({ orgId: "org_1" }) }
    );

    expect(response.status).toBe(403);
  });

  it("returns contract summary for authorized requests", async () => {
    getAnswerQualityContractSummaryMock.mockResolvedValueOnce({
      version: "v1",
      policy: {
        groundedness: {
          requireCitations: true,
          minCitationCoverage: 0.8,
          maxUnsupportedClaims: 0
        },
        freshness: {
          windowDays: 30,
          minFreshCitationCoverage: 0.8
        },
        permissionSafety: {
          mode: "fail_closed"
        }
      },
      rolling7d: {
        total: 10,
        blocked: 2,
        passRate: 80,
        groundednessPassRate: 90,
        freshnessPassRate: 80,
        permissionSafetyPassRate: 100
      },
      latest: {
        status: "passed",
        groundednessStatus: "passed",
        freshnessStatus: "passed",
        permissionSafetyStatus: "passed",
        citationCoverage: 0.92,
        unsupportedClaims: 0,
        freshnessCoverage: 0.9,
        staleCitationCount: 0,
        citationCount: 4,
        historicalOverride: false,
        reasons: [],
        createdAt: "2026-02-14T00:00:00.000Z"
      }
    });

    const response = await answerQualityContractGet(
      new Request("http://localhost/api/orgs/org_1/answer-quality/contract"),
      { params: Promise.resolve({ orgId: "org_1" }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.version).toBe("v1");
    expect(payload.rolling7d.passRate).toBe(80);
  });
});
