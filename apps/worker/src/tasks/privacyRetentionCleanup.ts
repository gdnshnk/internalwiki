import { cleanupPrivacyRetention } from "@internalwiki/db";
import type { JobHelpers } from "graphile-worker";

type PrivacyRetentionCleanupPayload = {
  retentionDays?: number;
  maxRowsPerTable?: number;
};

export async function privacyRetentionCleanup(
  payload: PrivacyRetentionCleanupPayload,
  helpers: JobHelpers
): Promise<void> {
  const retentionDays = payload.retentionDays ?? Number(process.env.INTERNALWIKI_RETENTION_DAYS ?? 90);
  const maxRowsPerTable = payload.maxRowsPerTable ?? Number(process.env.INTERNALWIKI_RETENTION_MAX_ROWS ?? 5000);

  const result = await cleanupPrivacyRetention({
    retentionDays,
    maxRowsPerTable
  });

  helpers.logger.info(
    `privacyRetentionCleanup jobId=${helpers.job.id} retentionDays=${retentionDays} feedback=${result.assistantFeedbackDeleted} chatMessages=${result.chatMessagesDeleted} chatThreads=${result.chatThreadsDeleted} privacyRequests=${result.privacyRequestsDeleted}`
  );
}

