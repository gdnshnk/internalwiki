import { jsonError, jsonOk, rateLimitError } from "@/lib/api";
import { requireSessionContext } from "@/lib/api-auth";
import { writeAuditEvent } from "@/lib/audit";
import { assertScopedOrgAccess } from "@/lib/organization";
import { assistantQuerySchema, runAssistantQuery } from "@/lib/assistant-query";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveRequestId, withRequestId } from "@/lib/request-id";
import { safeError } from "@/lib/safe-log";
import { enforceMutationSecurity } from "@/lib/security";
import { enqueueLowConfidenceReviewQueueJob, enqueueQualityEvalLoopJob } from "@/lib/worker-jobs";
import { createRequestLogger } from "@internalwiki/observability";
import type { AssistantQueryStreamEvent } from "@internalwiki/core";
import { listUserSourceIdentityKeys } from "@internalwiki/db";

export async function POST(
  request: Request,
  context: { params: Promise<{ orgId: string }> }
): Promise<Response> {
  const requestId = resolveRequestId(request);
  const log = createRequestLogger(requestId, { orgId: (await context.params).orgId });
  log.info({ method: request.method, url: request.url }, "Assistant query request");

  const securityError = enforceMutationSecurity(request);
  if (securityError) {
    log.warn("Security check failed");
    return securityError;
  }

  const { orgId } = await context.params;
  const sessionResult = await requireSessionContext(requestId);
  if (sessionResult instanceof Response) {
    log.warn("Session authentication failed");
    return sessionResult;
  }
  const session = sessionResult;
  log.child({ userId: session.userId, organizationId: session.organizationId });

  try {
    assertScopedOrgAccess({ session, targetOrgId: orgId, minimumRole: "viewer" });
  } catch (error) {
    return jsonError((error as Error).message, 403, withRequestId(requestId));
  }

  const rate = await checkRateLimit({
    key: `${session.organizationId}:${session.userId}:assist_query`,
    windowMs: 60_000,
    maxRequests: 60
  });
  if (!rate.allowed) {
    return rateLimitError({ retryAfterMs: rate.retryAfterMs, requestId });
  }

  const parsed = assistantQuerySchema.safeParse(await request.json());
  if (!parsed.success) {
    return jsonError(parsed.error.message, 422, withRequestId(requestId));
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
  const streamMode = new URL(request.url).searchParams.get("stream") === "1";

  if (!streamMode) {
    const response = await runAssistantQuery({
      organizationId: orgId,
      input: parsed.data,
      actorId: session.userId,
      viewerPrincipalKeys
    });

    await writeAuditEvent({
      organizationId: orgId,
      actorId: session.userId,
      eventType: "assistant.query",
      entityType: "assistant_request",
      entityId: requestId,
      payload: {
        mode: parsed.data.mode,
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
      }).catch((error) => {
        log.warn({ message: (error as Error).message }, "Failed to enqueue low confidence review queue");
      });

      await enqueueQualityEvalLoopJob({
        organizationId: orgId,
        windowMinutes: 30,
        minSamples: 5,
        minPassRate: 85,
        triggeredBy: session.userId,
        triggerReason: "answer_blocked",
        sourceRequestId: requestId
      }).catch((error) => {
        log.warn({ message: (error as Error).message }, "Failed to enqueue quality eval loop");
      });
    }

    return jsonOk(response, withRequestId(requestId));
  }

  const encoder = new TextEncoder();
  const startedAt = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: AssistantQueryStreamEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\\n\\n`));
      };

      const startEvent: AssistantQueryStreamEvent = {
        type: "start",
        requestId,
        mode: parsed.data.mode
      };
      send(startEvent);

      void (async () => {
        const requestLog = createRequestLogger(requestId, {
          orgId,
          userId: session.userId,
          mode: parsed.data.mode
        });
        try {
          requestLog.debug({ query: parsed.data.query }, "Running assistant query");
          const response = await runAssistantQuery({
            organizationId: orgId,
            input: parsed.data,
            actorId: session.userId,
            viewerPrincipalKeys
          });
          requestLog.info(
            {
              citations: response.citations.length,
              claims: response.claims.length,
              retrievalMs: response.timings.retrievalMs,
              generationMs: response.timings.generationMs
            },
            "Assistant query completed"
          );

          const sourcesEvent: AssistantQueryStreamEvent = {
            type: "sources",
            requestId,
            sources: response.sources,
            retrievalMs: response.timings.retrievalMs
          };
          send(sourcesEvent);

          const chunks = response.answer.split(/(\\s+)/).filter(Boolean);
          const firstTokenAt = Date.now();
          let tokenIndex = 0;
          for (const chunk of chunks) {
            const chunkEvent: AssistantQueryStreamEvent = {
              type: "chunk",
              requestId,
              text: chunk,
              firstTokenMs: tokenIndex === 0 ? firstTokenAt - startedAt : undefined
            };
            send(chunkEvent);
            tokenIndex += 1;
          }

          await writeAuditEvent({
            organizationId: orgId,
            actorId: session.userId,
            eventType: "assistant.query.stream",
            entityType: "assistant_request",
            entityId: requestId,
            payload: {
              mode: parsed.data.mode,
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
            }).catch((error) => {
              requestLog.warn({ message: (error as Error).message }, "Failed to enqueue low confidence review queue");
            });

            await enqueueQualityEvalLoopJob({
              organizationId: orgId,
              windowMinutes: 30,
              minSamples: 5,
              minPassRate: 85,
              triggeredBy: session.userId,
              triggerReason: "answer_blocked_stream",
              sourceRequestId: requestId
            }).catch((error) => {
              requestLog.warn({ message: (error as Error).message }, "Failed to enqueue quality eval loop");
            });
          }

          const completionEvent: AssistantQueryStreamEvent = {
            type: "complete",
            requestId,
            payload: response,
            completionMs: Date.now() - startedAt
          };
          send(completionEvent);
          controller.close();
        } catch (error) {
          safeError("assist.query.stream.failed", {
            requestId,
            message: (error as Error).message
          });

          const errEvent: AssistantQueryStreamEvent = {
            type: "error",
            requestId,
            message: (error as Error).message
          };
          send(errEvent);
          controller.close();
        }
      })();
    }
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "x-request-id": requestId
    }
  });
}
