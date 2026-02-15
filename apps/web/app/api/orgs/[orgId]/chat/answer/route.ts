import { z } from "zod";
import { jsonError, jsonOk, rateLimitError } from "@/lib/api";
import { requireSessionContext } from "@/lib/api-auth";
import { runAssistantQuery } from "@/lib/assistant-query";
import { writeAuditEvent } from "@/lib/audit";
import { assertScopedOrgAccess } from "@/lib/organization";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveRequestId, withRequestId } from "@/lib/request-id";
import { enforceMutationSecurity } from "@/lib/security";
import { enqueueLowConfidenceReviewQueueJob, enqueueQualityEvalLoopJob } from "@/lib/worker-jobs";
import { randomUUID } from "node:crypto";
import { listUserSourceIdentityKeys } from "@internalwiki/db";

const chatInputSchema = z.object({
  query: z.string().min(4),
  threadId: z.string().min(8).optional(),
  allowHistoricalEvidence: z.boolean().optional(),
  filters: z
    .object({
      sourceType: z
        .enum([
          "google_docs",
          "google_drive",
          "slack",
          "microsoft_teams",
          "microsoft_sharepoint",
          "microsoft_onedrive"
        ])
        .optional()
    })
    .optional()
});

export async function POST(
  request: Request,
  context: { params: Promise<{ orgId: string }> }
): Promise<Response> {
  const requestId = resolveRequestId(request);
  const securityError = enforceMutationSecurity(request);
  if (securityError) {
    return securityError;
  }

  const { orgId } = await context.params;
  const sessionResult = await requireSessionContext(requestId);
  if (sessionResult instanceof Response) {
    return sessionResult;
  }
  const session = sessionResult;

  try {
    assertScopedOrgAccess({ session, targetOrgId: orgId, minimumRole: "viewer" });
  } catch (error) {
    return jsonError((error as Error).message, 403, withRequestId(requestId));
  }

  const parsed = chatInputSchema.safeParse(await request.json());
  if (!parsed.success) {
    return jsonError(parsed.error.message, 422, withRequestId(requestId));
  }

  const rate = await checkRateLimit({
    key: `${session.organizationId}:${session.userId}:chat_answer_alias`,
    windowMs: 60_000,
    maxRequests: 60
  });
  if (!rate.allowed) {
    return rateLimitError({ retryAfterMs: rate.retryAfterMs, requestId });
  }

  const identityKeys = await listUserSourceIdentityKeys({
    organizationId: orgId,
    userId: session.userId
  });
  const viewerPrincipalKeys = Array.from(
    new Set([
      `email:${session.email.toLowerCase()}`,
      `user:${session.userId}`,
      `role:${session.role}`,
      `org:${orgId}`,
      ...identityKeys
    ])
  );

  const response = await runAssistantQuery({
    organizationId: orgId,
    input: {
      query: parsed.data.query,
      mode: "ask",
      threadId: parsed.data.threadId,
      allowHistoricalEvidence: parsed.data.allowHistoricalEvidence,
      filters: parsed.data.filters
    },
    actorId: session.userId,
    viewerPrincipalKeys
  });

  await writeAuditEvent({
    organizationId: orgId,
    actorId: session.userId,
    eventType: "assistant.query.alias.chat",
    entityType: "assistant_request",
    entityId: randomUUID(),
    payload: {
      sourceType: parsed.data.filters?.sourceType ?? null,
      citations: response.citations.length,
      claims: response.claims.length,
      traceabilityCoverage: response.traceability.coverage,
      verificationStatus: response.verification.status
    }
  });

  if (response.verification.status === "blocked") {
    await enqueueLowConfidenceReviewQueueJob({
      organizationId: orgId,
      confidenceThreshold: 0.65,
      windowMinutes: 180,
      triggeredBy: session.userId
    }).catch(() => undefined);

    await enqueueQualityEvalLoopJob({
      organizationId: orgId,
      windowMinutes: 30,
      minSamples: 5,
      minPassRate: 85,
      triggeredBy: session.userId,
      triggerReason: "chat_answer_blocked",
      sourceRequestId: requestId
    }).catch(() => undefined);
  }

  return jsonOk(
    {
      answer: response.answer,
      citations: response.citations,
      claims: response.claims,
      confidence: response.confidence,
      sourceScore: response.sourceScore,
      threadId: response.threadId,
      messageId: response.messageId,
      grounding: response.grounding,
      traceability: response.traceability,
      verification: response.verification,
      permissions: response.permissions,
      qualityContract: response.qualityContract
    },
    withRequestId(requestId)
  );
}
