import { jsonError, jsonOk, rateLimitError } from "@/lib/api";
import { requireSessionContext } from "@/lib/api-auth";
import { writeAuditEvent } from "@/lib/audit";
import { assertScopedOrgAccess } from "@/lib/organization";
import { assistantQuerySchema, runAssistantQuery } from "@/lib/assistant-query";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveRequestId, withRequestId } from "@/lib/request-id";
import { safeError } from "@/lib/safe-log";
import { enforceMutationSecurity } from "@/lib/security";
import type { AssistantQueryStreamEvent } from "@internalwiki/core";

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
  const streamMode = new URL(request.url).searchParams.get("stream") === "1";

  if (!streamMode) {
    const response = await runAssistantQuery({
      organizationId: orgId,
      input: parsed.data,
      actorId: session.userId
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
        traceabilityCoverage: response.traceability.coverage
      }
    });

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
        try {
          const response = await runAssistantQuery({
            organizationId: orgId,
            input: parsed.data,
            actorId: session.userId
          });

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
              traceabilityCoverage: response.traceability.coverage
            }
          });

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
