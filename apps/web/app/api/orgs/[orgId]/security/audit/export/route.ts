import { createAuditExportJob, listAuditExportJobs, verifyAuditEventIntegrity } from "@internalwiki/db";
import { jsonError, jsonOk, rateLimitError } from "@/lib/api";
import { requireSessionContext } from "@/lib/api-auth";
import { writeAuditEvent } from "@/lib/audit";
import { assertScopedOrgAccess } from "@/lib/organization";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveRequestId, withRequestId } from "@/lib/request-id";
import { enforceMutationSecurity } from "@/lib/security";
import { enqueueAuditExportJob } from "@/lib/worker-jobs";
import { beginIdempotentMutation, finalizeIdempotentMutation } from "@/lib/idempotency";

export async function GET(
  request: Request,
  context: { params: Promise<{ orgId: string }> }
): Promise<Response> {
  const requestId = resolveRequestId(request);
  const { orgId } = await context.params;
  const sessionResult = await requireSessionContext(requestId);
  if (sessionResult instanceof Response) {
    return sessionResult;
  }
  const session = sessionResult;

  try {
    assertScopedOrgAccess({ session, targetOrgId: orgId, minimumRole: "admin" });
  } catch (error) {
    return jsonError((error as Error).message, 403, withRequestId(requestId));
  }

  const rate = await checkRateLimit({
    key: `${session.organizationId}:${session.userId}:security_audit_export_list`,
    windowMs: 60_000,
    maxRequests: 120
  });
  if (!rate.allowed) {
    return rateLimitError({ retryAfterMs: rate.retryAfterMs, requestId });
  }

  const [jobs, integrity] = await Promise.all([
    listAuditExportJobs(orgId, 20),
    verifyAuditEventIntegrity({ organizationId: orgId, limit: 500 })
  ]);

  return jsonOk({ jobs, integrity }, withRequestId(requestId));
}

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
    assertScopedOrgAccess({ session, targetOrgId: orgId, minimumRole: "admin" });
  } catch (error) {
    return jsonError((error as Error).message, 403, withRequestId(requestId));
  }

  const rate = await checkRateLimit({
    key: `${session.organizationId}:${session.userId}:security_audit_export_create`,
    windowMs: 60_000,
    maxRequests: 20
  });
  if (!rate.allowed) {
    return rateLimitError({ retryAfterMs: rate.retryAfterMs, requestId });
  }

  const idempotency = await beginIdempotentMutation({
    request,
    requestId,
    organizationId: orgId,
    actorId: session.userId,
    payload: {}
  });
  if ("response" in idempotency) {
    return idempotency.response;
  }

  const job = await createAuditExportJob({
    organizationId: orgId,
    requestedBy: session.userId
  });

  const queued = await enqueueAuditExportJob({
    organizationId: orgId,
    exportJobId: job.id,
    requestedBy: session.userId
  });

  await writeAuditEvent({
    organizationId: orgId,
    actorId: session.userId,
    eventType: "security.audit.export.requested",
    entityType: "audit_export_job",
    entityId: job.id,
    payload: {
      jobId: job.id,
      queueJobId: queued.jobId
    }
  });

  const responsePayload = {
    job,
    queueJobId: queued.jobId
  };
  await finalizeIdempotentMutation({
    keyHash: idempotency.keyHash,
    organizationId: orgId,
    method: idempotency.method,
    path: idempotency.path,
    status: 200,
    responseBody: responsePayload
  });

  return jsonOk(
    responsePayload,
    withRequestId(requestId)
  );
}
