import { cleanupExpiredSessions, cleanupStaleRateLimits } from "@internalwiki/db";
import type { JobHelpers } from "graphile-worker";

export async function maintenanceAuthCleanup(
  _payload: Record<string, never>,
  helpers: JobHelpers
): Promise<void> {
  const expiredSessions = await cleanupExpiredSessions(2500);
  const staleRateLimits = await cleanupStaleRateLimits({
    olderThanMs: 1000 * 60 * 60 * 24 * 3,
    maxRows: 5000
  });

  helpers.logger.info(
    `maintenanceAuthCleanup jobId=${helpers.job.id} expiredSessions=${expiredSessions} staleRateLimits=${staleRateLimits}`
  );
}
