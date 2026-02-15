import { getSessionContextOptional } from "@/lib/session";
import { redirect } from "next/navigation";
import { getKnowledgeFreshnessDashboard, listKnowledgeObjects } from "@internalwiki/db";

export default async function KnowledgePage() {
  const session = await getSessionContextOptional();
  if (!session) {
    redirect("/auth/login?next=%2Fapp%2Fknowledge");
  }

  const [items, dashboard] = await Promise.all([
    listKnowledgeObjects({ organizationId: session.organizationId, limit: 100 }),
    getKnowledgeFreshnessDashboard(session.organizationId)
  ]);

  return (
    <main className="page-wrap">
      <section className="surface-card">
        <p className="workspace-header__eyebrow">Knowledge</p>
        <h1 className="surface-title">Versioned knowledge objects</h1>
        <p className="surface-sub">
          Internal truth is owner-assigned, review-scheduled, and freshness-scored. Open an object to inspect versions,
          dependencies, and permission rules.
        </p>

        <div className="data-grid" style={{ marginTop: "0.8rem" }}>
          <div className="data-pill">Fresh: {dashboard.counts.fresh}</div>
          <div className="data-pill">At risk: {dashboard.counts.atRisk}</div>
          <div className="data-pill">Stale: {dashboard.counts.stale}</div>
          <div className="data-pill">Overdue review tasks: {dashboard.overdueReviews}</div>
          <div className="data-pill">Dependency risk tasks: {dashboard.dependencyAtRisk}</div>
          <div className="data-pill">Low confidence tasks: {dashboard.lowConfidenceOpen}</div>
        </div>
      </section>

      {items.length === 0 ? (
        <section className="surface-card">
          <h2 className="surface-title">No knowledge objects yet</h2>
          <p className="surface-sub">
            Create your first object via API at <code>/api/orgs/{session.organizationId}/knowledge/objects</code>.
          </p>
        </section>
      ) : (
        items.map((item) => (
          <section key={item.id} className="surface-card">
            <h2 className="surface-title">{item.title}</h2>
            <p className="surface-sub">{item.slug}</p>
            <div className="data-grid" style={{ marginTop: "0.7rem" }}>
              <div className="data-pill">Freshness: {item.freshnessStatus}</div>
              <div className="data-pill">Owner: {item.ownerUserId}</div>
              <div className="data-pill">Review due: {new Date(item.reviewDueAt).toLocaleString()}</div>
              <div className="data-pill">Confidence: {Math.round(item.confidenceScore * 100)}%</div>
            </div>
            <a href={`/app/knowledge/${item.id}`} className="ask-submit" style={{ display: "inline-flex", marginTop: "0.8rem" }}>
              Open knowledge object
            </a>
          </section>
        ))
      )}
    </main>
  );
}
