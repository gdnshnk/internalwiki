import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireSessionContextMock,
  assertScopedOrgAccessMock,
  checkRateLimitMock,
  enforceMutationSecurityMock,
  getSloSummaryMock,
  listIncidentEventsMock,
  getOrCreateSessionPolicyMock,
  updateSessionPolicyMock,
  revokeOrganizationSessionsMock,
  createAuditExportJobMock,
  listAuditExportJobsMock,
  verifyAuditEventIntegrityMock,
  enqueueAuditExportJobMock,
  writeAuditEventMock,
  beginIdempotentMutationMock,
  finalizeIdempotentMutationMock,
  requireBusinessFeatureMock
} = vi.hoisted(() => ({
  requireSessionContextMock: vi.fn(),
  assertScopedOrgAccessMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
  enforceMutationSecurityMock: vi.fn(),
  getSloSummaryMock: vi.fn(),
  listIncidentEventsMock: vi.fn(),
  getOrCreateSessionPolicyMock: vi.fn(),
  updateSessionPolicyMock: vi.fn(),
  revokeOrganizationSessionsMock: vi.fn(),
  createAuditExportJobMock: vi.fn(),
  listAuditExportJobsMock: vi.fn(),
  verifyAuditEventIntegrityMock: vi.fn(),
  enqueueAuditExportJobMock: vi.fn(),
  writeAuditEventMock: vi.fn(),
  beginIdempotentMutationMock: vi.fn(),
  finalizeIdempotentMutationMock: vi.fn(),
  requireBusinessFeatureMock: vi.fn()
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

vi.mock("@/lib/security", () => ({
  enforceMutationSecurity: enforceMutationSecurityMock
}));

vi.mock("@/lib/worker-jobs", () => ({
  enqueueAuditExportJob: enqueueAuditExportJobMock
}));

vi.mock("@/lib/audit", () => ({
  writeAuditEvent: writeAuditEventMock
}));

vi.mock("@/lib/idempotency", () => ({
  beginIdempotentMutation: beginIdempotentMutationMock,
  finalizeIdempotentMutation: finalizeIdempotentMutationMock
}));

vi.mock("@/lib/billing", () => ({
  requireBusinessFeature: requireBusinessFeatureMock
}));

vi.mock("@internalwiki/db", () => ({
  getSloSummary: getSloSummaryMock,
  listIncidentEvents: listIncidentEventsMock,
  getOrCreateSessionPolicy: getOrCreateSessionPolicyMock,
  updateSessionPolicy: updateSessionPolicyMock,
  revokeOrganizationSessions: revokeOrganizationSessionsMock,
  createAuditExportJob: createAuditExportJobMock,
  listAuditExportJobs: listAuditExportJobsMock,
  verifyAuditEventIntegrity: verifyAuditEventIntegrityMock
}));

import { GET as opsSloGet } from "@/app/api/orgs/[orgId]/ops/slo/route";
import { GET as opsIncidentsGet } from "@/app/api/orgs/[orgId]/ops/incidents/route";
import {
  GET as sessionPoliciesGet,
  POST as sessionPoliciesPost
} from "@/app/api/orgs/[orgId]/security/session-policies/route";
import {
  GET as auditExportGet,
  POST as auditExportPost
} from "@/app/api/orgs/[orgId]/security/audit/export/route";

const session = {
  userId: "user_1",
  email: "owner@company.com",
  organizationId: "org_1",
  role: "owner" as const
};

describe("enterprise ops/security route contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireSessionContextMock.mockResolvedValue(session);
    assertScopedOrgAccessMock.mockReturnValue(undefined);
    checkRateLimitMock.mockResolvedValue({ allowed: true, retryAfterMs: 0 });
    enforceMutationSecurityMock.mockReturnValue(null);
    requireBusinessFeatureMock.mockResolvedValue(null);
    beginIdempotentMutationMock.mockResolvedValue({
      keyHash: null,
      method: "POST",
      path: "/api/orgs/org_1/security/session-policies"
    });
    finalizeIdempotentMutationMock.mockResolvedValue(undefined);
  });

  it("returns SLO payload for admin users", async () => {
    getSloSummaryMock.mockResolvedValueOnce({
      organizationId: "org_1",
      generatedAt: "2026-02-14T00:00:00.000Z",
      burnRate: 1.2,
      openIncidentCount: 1,
      metrics: []
    });

    const response = await opsSloGet(new Request("http://localhost/api/orgs/org_1/ops/slo"), {
      params: Promise.resolve({ orgId: "org_1" })
    });

    expect(response.status).toBe(200);
    expect((await response.json()).organizationId).toBe("org_1");
  });

  it("returns 403 for incidents when RBAC denies access", async () => {
    assertScopedOrgAccessMock.mockImplementationOnce(() => {
      throw new Error("Forbidden");
    });

    const response = await opsIncidentsGet(new Request("http://localhost/api/orgs/org_1/ops/incidents"), {
      params: Promise.resolve({ orgId: "org_1" })
    });

    expect(response.status).toBe(403);
  });

  it("reads and updates session policies", async () => {
    getOrCreateSessionPolicyMock.mockResolvedValueOnce({
      organizationId: "org_1",
      sessionMaxAgeMinutes: 43200,
      sessionIdleTimeoutMinutes: 1440,
      concurrentSessionLimit: 10,
      forceReauthAfterMinutes: 10080,
      createdAt: "2026-02-14T00:00:00.000Z",
      updatedAt: "2026-02-14T00:00:00.000Z"
    });
    updateSessionPolicyMock.mockResolvedValueOnce({
      organizationId: "org_1",
      sessionMaxAgeMinutes: 1000,
      sessionIdleTimeoutMinutes: 120,
      concurrentSessionLimit: 3,
      forceReauthAfterMinutes: 500,
      createdAt: "2026-02-14T00:00:00.000Z",
      updatedAt: "2026-02-14T00:01:00.000Z"
    });
    revokeOrganizationSessionsMock.mockResolvedValueOnce(2);

    const getResponse = await sessionPoliciesGet(new Request("http://localhost/api/orgs/org_1/security/session-policies"), {
      params: Promise.resolve({ orgId: "org_1" })
    });
    expect(getResponse.status).toBe(200);

    const postResponse = await sessionPoliciesPost(
      new Request("http://localhost/api/orgs/org_1/security/session-policies", {
        method: "POST",
        headers: {
          origin: "http://localhost",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          sessionMaxAgeMinutes: 1000,
          sessionIdleTimeoutMinutes: 120,
          concurrentSessionLimit: 3,
          forceReauthAfterMinutes: 500,
          forceRevokeAll: true
        })
      }),
      { params: Promise.resolve({ orgId: "org_1" }) }
    );

    expect(postResponse.status).toBe(200);
    expect((await postResponse.json()).revokedSessions).toBe(2);
  });

  it("lists and queues audit export jobs", async () => {
    listAuditExportJobsMock.mockResolvedValueOnce([]);
    verifyAuditEventIntegrityMock.mockResolvedValueOnce({
      valid: true,
      checked: 22,
      legacyEventsWithoutHash: 0
    });
    createAuditExportJobMock.mockResolvedValueOnce({
      id: "export_1",
      organizationId: "org_1",
      status: "queued",
      filters: {},
      createdAt: "2026-02-14T00:00:00.000Z",
      updatedAt: "2026-02-14T00:00:00.000Z"
    });
    enqueueAuditExportJobMock.mockResolvedValueOnce({
      jobId: "job_1",
      jobKey: "audit-export:org_1:export_1"
    });

    const getResponse = await auditExportGet(new Request("http://localhost/api/orgs/org_1/security/audit/export"), {
      params: Promise.resolve({ orgId: "org_1" })
    });
    expect(getResponse.status).toBe(200);

    const postResponse = await auditExportPost(
      new Request("http://localhost/api/orgs/org_1/security/audit/export", {
        method: "POST",
        headers: {
          origin: "http://localhost",
          "content-type": "application/json"
        }
      }),
      { params: Promise.resolve({ orgId: "org_1" }) }
    );

    expect(postResponse.status).toBe(200);
    expect(enqueueAuditExportJobMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org_1", exportJobId: "export_1" })
    );
  });
});
