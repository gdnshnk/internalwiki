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
        <h1 className="surface-title">Knowledge library</h1>
        <p className="surface-sub">
          Keep key company knowledge reviewed, versioned, and current. Open any item to see history and ownership.
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
          <h2 className="surface-title">No knowledge items yet</h2>
          <p className="surface-sub">
            Your team has not published any knowledge items yet.
          </p>
        </section>
      ) : (
        items.map((item) => (
          <section key={item.id} className="surface-card">
            <h2 className="surface-title">{item.title}</h2>
            <p className="surface-sub">{item.slug}</p>
            <div className="data-grid" style={{ marginTop: "0.7rem" }}>
              <div className="data-pill">Freshness: {item.freshnessStatus}</div>
              <div className="data-pill">Owner: Assigned</div>
              <div className="data-pill">Review due: {new Date(item.reviewDueAt).toLocaleString()}</div>
              <div className="data-pill">Confidence: {Math.round(item.confidenceScore * 100)}%</div>
            </div>
            <a href={`/app/knowledge/${item.id}`} className="ask-submit" style={{ display: "inline-flex", marginTop: "0.8rem" }}>
              Open knowledge item
            </a>
          </section>
        ))
      )}
    </main>
  );
}
