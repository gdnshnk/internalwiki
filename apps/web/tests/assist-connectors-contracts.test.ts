import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const {
  enforceMutationSecurityMock,
  requireSessionContextMock,
  assertScopedOrgAccessMock,
  checkRateLimitMock,
  runAssistantQueryMock,
  writeAuditEventMock,
  createConnectorAccountMock,
  listConnectorAccountsMock,
  listUserSourceIdentityKeysMock,
  upsertUserSourceIdentityMock,
  enqueueSyncConnectorJobMock,
  enqueueQualityEvalLoopJobMock,
  enqueueLowConfidenceReviewQueueJobMock,
  encryptSecretMock,
  toPublicConnectorMock,
  getOrgEntitlementsMock
} = vi.hoisted(() => ({
  enforceMutationSecurityMock: vi.fn(),
  requireSessionContextMock: vi.fn(),
  assertScopedOrgAccessMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
  runAssistantQueryMock: vi.fn(),
  writeAuditEventMock: vi.fn(),
  createConnectorAccountMock: vi.fn(),
  listConnectorAccountsMock: vi.fn(),
  listUserSourceIdentityKeysMock: vi.fn(),
  upsertUserSourceIdentityMock: vi.fn(),
  enqueueSyncConnectorJobMock: vi.fn(),
  enqueueQualityEvalLoopJobMock: vi.fn(),
  enqueueLowConfidenceReviewQueueJobMock: vi.fn(),
  encryptSecretMock: vi.fn((input: string) => `enc:${input}`),
  toPublicConnectorMock: vi.fn((value: unknown) => value),
  getOrgEntitlementsMock: vi.fn()
}));

