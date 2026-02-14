import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  addOrganizationDomain,
  createConnectorAccount,
  createUserSession,
  getOrCreateSessionPolicy,
  getSummaryCitationsByDocumentVersion,
  hashEmbedding,
  listChatThreads,
  listConnectorAccounts,
  listOrganizationDomains,
  markUserOnboardingCompleted,
  persistGroundedAnswer,
  revokeOldestSessionsOverLimit,
  touchConnectorLastSync,
  upsertExternalItemAndDocuments,
  upsertGoogleUserAndEnsureMembership,
  vectorToSqlLiteral
} from "@internalwiki/db";
import { jsonError, jsonOk, rateLimitError } from "@/lib/api";
import { normalizeNextPath } from "@/lib/auth-next";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveRequestId, withRequestId } from "@/lib/request-id";
import { safeInfo } from "@/lib/safe-log";
import { enforceMutationSecurity, requestClientMetadata } from "@/lib/security";
import { createSessionCookieValue } from "@/lib/session-cookie";

const bootstrapOnboardedSchema = z.object({
  next: z.string().optional()
});

export async function POST(request: Request): Promise<Response> {
  const requestId = resolveRequestId(request);
  const securityError = enforceMutationSecurity(request);
  if (securityError) {
    return securityError;
  }

  if (process.env.NODE_ENV === "production") {
    return jsonError("Not found", 404, withRequestId(requestId));
  }

  if (!process.env.DATABASE_URL) {
    return jsonError("DATABASE_URL is required to bootstrap a local session.", 503, withRequestId(requestId));
  }

  const metadata = requestClientMetadata(request);
  const rate = await checkRateLimit({
    key: `auth_dev_bootstrap_onboarded:${metadata.ipAddress ?? "unknown"}`,
    windowMs: 60_000,
    maxRequests: 20
  });
  if (!rate.allowed) {
    return rateLimitError({ retryAfterMs: rate.retryAfterMs, requestId });
  }

  const parsed = bootstrapOnboardedSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return jsonError(parsed.error.message, 422, withRequestId(requestId));
  }

  const membership = await upsertGoogleUserAndEnsureMembership({
    googleSub: "local-onboarded-demo",
    email: "demo@internalwiki.local",
    displayName: "Demo User",
    organizationSlug: "internalwiki-demo",
    organizationName: "InternalWiki Demo",
    role: "owner"
  });

  const existingDomains = await listOrganizationDomains(membership.organizationId);
  if (existingDomains.length === 0) {
    await addOrganizationDomain({
      organizationId: membership.organizationId,
      domain: "internalwiki.local",
      verifiedAt: new Date().toISOString(),
      createdBy: membership.userId
    });
  }

  const existingConnectors = await listConnectorAccounts(membership.organizationId);
  const connector =
    existingConnectors.find((entry) => entry.connectorType === "slack") ??
    (await createConnectorAccount({
      id: `conn_demo_${randomUUID().replace(/-/g, "").slice(0, 18)}`,
      organizationId: membership.organizationId,
      connectorType: "slack",
      status: "active",
      encryptedAccessToken: "dev_demo_token",
      displayName: "Demo Slack Workspace",
      externalWorkspaceId: "demo-slack-workspace",
      createdBy: membership.userId
    }));

  const policyContent = [
    "Escalation policy update: unresolved priority incidents now escalate to Security Operations after 24 hours.",
    "Support remains primary owner for first response and customer communication in the first escalation stage.",
    "Security Operations owns technical incident coordination once cross-system risk or compliance exposure is identified."
  ].join("\n\n");
  const chunks = policyContent
    .split("\n\n")
    .map((entry) => entry.trim())
    .filter(Boolean);

  const upsertedDocument = await upsertExternalItemAndDocuments({
    organizationId: membership.organizationId,
    connectorAccountId: connector.id,
    externalId: "demo_escalation_policy_2026_q1",
    checksum: `demo_policy_${policyContent.length}`,
    sourceType: "slack",
    sourceSystem: "slack",
    aclPrincipalKeys: [`user:${membership.userId}`, `email:${membership.email.toLowerCase()}`],
    sourceUrl: "https://slack.com/demo/security-escalation-policy",
    title: "Security Escalation Policy (Q1 2026)",
    owner: "Security Operations",
    updatedAt: new Date().toISOString(),
    sourceLastUpdatedAt: "2026-02-03T12:00:00.000Z",
    sourceExternalId: "slack_demo_policy_q1_2026",
    sourceFormat: "policy-note",
    canonicalSourceUrl: "https://internalwiki.demo/policies/security-escalation-policy",
    sourceVersionLabel: "v14",
    content: policyContent,
    chunks,
    embeddingVectors: chunks.map((entry) => vectorToSqlLiteral(hashEmbedding(entry))),
    summary:
      "Escalation policy now routes unresolved incidents from Support to Security Operations after 24 hours with clarified ownership.",
    sourceScore: {
      total: 91,
      factors: {
        recency: 0.94,
        sourceAuthority: 0.9,
        authorAuthority: 0.88,
        citationCoverage: 0.92
      },
      computedAt: new Date().toISOString(),
      modelVersion: "demo-seed-v1"
    },
    createdBy: membership.userId
  });

  await touchConnectorLastSync(membership.organizationId, connector.id);

  const existingThreads = await listChatThreads(membership.organizationId, 1);
  if (existingThreads.length === 0) {
    const citations = await getSummaryCitationsByDocumentVersion(
      membership.organizationId,
      upsertedDocument.documentVersionId
    );
    await persistGroundedAnswer({
      organizationId: membership.organizationId,
      actorId: membership.userId,
      question: "What changed in escalation policy this quarter?",
      response: {
        answer:
          "The policy now escalates unresolved priority incidents to Security Operations after 24 hours, while Support remains first-response owner.",
        citations: citations.slice(0, 1),
        confidence: 0.93,
        sourceScore: 91
      }
    });
  }

  await markUserOnboardingCompleted(membership.userId);

  const normalizedNext = normalizeNextPath(parsed.data.next ?? "/app");
  const redirectTo = normalizedNext === "/app" ? "/app?onboarding=1" : normalizedNext;
  const sessionPolicy = await getOrCreateSessionPolicy(membership.organizationId);
  const maxAgeSeconds = Math.max(60 * 5, sessionPolicy.sessionMaxAgeMinutes * 60);
  const userSession = await createUserSession({
    userId: membership.userId,
    organizationId: membership.organizationId,
    expiresAt: new Date(Date.now() + maxAgeSeconds * 1000).toISOString(),
    issuedAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    metadata,
    createdBy: membership.userId
  });
  await revokeOldestSessionsOverLimit({
    organizationId: membership.organizationId,
    userId: membership.userId,
    keepLimit: sessionPolicy.concurrentSessionLimit,
    reason: "concurrent_session_limit"
  });

  const sessionCookie = createSessionCookieValue({
    sessionId: userSession.id,
    maxAgeSeconds
  });

  const response = jsonOk(
    {
      ok: true,
      redirectTo,
      organizationId: membership.organizationId
    },
    withRequestId(requestId)
  );
  response.cookies.set("iw_session", sessionCookie.value, {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds
  });

  safeInfo("auth.dev.bootstrap.onboarded.success", {
    organizationId: membership.organizationId,
    userId: membership.userId
  });

  return response;
}
