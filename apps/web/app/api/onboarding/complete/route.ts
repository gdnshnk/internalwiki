import {
  countDocumentsByOrganization,
  getUserOnboardingCompletedAt,
  listChatThreads,
  listConnectorAccounts,
  markUserOnboardingCompleted
} from "@internalwiki/db";
import { jsonOk, rateLimitError } from "@/lib/api";
import { requireSessionContext } from "@/lib/api-auth";
import { writeAuditEvent } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveRequestId, withRequestId } from "@/lib/request-id";
import { enforceMutationSecurity } from "@/lib/security";

type OnboardingProgress = {
  connected: boolean;
  synced: boolean;
  askedFirstQuestion: boolean;
};

function isChecklistComplete(progress: OnboardingProgress): boolean {
  return progress.connected && progress.synced && progress.askedFirstQuestion;
}

export async function POST(request: Request): Promise<Response> {
  const requestId = resolveRequestId(request);
  const securityError = enforceMutationSecurity(request);
  if (securityError) {
    return securityError;
  }

  const sessionResult = await requireSessionContext(requestId);
  if (sessionResult instanceof Response) {
    return sessionResult;
  }
  const session = sessionResult;

  const rate = await checkRateLimit({
    key: `${session.organizationId}:${session.userId}:onboarding_complete`,
    windowMs: 60_000,
    maxRequests: 30
  });
  if (!rate.allowed) {
    return rateLimitError({ retryAfterMs: rate.retryAfterMs, requestId });
  }

  const [connectors, documentCount, latestThread, completedBefore] = await Promise.all([
    listConnectorAccounts(session.organizationId),
    countDocumentsByOrganization(session.organizationId),
    listChatThreads(session.organizationId, 1),
    getUserOnboardingCompletedAt(session.userId)
  ]);

  const progress: OnboardingProgress = {
    connected: connectors.length > 0,
    synced: documentCount > 0,
    askedFirstQuestion: latestThread.length > 0
  };

  let completed = Boolean(completedBefore);
  if (!completed && isChecklistComplete(progress)) {
    const completedAt = await markUserOnboardingCompleted(session.userId);
    const newlyCompleted = !completedBefore && Boolean(completedAt);
    completed = Boolean(completedAt);

    if (newlyCompleted) {
      await writeAuditEvent({
        organizationId: session.organizationId,
        actorId: session.userId,
        eventType: "onboarding.completed",
        entityType: "user",
        entityId: session.userId,
        payload: {
          connected: progress.connected,
          synced: progress.synced,
          askedFirstQuestion: progress.askedFirstQuestion
        }
      });
    }
  }

  return jsonOk(
    {
      ok: true,
      completed,
      progress
    },
    withRequestId(requestId)
  );
}