vi.mock("@/lib/security", () => ({
  enforceMutationSecurity: enforceMutationSecurityMock
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

vi.mock("@/lib/assistant-query", () => ({
  assistantQuerySchema: z.object({
    query: z.string().min(4),
    mode: z.enum(["ask", "summarize", "trace"]),
    allowHistoricalEvidence: z.boolean().optional(),
    filters: z
      .object({
        sourceType: z
          .enum([
            "google_docs",
            "google_drive",
            "slack",
            "microsoft_teams",
            "microsoft_sharepoint",
            "microsoft_onedrive"
          ])
          .optional()
      })
      .optional()
  }),
  runAssistantQuery: runAssistantQueryMock
}));

vi.mock("@/lib/audit", () => ({
  writeAuditEvent: writeAuditEventMock
}));

vi.mock("@/lib/worker-jobs", () => ({
  enqueueSyncConnectorJob: enqueueSyncConnectorJobMock,
  enqueueQualityEvalLoopJob: enqueueQualityEvalLoopJobMock,
  enqueueLowConfidenceReviewQueueJob: enqueueLowConfidenceReviewQueueJobMock
}));

vi.mock("@/lib/crypto", () => ({
  encryptSecret: encryptSecretMock
}));

vi.mock("@/lib/connector-response", () => ({
  toPublicConnector: toPublicConnectorMock
}));

vi.mock("@/lib/billing", () => ({
  getOrgEntitlements: getOrgEntitlementsMock
}));

vi.mock("@internalwiki/db", () => ({
  createConnectorAccount: createConnectorAccountMock,
  listConnectorAccounts: listConnectorAccountsMock,
  listUserSourceIdentityKeys: listUserSourceIdentityKeysMock,
  upsertUserSourceIdentity: upsertUserSourceIdentityMock
}));

import { POST as assistQueryPost } from "@/app/api/orgs/[orgId]/assist/query/route";
import { POST as createConnectorPost } from "@/app/api/orgs/[orgId]/connectors/route";

const session = {
  userId: "user_1",
  email: "admin@company.com",
  organizationId: "org_1",
  role: "admin" as const
};

describe("assist and connector API contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enforceMutationSecurityMock.mockReturnValue(null);
    assertScopedOrgAccessMock.mockReturnValue(undefined);
    checkRateLimitMock.mockResolvedValue({ allowed: true, retryAfterMs: 0 });
    requireSessionContextMock.mockResolvedValue(session);
    listUserSourceIdentityKeysMock.mockResolvedValue([]);
    getOrgEntitlementsMock.mockResolvedValue({
      organizationId: "org_1",
      planTier: "business",
      billableRoles: ["creator", "admin"],
      billableSeats: {
        admin: 1,
        creator: 1,
        total: 2
      },
      readerSeats: 5,
      limits: {
        connectorLimit: null,
        includedCreditsMonthly: 1000,
        overageEnabled: true
      },
      features: {
        sso: true,
        scim: true,
        auditExport: true,
        compliancePosture: true,
        domainInviteControls: true,
        advancedPermissionsDiagnostics: true
      }
    });
    enqueueQualityEvalLoopJobMock.mockResolvedValue({
      jobId: "job_quality_1",
      jobKey: "quality-eval:org_1:answer_blocked:bucket"
    });
    enqueueLowConfidenceReviewQueueJobMock.mockResolvedValue({
      jobId: "job_low_confidence_1",
      jobKey: "low-confidence:org_1:bucket"
    });
  });

  it("returns 401 for assist query when no authenticated session exists", async () => {
    requireSessionContextMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: {
          "content-type": "application/json"
        }
      })
    );

    const response = await assistQueryPost(
      new Request("http://localhost/api/orgs/org_1/assist/query", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost"
        },
        body: JSON.stringify({ query: "show onboarding owners", mode: "ask" })
      }),
      { params: Promise.resolve({ orgId: "org_1" }) }
    );

    expect(response.status).toBe(401);
  });

  it("returns 403 for assist query when org access is denied", async () => {
    assertScopedOrgAccessMock.mockImplementationOnce(() => {
      throw new Error("Forbidden");
    });

    const response = await assistQueryPost(
      new Request("http://localhost/api/orgs/org_2/assist/query", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost"
        },
        body: JSON.stringify({ query: "who owns incident policy", mode: "ask" })
      }),
      { params: Promise.resolve({ orgId: "org_2" }) }
    );

    expect(response.status).toBe(403);
  });

  it("returns 422 for assist query schema violations", async () => {
    const response = await assistQueryPost(
      new Request("http://localhost/api/orgs/org_1/assist/query", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost"
        },
        body: JSON.stringify({ query: "bad", mode: "ask" })
      }),
      { params: Promise.resolve({ orgId: "org_1" }) }
    );

    expect(response.status).toBe(422);
    expect(runAssistantQueryMock).not.toHaveBeenCalled();
  });

  it("forwards historical-evidence override to assistant query runtime", async () => {
    runAssistantQueryMock.mockResolvedValueOnce({
      answer: "summary",
      confidence: 0.9,
      sourceScore: 80,
      citations: [],
      claims: [],
      sources: [],
      grounding: {
        citationCoverage: 0.9,
        unsupportedClaimCount: 0,
        retrievalScore: 0.8
      },
      traceability: {
        coverage: 1,
        missingAuthorCount: 0,
        missingDateCount: 0
      },
      timings: {
        retrievalMs: 10,
        generationMs: 15
      },
      verification: {
        status: "passed",
        reasons: [],
        citationCoverage: 0.9,
        unsupportedClaims: 0
      },
      permissions: {
        filteredOutCount: 0,
        aclMode: "enforced"
      },
      qualityContract: {
        version: "v1",
        status: "passed",
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
        allowHistoricalEvidence: true,
        dimensions: {
          groundedness: {
            status: "passed",
            reasons: [],
            reasonCodes: [],
            metrics: {
              citationCount: 1,
              citationCoverage: 0.9,
              unsupportedClaims: 0
            }
          },
          freshness: {
            status: "passed",
            reasons: [],
            reasonCodes: [],
            metrics: {
              freshnessWindowDays: 30,
              citationCount: 1,
              freshCitationCount: 1,
              staleCitationCount: 0,
              citationFreshnessCoverage: 1
            }
          },
          permissionSafety: {
            status: "passed",
            reasons: [],
            reasonCodes: [],
            metrics: {
              candidateCount: 1,
              citationCount: 1,
              hasViewerPrincipalKeys: true
            }
          }
        }
      },
      mode: "ask",
      model: "mock-model"
    });

    const response = await assistQueryPost(
      new Request("http://localhost/api/orgs/org_1/assist/query", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost"
        },
        body: JSON.stringify({
          query: "show onboarding owners",
          mode: "ask",
          allowHistoricalEvidence: true
        })
      }),
      { params: Promise.resolve({ orgId: "org_1" }) }
    );

    expect(response.status).toBe(200);
    expect(runAssistantQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          allowHistoricalEvidence: true
        })
      })
    );
  });

  it("queues quality eval loop when answer verification is blocked", async () => {
    runAssistantQueryMock.mockResolvedValueOnce({
      answer: "blocked",
      confidence: 0.3,
      sourceScore: 20,
      citations: [],
      claims: [],
      sources: [],
      grounding: {
        citationCoverage: 0.2,
        unsupportedClaimCount: 3,
        retrievalScore: 0.1
      },
      traceability: {
        coverage: 0,
        missingAuthorCount: 0,
        missingDateCount: 0
      },
      timings: {
        retrievalMs: 10,
        generationMs: 15
      },
      verification: {
        status: "blocked",
        reasons: ["No citations"],
        citationCoverage: 0.2,
        unsupportedClaims: 3
      },
      permissions: {
        filteredOutCount: 0,
        aclMode: "enforced"
      },
      qualityContract: {
        version: "v1",
        status: "blocked",
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
        allowHistoricalEvidence: false,
        dimensions: {
          groundedness: {
            status: "blocked",
            reasons: ["No citations"],
            reasonCodes: ["groundedness.no_citations"],
            metrics: {
              citationCount: 0,
              citationCoverage: 0.2,
              unsupportedClaims: 3
            }
          },
          freshness: {
            status: "blocked",
            reasons: ["No fresh evidence"],
            reasonCodes: ["freshness.no_fresh_evidence"],
            metrics: {
              freshnessWindowDays: 30,
              citationCount: 0,
              freshCitationCount: 0,
              staleCitationCount: 0,
              citationFreshnessCoverage: 0
            }
          },
          permissionSafety: {
            status: "blocked",
            reasons: ["No permitted evidence"],
            reasonCodes: ["permission.no_permitted_evidence"],
            metrics: {
              candidateCount: 0,
              citationCount: 0,
              hasViewerPrincipalKeys: true
            }
          }
        }
      },
      mode: "ask",
      model: "mock-model"
    });

    const response = await assistQueryPost(
      new Request("http://localhost/api/orgs/org_1/assist/query", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost"
        },
        body: JSON.stringify({ query: "show onboarding owners", mode: "ask" })
      }),
      { params: Promise.resolve({ orgId: "org_1" }) }
    );

    expect(response.status).toBe(200);
    expect(enqueueQualityEvalLoopJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org_1",
        triggerReason: "answer_blocked"
      })
    );
  });

  it("returns 403 for connector create when RBAC denies mutation", async () => {
    assertScopedOrgAccessMock.mockImplementationOnce(() => {
      throw new Error("Insufficient role");
    });

    const response = await createConnectorPost(
      new Request("http://localhost/api/orgs/org_1/connectors", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost"
        },
        body: JSON.stringify({
          connectorType: "slack",
          displayName: "Slack Workspace",
          externalWorkspaceId: "workspace_1",
          accessToken: "token_value",
          refreshToken: "refresh_value"
        })
      }),
      { params: Promise.resolve({ orgId: "org_1" }) }
    );

    expect(response.status).toBe(403);
    expect(createConnectorAccountMock).not.toHaveBeenCalled();
  });

  it("returns 429 with retry hints for connector create rate-limit violations", async () => {
    checkRateLimitMock.mockResolvedValueOnce({ allowed: false, retryAfterMs: 2100 });

    const response = await createConnectorPost(
      new Request("http://localhost/api/orgs/org_1/connectors", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost"
        },
        body: JSON.stringify({
          connectorType: "slack",
          displayName: "Slack Workspace",
          externalWorkspaceId: "workspace_1",
          accessToken: "token_value",
          refreshToken: "refresh_value"
        })
      }),
      { params: Promise.resolve({ orgId: "org_1" }) }
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("3");
    expect(createConnectorAccountMock).not.toHaveBeenCalled();
  });

  it("returns 410 when attempting to create deprecated notion connector", async () => {
    const response = await createConnectorPost(
      new Request("http://localhost/api/orgs/org_1/connectors", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost"
        },
        body: JSON.stringify({
          connectorType: "notion",
          displayName: "Notion Workspace",
          externalWorkspaceId: "workspace_1",
          accessToken: "token_value",
          refreshToken: "refresh_value"
        })
      }),
      { params: Promise.resolve({ orgId: "org_1" }) }
    );

    expect(response.status).toBe(410);
    expect(createConnectorAccountMock).not.toHaveBeenCalled();
  });

  it("returns 402 when connector limit is reached for the plan", async () => {
    getOrgEntitlementsMock.mockResolvedValueOnce({
      organizationId: "org_1",
      planTier: "free",
      billableRoles: ["creator", "admin"],
      billableSeats: {
        admin: 1,
        creator: 1,
        total: 2
      },
      readerSeats: 3,
      limits: {
        connectorLimit: 2,
        includedCreditsMonthly: 100,
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
    listConnectorAccountsMock.mockResolvedValueOnce([
      {
        id: "connector_1",
        organizationId: "org_1",
        connectorType: "google_docs",
        status: "active",
        encryptedAccessToken: "enc:a",
        createdAt: "2026-02-14T00:00:00.000Z",
        updatedAt: "2026-02-14T00:00:00.000Z"
      },
      {
        id: "connector_2",
        organizationId: "org_1",
        connectorType: "slack",
        status: "active",
        encryptedAccessToken: "enc:b",
        createdAt: "2026-02-14T00:00:00.000Z",
        updatedAt: "2026-02-14T00:00:00.000Z"
      }
    ]);

    const response = await createConnectorPost(
      new Request("http://localhost/api/orgs/org_1/connectors", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost"
        },
        body: JSON.stringify({
          connectorType: "microsoft_teams",
          displayName: "Teams Workspace",
          externalWorkspaceId: "workspace_1",
          accessToken: "token_value",
          refreshToken: "refresh_value"
        })
      }),
      { params: Promise.resolve({ orgId: "org_1" }) }
    );

    expect(response.status).toBe(402);
    expect(createConnectorAccountMock).not.toHaveBeenCalled();
  });

  it("creates connector and queues initial sync for deterministic setup", async () => {
    createConnectorAccountMock.mockResolvedValueOnce({
      id: "connector_1",
      organizationId: "org_1",
      connectorType: "slack",
      status: "active",
      encryptedAccessToken: "enc:token_value",
      encryptedRefreshToken: "enc:refresh_value",
      tokenExpiresAt: null,
      syncCursor: null,
      lastSyncedAt: null,
      displayName: "Slack Workspace",
      externalWorkspaceId: "workspace_1",
      createdAt: "2026-02-14T00:00:00.000Z",
      updatedAt: "2026-02-14T00:00:00.000Z"
    });
    listConnectorAccountsMock.mockResolvedValueOnce([]);
    enqueueSyncConnectorJobMock.mockResolvedValueOnce({
      jobId: "job_1",
      jobKey: "sync:org_1:connector_1:bucket"
    });

    const response = await createConnectorPost(
      new Request("http://localhost/api/orgs/org_1/connectors", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost"
        },
        body: JSON.stringify({
          connectorType: "slack",
          displayName: "Slack Workspace",
          externalWorkspaceId: "workspace_1",
          accessToken: "token_value",
          refreshToken: "refresh_value"
        })
      }),
      { params: Promise.resolve({ orgId: "org_1" }) }
    );

    expect(response.status).toBe(200);
    expect(upsertUserSourceIdentityMock).toHaveBeenCalledTimes(2);
    expect(enqueueSyncConnectorJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org_1",
        connectorAccountId: "connector_1",
        connectorType: "slack",
        triggeredBy: "user_1"
      })
    );
    const body = (await response.json()) as { syncQueued?: boolean; queueJobId?: string };
    expect(body.syncQueued).toBe(true);
    expect(body.queueJobId).toBe("job_1");
  });
});
