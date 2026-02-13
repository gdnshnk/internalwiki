import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectorSyncError } from "@internalwiki/connectors";

const {
  appendAuditEventMock,
  markConnectorReauthRequiredMock,
  cleanupExpiredSessionsMock,
  cleanupStaleRateLimitsMock
} = vi.hoisted(() => ({
  appendAuditEventMock: vi.fn(),
  markConnectorReauthRequiredMock: vi.fn(),
  cleanupExpiredSessionsMock: vi.fn(),
  cleanupStaleRateLimitsMock: vi.fn()
}));

vi.mock("@internalwiki/db", () => ({
  appendAuditEvent: appendAuditEventMock,
  finishConnectorSyncRun: vi.fn(),
  getConnectorAccount: vi.fn(),
  getExternalItemChecksums: vi.fn(),
  markConnectorReauthRequired: markConnectorReauthRequiredMock,
  startConnectorSyncRun: vi.fn(),
  cleanupExpiredSessions: cleanupExpiredSessionsMock,
  cleanupStaleRateLimits: cleanupStaleRateLimitsMock
}));

vi.mock("@internalwiki/connectors", async () => {
  const actual = await vi.importActual<typeof import("@internalwiki/connectors")>("@internalwiki/connectors");
  return {
    ...actual,
    getConnector: vi.fn()
  };
});

import { maintenanceAuthCleanup } from "../src/tasks/maintenanceAuthCleanup";
import { classifySyncError } from "../src/tasks/syncConnector";
import { syncDeadLetter } from "../src/tasks/syncDeadLetter";

describe("worker reliability tasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("classifies sync failures into transient/auth/payload buckets", () => {
    expect(classifySyncError(new ConnectorSyncError("revoked token", "auth"))).toBe("auth");
    expect(classifySyncError(new Error("provider timeout 503"))).toBe("transient");
    expect(classifySyncError(new Error("invalid payload shape"))).toBe("payload");
  });

  it("writes dead-letter audit events and marks auth failures for reauth", async () => {
    const helpers = {
      logger: {
        error: vi.fn()
      },
      job: {
        id: "job_1"
      }
    } as any;

    await syncDeadLetter(
      {
        organizationId: "org_1",
        connectorAccountId: "conn_1",
        connectorType: "google_docs",
        runId: "run_1",
        classification: "auth",
        reason: "invalid_grant"
      },
      helpers
    );

    expect(markConnectorReauthRequiredMock).toHaveBeenCalledWith("org_1", "conn_1");
    expect(appendAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "connector.sync.dead_letter",
        organizationId: "org_1"
      })
    );
  });

  it("runs maintenance cleanup and logs totals", async () => {
    cleanupExpiredSessionsMock.mockResolvedValueOnce(8);
    cleanupStaleRateLimitsMock.mockResolvedValueOnce(15);

    const info = vi.fn();
    const helpers = {
      logger: { info },
      job: {
        id: "job_cleanup"
      }
    } as any;

    await maintenanceAuthCleanup({}, helpers);

    expect(cleanupExpiredSessionsMock).toHaveBeenCalledWith(2500);
    expect(cleanupStaleRateLimitsMock).toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith(expect.stringContaining("expiredSessions=8"));
  });
});
