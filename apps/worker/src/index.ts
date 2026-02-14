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
0 * * * * maintenance-auth-cleanup {}
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
