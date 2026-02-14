import {
  getAuditExportJob,
  listAuditEventsForExport,
  updateAuditExportJobStatus
} from "@internalwiki/db";
import type { JobHelpers } from "graphile-worker";

type AuditExportGeneratePayload = {
  organizationId: string;
  exportJobId: string;
  requestedBy?: string;
};

export async function auditExportGenerate(
  payload: AuditExportGeneratePayload,
  helpers: JobHelpers
): Promise<void> {
  const job = await getAuditExportJob(payload.exportJobId);
  if (!job || job.organizationId !== payload.organizationId) {
    helpers.logger.warn(
      `auditExportGenerate skipped missing job org=${payload.organizationId} exportJob=${payload.exportJobId}`
    );
    return;
  }

  await updateAuditExportJobStatus({
    jobId: payload.exportJobId,
    status: "running"
  });

  try {
    const events = await listAuditEventsForExport({
      organizationId: payload.organizationId,
      limit: 2000
    });

    await updateAuditExportJobStatus({
      jobId: payload.exportJobId,
      status: "completed",
      rowsExported: events.length,
      downloadUrl: `inline://audit-export/${payload.exportJobId}`
    });

    helpers.logger.info(
      `auditExportGenerate completed org=${payload.organizationId} exportJob=${payload.exportJobId} rows=${events.length}`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateAuditExportJobStatus({
      jobId: payload.exportJobId,
      status: "failed",
      errorMessage: message
    });
    throw error;
  }
}
