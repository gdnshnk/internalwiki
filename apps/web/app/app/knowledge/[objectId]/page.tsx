import { getSessionContextOptional } from "@/lib/session";
import { redirect, notFound } from "next/navigation";
import {
  getKnowledgeObjectById,
  listKnowledgeObjectDependencies,
  listKnowledgeObjectPermissionRules,
  listKnowledgeObjectReviewers,
  listKnowledgeObjectTags,
  listKnowledgeObjectVersions
} from "@internalwiki/db";

export default async function KnowledgeObjectPage({
  params
}: {
  params: Promise<{ objectId: string }>;
}) {
  const session = await getSessionContextOptional();
  if (!session) {
    redirect("/auth/login");
  }

  const { objectId } = await params;
  const [item, reviewers, tags, dependencies, permissionRules, versions] = await Promise.all([
    getKnowledgeObjectById(session.organizationId, objectId),
    listKnowledgeObjectReviewers({ organizationId: session.organizationId, knowledgeObjectId: objectId }),
    listKnowledgeObjectTags({ organizationId: session.organizationId, knowledgeObjectId: objectId }),
    listKnowledgeObjectDependencies({ organizationId: session.organizationId, knowledgeObjectId: objectId }),
    listKnowledgeObjectPermissionRules({ organizationId: session.organizationId, knowledgeObjectId: objectId }),
    listKnowledgeObjectVersions({ organizationId: session.organizationId, knowledgeObjectId: objectId, limit: 30 })
  ]);

  if (!item) {
    notFound();
  }

  const latestVersion = versions[0];

  return (
    <main className="page-wrap">
      <section className="surface-card">
        <p className="workspace-header__eyebrow">Knowledge object</p>
        <h1 className="surface-title">{item.title}</h1>
        <p className="surface-sub">{item.slug}</p>

        <div className="data-grid" style={{ marginTop: "0.8rem" }}>
          <div className="data-pill">Freshness: {item.freshnessStatus}</div>
          <div className="data-pill">Source type: {item.sourceType}</div>
          <div className="data-pill">Owner: {item.ownerUserId}</div>
          <div className="data-pill">Review every: {item.reviewIntervalDays} days</div>
          <div className="data-pill">Review due: {new Date(item.reviewDueAt).toLocaleString()}</div>
          <div className="data-pill">Confidence: {Math.round(item.confidenceScore * 100)}%</div>
        </div>
      </section>

      <section className="surface-card">
        <h2 className="surface-title">Latest content</h2>
        {latestVersion ? (
          <>
            <p className="surface-sub">Version {latestVersion.versionNumber}</p>
            <pre className="surface-sub" style={{ whiteSpace: "pre-wrap", marginTop: "0.8rem" }}>
              {latestVersion.contentMarkdown}
            </pre>
          </>
        ) : (
          <p className="surface-sub">No versions published yet.</p>
        )}
      </section>

      <section className="surface-card">
        <h2 className="surface-title">Ownership and policy</h2>
        <div className="data-grid" style={{ marginTop: "0.8rem" }}>
          <div className="data-pill">Reviewers: {reviewers.length}</div>
          <div className="data-pill">Tags: {tags.length}</div>
          <div className="data-pill">Dependencies: {dependencies.length}</div>
          <div className="data-pill">Permission rules: {permissionRules.length}</div>
        </div>

        {tags.length > 0 ? (
          <p className="surface-sub" style={{ marginTop: "0.8rem" }}>
            Tags: {tags.map((tag) => tag.name).join(", ")}
          </p>
        ) : null}
      </section>

      <section className="surface-card">
        <h2 className="surface-title">Version history</h2>
        {versions.length === 0 ? (
          <p className="surface-sub">No versions available.</p>
        ) : (
          <div className="data-grid" style={{ marginTop: "0.8rem" }}>
            {versions.map((version) => (
              <div key={version.id} className="data-pill">
                v{version.versionNumber} - {new Date(version.createdAt).toLocaleString()}
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
