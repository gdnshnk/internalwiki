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
  upsertUserSourceIdentityMock,
  enqueueSyncConnectorJobMock,
  encryptSecretMock,
  toPublicConnectorMock
} = vi.hoisted(() => ({
  enforceMutationSecurityMock: vi.fn(),
  requireSessionContextMock: vi.fn(),
  assertScopedOrgAccessMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
  runAssistantQueryMock: vi.fn(),
  writeAuditEventMock: vi.fn(),
  createConnectorAccountMock: vi.fn(),
  listConnectorAccountsMock: vi.fn(),
  upsertUserSourceIdentityMock: vi.fn(),
  enqueueSyncConnectorJobMock: vi.fn(),
  encryptSecretMock: vi.fn((input: string) => `enc:${input}`),
  toPublicConnectorMock: vi.fn((value: unknown) => value)
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
  enqueueSyncConnectorJob: enqueueSyncConnectorJobMock
}));

vi.mock("@/lib/crypto", () => ({
  encryptSecret: encryptSecretMock
}));

vi.mock("@/lib/connector-response", () => ({
  toPublicConnector: toPublicConnectorMock
}));

vi.mock("@internalwiki/db", () => ({
  createConnectorAccount: createConnectorAccountMock,
  listConnectorAccounts: listConnectorAccountsMock,
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
