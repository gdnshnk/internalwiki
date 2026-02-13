import { appendAuditEvent } from "@internalwiki/db";
import { safeError } from "@/lib/safe-log";

export async function writeAuditEvent(input: {
  organizationId: string;
  actorId?: string;
  eventType: string;
  entityType: string;
  entityId: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  try {
    await appendAuditEvent(input);
  } catch (error) {
    safeError("audit.write.failed", {
      eventType: input.eventType,
      entityType: input.entityType,
      entityId: input.entityId,
      message: (error as Error).message
    });
  }
}
