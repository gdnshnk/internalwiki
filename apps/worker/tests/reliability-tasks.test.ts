import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectorSyncError } from "@internalwiki/connectors";

const {
  appendAuditEventMock,
  markConnectorReauthRequiredMock,
  cleanupExpiredSessionsMock,
  cleanupStaleRateLimitsMock,
  createIncidentEventMock,
  getConnectorSyncStatsMock,
  getRecentDeadLetterEventsMock,
  listOpenIncidentEventsMock,
  listOrganizationIdsMock,
  listStuckSyncRunsMock,
  getAuditExportJobMock,
  listAuditEventsForExportMock,
  updateAuditExportJobStatusMock,
  getAnswerVerificationWindowStatsMock,
  listRecentAnswerVerificationRunsMock,
  recordEvalRunMock,
  recordEvalCasesMock
} = vi.hoisted(() => ({
  appendAuditEventMock: vi.fn(),
  markConnectorReauthRequiredMock: vi.fn(),
  cleanupExpiredSessionsMock: vi.fn(),
  cleanupStaleRateLimitsMock: vi.fn(),
  createIncidentEventMock: vi.fn(),
  getConnectorSyncStatsMock: vi.fn(),
  getRecentDeadLetterEventsMock: vi.fn(),
  listOpenIncidentEventsMock: vi.fn(),
  listOrganizationIdsMock: vi.fn(),
  listStuckSyncRunsMock: vi.fn(),
  getAuditExportJobMock: vi.fn(),
  listAuditEventsForExportMock: vi.fn(),
  updateAuditExportJobStatusMock: vi.fn(),
  getAnswerVerificationWindowStatsMock: vi.fn(),
  listRecentAnswerVerificationRunsMock: vi.fn(),
  recordEvalRunMock: vi.fn(),
  recordEvalCasesMock: vi.fn()
}));

vi.mock("@internalwiki/db", () => ({
  appendAuditEvent: appendAuditEventMock,
  finishConnectorSyncRun: vi.fn(),
  getConnectorAccount: vi.fn(),
  getExternalItemChecksums: vi.fn(),
  markConnectorReauthRequired: markConnectorReauthRequiredMock,
  startConnectorSyncRun: vi.fn(),
  cleanupExpiredSessions: cleanupExpiredSessionsMock,
  cleanupStaleRateLimits: cleanupStaleRateLimitsMock,
  createIncidentEvent: createIncidentEventMock,
  getConnectorSyncStats: getConnectorSyncStatsMock,
  getRecentDeadLetterEvents: getRecentDeadLetterEventsMock,
  listOpenIncidentEvents: listOpenIncidentEventsMock,
  listOrganizationIds: listOrganizationIdsMock,
  listStuckSyncRuns: listStuckSyncRunsMock,
  getAuditExportJob: getAuditExportJobMock,
  listAuditEventsForExport: listAuditEventsForExportMock,
  updateAuditExportJobStatus: updateAuditExportJobStatusMock,
  getAnswerVerificationWindowStats: getAnswerVerificationWindowStatsMock,
  listRecentAnswerVerificationRuns: listRecentAnswerVerificationRunsMock,
  recordEvalRun: recordEvalRunMock,
  recordEvalCases: recordEvalCasesMock
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
import { incidentRollup } from "../src/tasks/incidentRollup";
import { retryStuckSync } from "../src/tasks/retryStuckSync";
import { auditExportGenerate } from "../src/tasks/auditExportGenerate";
import { qualityEvalLoop } from "../src/tasks/qualityEvalLoop";

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

  it("creates incident events when sync reliability thresholds are breached", async () => {
    listOrganizationIdsMock.mockResolvedValueOnce(["org_1"]);
    getConnectorSyncStatsMock.mockResolvedValueOnce({
      last24h: {
        total: 10,
        completed: 3,
        failed: 7,
        running: 0,
        failureByClassification: { transient: 4, auth: 2, payload: 1, unknown: 0 }
      },
      last7d: {
        total: 70,
        completed: 60,
        failed: 10,
        running: 0,
        failureByClassification: { transient: 7, auth: 2, payload: 1, unknown: 0 }
      }
    });
    getRecentDeadLetterEventsMock.mockResolvedValueOnce({ last24h: 3, last7d: 6 });
    listOpenIncidentEventsMock.mockResolvedValueOnce([]);

    await incidentRollup(
      {},
      {
        logger: { info: vi.fn() }
      } as any
    );

    expect(createIncidentEventMock).toHaveBeenCalledTimes(2);
  });

  it("retries stuck sync runs and writes audit events", async () => {
    listStuckSyncRunsMock.mockResolvedValueOnce([
      {
        runId: "run_1",
        organizationId: "org_1",
        connectorAccountId: "conn_1",
        connectorType: "google_docs",
        startedAt: "2026-02-14T00:00:00.000Z"
      }
    ]);

    const addJob = vi.fn().mockResolvedValue({ id: "job_retry_1" });
    await retryStuckSync(
      {},
      {
        addJob,
        logger: { info: vi.fn() }
      } as any
    );

    expect(addJob).toHaveBeenCalledTimes(1);
    expect(appendAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "connector.sync.retry_stuck",
        organizationId: "org_1"
      })
    );
  });

  it("processes queued audit export jobs", async () => {
    getAuditExportJobMock.mockResolvedValueOnce({
      id: "export_1",
      organizationId: "org_1",
      status: "queued"
    });
    listAuditEventsForExportMock.mockResolvedValueOnce([
      { id: "a1" },
      { id: "a2" }
    ]);

    await auditExportGenerate(
      {
        organizationId: "org_1",
        exportJobId: "export_1"
      },
      {
        logger: { info: vi.fn(), warn: vi.fn() }
      } as any
    );

    expect(updateAuditExportJobStatusMock).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "export_1",
        status: "completed",
        rowsExported: 2
      })
    );
  });

  it("runs production quality eval loop and creates incidents on degradation", async () => {
    listOrganizationIdsMock.mockResolvedValueOnce(["org_1"]);
    getAnswerVerificationWindowStatsMock.mockResolvedValueOnce({
      total: 8,
      blocked: 3,
      passRate: 62.5,
      groundednessBlocked: 2,
      freshnessBlocked: 2,
      permissionSafetyBlocked: 1
    });
    listRecentAnswerVerificationRunsMock.mockResolvedValueOnce([
      {
        chatMessageId: "msg_1",
        status: "blocked",
        groundednessStatus: "blocked",
        freshnessStatus: "blocked",
        permissionSafetyStatus: "passed",
        citationCoverage: 0.3,
        unsupportedClaims: 2,
        reasons: ["No citations"],
        createdAt: "2026-02-14T00:00:00.000Z"
      }
    ]);
    recordEvalRunMock.mockResolvedValueOnce({ id: "eval_1" });
    recordEvalCasesMock.mockResolvedValueOnce(undefined);
    listOpenIncidentEventsMock.mockResolvedValueOnce([]);

    await qualityEvalLoop(
      {
        windowMinutes: 30,
        minSamples: 5,
        minPassRate: 85,
        triggerReason: "answer_blocked"
      },
      {
        logger: { info: vi.fn() }
      } as any
    );

    expect(recordEvalRunMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org_1",
        scoreGoodPct: 62.5
      })
    );
    expect(recordEvalCasesMock).toHaveBeenCalled();
    expect(createIncidentEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org_1",
        eventType: "answer_quality_regression"
      })
    );
  });
});
