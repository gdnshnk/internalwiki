import { jsonError, jsonOk } from "@/lib/api";
import { writeAuditEvent } from "@/lib/audit";
import { getDocumentById } from "@/lib/demo-data";
import { assertScopedOrgAccess } from "@/lib/organization";
import { getSessionContext } from "@/lib/session";
import {
  getLatestDocumentVersionMetadata,
  getSummaryCitationsByDocumentVersion,
  listDocumentVersionTimeline
} from "@internalwiki/db";

export async function GET(
  _request: Request,
  context: { params: Promise<{ orgId: string; docId: string }> }
): Promise<Response> {
  const { orgId, docId } = await context.params;
  const session = await getSessionContext();

  try {
    assertScopedOrgAccess({ session, targetOrgId: orgId, minimumRole: "viewer" });
  } catch (error) {
    return jsonError((error as Error).message, 403);
  }

  const doc = await getDocumentById(orgId, docId);
  if (!doc) {
    return jsonError("Document not found", 404);
  }

  const latestVersion = await getLatestDocumentVersionMetadata(orgId, doc.id);
  const versionTimeline = await listDocumentVersionTimeline(orgId, doc.id, 6);
  const citations = latestVersion
    ? await getSummaryCitationsByDocumentVersion(orgId, latestVersion.id)
    : [];

  await writeAuditEvent({
    organizationId: orgId,
    actorId: session.userId,
    eventType: "provenance.read",
    entityType: "document",
    entityId: doc.id,
    payload: {
      versionId: latestVersion?.id ?? null,
      citations: citations.length
    }
  });

  return jsonOk({
    document: doc,
    latestVersion: latestVersion ?? null,
    versionTimeline,
    citations,
    provenance: {
      sourceType: doc.sourceType,
      sourceUrl: doc.sourceUrl,
      canonicalSourceUrl: doc.canonicalSourceUrl ?? doc.sourceUrl,
      sourceFormat: doc.sourceFormat ?? null,
      sourceExternalId: doc.sourceExternalId ?? null,
      owner: doc.owner,
      ingestedAt: latestVersion?.createdAt ?? doc.updatedAt,
      sourceLastUpdatedAt: latestVersion?.sourceLastUpdatedAt ?? doc.updatedAt,
      sourceVersionLabel: latestVersion?.sourceVersionLabel ?? null,
      sourceChecksum: latestVersion?.sourceChecksum ?? null,
      connectorSyncRunId: latestVersion?.connectorSyncRunId ?? null
    }
  });
}
