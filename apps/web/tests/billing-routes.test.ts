import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireSessionContextMock,
  assertScopedOrgAccessMock,
  checkRateLimitMock,
  getOrgEntitlementsMock,
  getOrgBillingUsageMock,
  requireBusinessFeatureMock,
  getOrCreateSessionPolicyMock,
  getCompliancePostureSummaryMock,
  verifyAuditEventIntegrityMock
} = vi.hoisted(() => ({
  requireSessionContextMock: vi.fn(),
  assertScopedOrgAccessMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
  getOrgEntitlementsMock: vi.fn(),
  getOrgBillingUsageMock: vi.fn(),
  requireBusinessFeatureMock: vi.fn(),
  getOrCreateSessionPolicyMock: vi.fn(),
  getCompliancePostureSummaryMock: vi.fn(),
  verifyAuditEventIntegrityMock: vi.fn()
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

vi.mock("@/lib/billing", () => ({
  getOrgEntitlements: getOrgEntitlementsMock,
  getOrgBillingUsage: getOrgBillingUsageMock,
  requireBusinessFeature: requireBusinessFeatureMock
}));

vi.mock("@internalwiki/db", () => ({
  getOrCreateSessionPolicy: getOrCreateSessionPolicyMock,
  getCompliancePostureSummary: getCompliancePostureSummaryMock,
  verifyAuditEventIntegrity: verifyAuditEventIntegrityMock
}));

vi.mock("@/lib/security", () => ({
  getComplianceMode: vi.fn(() => "audit")
}));

import { GET as billingEntitlementsGet } from "@/app/api/orgs/[orgId]/billing/entitlements/route";
import { GET as billingUsageGet } from "@/app/api/orgs/[orgId]/billing/usage/route";
import { GET as compliancePostureGet } from "@/app/api/orgs/[orgId]/security/compliance/posture/route";

const session = {
  userId: "user_1",
  email: "admin@company.com",
  organizationId: "org_1",
  role: "admin" as const
};

describe("billing routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireSessionContextMock.mockResolvedValue(session);
    assertScopedOrgAccessMock.mockReturnValue(undefined);
    checkRateLimitMock.mockResolvedValue({ allowed: true, retryAfterMs: 0 });
    requireBusinessFeatureMock.mockResolvedValue(null);
  });

  it("returns org billing entitlements", async () => {
    getOrgEntitlementsMock.mockResolvedValueOnce({
      organizationId: "org_1",
      planTier: "pro",
      billableRoles: ["creator", "admin"],
      billableSeats: {
        admin: 1,
        creator: 2,
        total: 3
      },
      readerSeats: 8,
      limits: {
        connectorLimit: null,
        includedCreditsMonthly: 750,
        overageEnabled: true
      },
      features: {
        sso: false,
        scim: false,
        auditExport: false,
        compliancePosture: false,
        domainInviteControls: false,
        advancedPermissionsDiagnostics: false
      }
    });

    const response = await billingEntitlementsGet(new Request("http://localhost/api/orgs/org_1/billing/entitlements"), {
      params: Promise.resolve({ orgId: "org_1" })
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.planTier).toBe("pro");
    expect(payload.billableSeats.total).toBe(3);
  });

  it("returns org billing usage", async () => {
    getOrgBillingUsageMock.mockResolvedValueOnce({
      organizationId: "org_1",
      planTier: "free",
      periodStart: "2026-02-01T00:00:00.000Z",
      periodEnd: "2026-03-01T00:00:00.000Z",
      seats: {
        billable: 2,
        admin: 1,
        creator: 1,
        reader: 4
      },
      credits: {
        included: 100,
        consumed: 12,
        remaining: 88,
        overage: 0,
        overageRateUsdPerCredit: 0.3,
        blockedResponseCount: 5,
        deliveredResponseCount: 12,
        blockedResponsesCharged: 0,
        spendAlerts: {
          at80Percent: false,
          at100Percent: false,
          at120Percent: false
        },
        overageEnabled: true
      }
    });

    const response = await billingUsageGet(
      new Request("http://localhost/api/orgs/org_1/billing/usage?from=2026-02-01T00:00:00.000Z&to=2026-03-01T00:00:00.000Z"),
      {
        params: Promise.resolve({ orgId: "org_1" })
      }
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.credits.consumed).toBe(12);
    expect(getOrgBillingUsageMock).toHaveBeenCalledWith("org_1", {
      from: "2026-02-01T00:00:00.000Z",
      to: "2026-03-01T00:00:00.000Z"
    });
  });

  it("blocks Business-only compliance endpoint on lower tiers", async () => {
    requireBusinessFeatureMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Compliance posture is available on Business and Enterprise plans." }), {
        status: 402,
        headers: {
          "content-type": "application/json"
        }
      })
    );

    const response = await compliancePostureGet(new Request("http://localhost/api/orgs/org_1/security/compliance/posture"), {
      params: Promise.resolve({ orgId: "org_1" })
    });

    expect(response.status).toBe(402);
    expect(getOrCreateSessionPolicyMock).not.toHaveBeenCalled();
  });
});
