import { notFound, redirect } from "next/navigation";
import { getDocumentById } from "@/lib/demo-data";
import { getSessionContextOptional } from "@/lib/session";
import {
  getLatestDocumentVersionMetadata,
  getSummaryCitationsByDocumentVersion,
  listDocumentVersionTimeline,
  getDocumentVersionContent
} from "@internalwiki/db";
import { DocumentViewer } from "@/components/document-viewer";

export default async function DocumentPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSessionContextOptional();
  if (!session) {
    redirect(`/auth/login?next=${encodeURIComponent(`/app/documents/${id}`)}`);
  }

  const doc = await getDocumentById(session.organizationId, id);
  const latestVersion = doc ? await getLatestDocumentVersionMetadata(session.organizationId, doc.id) : null;
  const versionTimeline = doc ? await listDocumentVersionTimeline(session.organizationId, doc.id, 8) : [];
  const citations = latestVersion
    ? await getSummaryCitationsByDocumentVersion(session.organizationId, latestVersion.id)
    : [];
  const documentContent = latestVersion
    ? await getDocumentVersionContent(session.organizationId, latestVersion.id)
    : null;

  if (!doc) {
    notFound();
  }

  return (
    <main className="page-wrap">
      <section className="surface-card">
        <p className="workspace-header__eyebrow">Document</p>
        <h1 className="surface-title">{doc.title}</h1>
        <p className="surface-sub">
          {doc.sourceType} • Updated {new Date(latestVersion?.sourceLastUpdatedAt ?? doc.updatedAt).toLocaleString()}
        </p>
      </section>

      <section className="surface-card">
        <h2 className="surface-title">Grounded summary</h2>
        <p className="surface-sub">{doc.summary}</p>
      </section>

      {documentContent ? (
        <section className="surface-card">
          <h2 className="surface-title">Document Content</h2>
          <DocumentViewer
            content={documentContent.content}
            citations={citations}
            highlightCitations={citations.length > 0}
          />
        </section>
      ) : null}

      <section className="surface-card">
        <h3 className="surface-title">Provenance</h3>
        <div className="data-grid">
          <div className="data-pill">Version: {latestVersion?.id ?? "not available"}</div>
          <div className="data-pill">Citations: {citations.length}</div>
          <div className="data-pill">Author: {doc.owner}</div>
          <div className="data-pill">Source: {doc.sourceType}</div>
          <div className="data-pill">Format: {doc.sourceFormat ?? "unknown"}</div>
          <div className="data-pill">External ID: {doc.sourceExternalId ?? "not available"}</div>
          <div className="data-pill">Sync run: {latestVersion?.connectorSyncRunId ?? "not available"}</div>
          <div className="data-pill">Checksum: {latestVersion?.sourceChecksum ?? "not available"}</div>
          <a className="data-pill" href={doc.canonicalSourceUrl ?? doc.sourceUrl} target="_blank" rel="noreferrer">
            Open source
          </a>
        </div>
      </section>

      <section className="surface-card">
        <h3 className="surface-title">Version timeline</h3>
        <div className="data-grid">
          {versionTimeline.length > 0 ? (
            versionTimeline.map((version) => (
              <div key={version.id} className="data-pill">
                <strong>{version.sourceVersionLabel ?? version.id}</strong>
                <div>Ingested: {new Date(version.createdAt).toLocaleString()}</div>
                <div>Source updated: {new Date(version.sourceLastUpdatedAt ?? version.createdAt).toLocaleString()}</div>
                <div>Run: {version.connectorSyncRunId ?? "n/a"}</div>
              </div>
            ))
          ) : (
            <div className="data-pill">No version history available yet.</div>
          )}
        </div>
      </section>

      <section className="surface-card">
        <h3 className="surface-title">Trust factors</h3>
        <div className="data-grid">
          <div className="data-pill">Recency: {(doc.sourceScore?.factors.recency ?? 0).toFixed(2)}</div>
          <div className="data-pill">
            Source authority: {(doc.sourceScore?.factors.sourceAuthority ?? 0).toFixed(2)}
          </div>
          <div className="data-pill">Author authority: {(doc.sourceScore?.factors.authorAuthority ?? 0).toFixed(2)}</div>
          <div className="data-pill">
            Citation coverage: {(doc.sourceScore?.factors.citationCoverage ?? 0).toFixed(2)}
          </div>
        </div>
        <p className="surface-sub">Total source score: {doc.sourceScore?.total ?? 0}</p>
      </section>
    </main>
  );
}
