import {
  createIncidentEvent,
  getConnectorSyncStats,
  getRecentDeadLetterEvents,
  listOpenIncidentEvents,
  listOrganizationIds
} from "@internalwiki/db";
import type { JobHelpers } from "graphile-worker";

type IncidentRollupPayload = {
  organizationId?: string;
};

function hasOpenIncident(
  incidents: Awaited<ReturnType<typeof listOpenIncidentEvents>>,
  eventType: string
): boolean {
  return incidents.some((incident) => incident.eventType === eventType);
}

export async function incidentRollup(payload: IncidentRollupPayload, helpers: JobHelpers): Promise<void> {
  const orgIds = payload.organizationId ? [payload.organizationId] : await listOrganizationIds(1000);

  for (const orgId of orgIds) {
    const [sync, deadLetters, open] = await Promise.all([
      getConnectorSyncStats(orgId),
      getRecentDeadLetterEvents(orgId),
      listOpenIncidentEvents(orgId)
    ]);

    if (sync.last24h.failed >= 5 && sync.last24h.failed > sync.last24h.completed && !hasOpenIncident(open, "sync_failure_spike")) {
      await createIncidentEvent({
        organizationId: orgId,
        severity: "warning",
        eventType: "sync_failure_spike",
        summary: "Connector sync failures exceeded successful runs in the last 24h.",
        metadata: {
          failed: sync.last24h.failed,
          completed: sync.last24h.completed
        }
      });
    }

    if (deadLetters.last24h >= 3 && !hasOpenIncident(open, "dead_letter_spike")) {
      await createIncidentEvent({
        organizationId: orgId,
        severity: "critical",
        eventType: "dead_letter_spike",
        summary: "Dead-lettered connector sync jobs crossed alert threshold in the last 24h.",
        metadata: {
          last24h: deadLetters.last24h
        }
      });
    }
  }

  helpers.logger.info(`incidentRollup organizations=${orgIds.length}`);
}
