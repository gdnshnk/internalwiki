import { run, TaskList } from "graphile-worker";
import { syncConnector } from "./tasks/syncConnector";
import { enrichDocument } from "./tasks/enrichDocument";
import { scheduleConnectorSyncs } from "./tasks/scheduleConnectorSyncs";
import { syncDeadLetter } from "./tasks/syncDeadLetter";
import { maintenanceAuthCleanup } from "./tasks/maintenanceAuthCleanup";
import { auditExportGenerate } from "./tasks/auditExportGenerate";
import { incidentRollup } from "./tasks/incidentRollup";
import { retryStuckSync } from "./tasks/retryStuckSync";
import { privacyRetentionCleanup } from "./tasks/privacyRetentionCleanup";
import { qualityEvalLoop } from "./tasks/qualityEvalLoop";
import { freshnessReviewScan } from "./tasks/freshnessReviewScan";
import { dependencyImpactScan } from "./tasks/dependencyImpactScan";
import { canonicalQuestionRollup } from "./tasks/canonicalQuestionRollup";
import { lowConfidenceReviewQueue } from "./tasks/lowConfidenceReviewQueue";

const taskList: TaskList = {
  "schedule-connector-syncs": async (payload, helpers) => {
    await scheduleConnectorSyncs(payload as Record<string, never>, helpers);
  },
  "sync-connector": async (payload, helpers) => {
    await syncConnector(payload as never, helpers);
  },
  "enrich-document": async (payload, helpers) => {
    await enrichDocument(payload as never, helpers);
  },
  "sync-dead-letter": async (payload, helpers) => {
    await syncDeadLetter(payload as never, helpers);
  },
  "maintenance-auth-cleanup": async (payload, helpers) => {
    await maintenanceAuthCleanup(payload as Record<string, never>, helpers);
  },
  "audit-export-generate": async (payload, helpers) => {
    await auditExportGenerate(payload as never, helpers);
  },
  "incident-rollup": async (payload, helpers) => {
    await incidentRollup(payload as Record<string, never>, helpers);
  },
  "retry-stuck-sync": async (payload, helpers) => {
    await retryStuckSync(payload as Record<string, never>, helpers);
  },
  "privacy-retention-cleanup": async (payload, helpers) => {
    await privacyRetentionCleanup(payload as Record<string, never>, helpers);
  },
  "quality-eval-loop": async (payload, helpers) => {
    await qualityEvalLoop(payload as never, helpers);
  },
  "freshness-review-scan": async (payload, helpers) => {
    await freshnessReviewScan(payload as Record<string, never>, helpers);
  },
  "dependency-impact-scan": async (payload, helpers) => {
    await dependencyImpactScan(payload as Record<string, never>, helpers);
  },
  "canonical-question-rollup": async (payload, helpers) => {
    await canonicalQuestionRollup(payload as Record<string, never>, helpers);
  },
  "low-confidence-review-queue": async (payload, helpers) => {
    await lowConfidenceReviewQueue(payload as Record<string, never>, helpers);
  }
};

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for worker runtime");
  }

  const runner = await run({
    connectionString,
    concurrency: Number(process.env.WORKER_CONCURRENCY ?? 5),
    taskList,
    pollInterval: 2000,
    crontab: `
*/15 * * * * schedule-connector-syncs {}
*/30 * * * * incident-rollup {}
*/10 * * * * retry-stuck-sync {}
*/15 * * * * quality-eval-loop {}
*/15 * * * * freshness-review-scan {}
*/15 * * * * dependency-impact-scan {}
*/30 * * * * low-confidence-review-queue {}
0 * * * * maintenance-auth-cleanup {}
0 2 * * * canonical-question-rollup {}
0 1 * * * privacy-retention-cleanup {}
`
  });

  process.on("SIGTERM", async () => {
    await runner.stop();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
