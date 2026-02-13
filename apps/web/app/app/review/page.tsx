import { ReviewActions } from "@/components/review-actions";
import { listReviewQueue } from "@internalwiki/db";
import { getSessionContextOptional } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function ReviewPage() {
  const session = await getSessionContextOptional();
  if (!session) {
    redirect("/auth/login?next=%2Fapp%2Freview");
  }

  const items = await listReviewQueue(session.organizationId);

  return (
    <main className="page-wrap">
      <section className="surface-card">
        <p className="workspace-header__eyebrow">Governance</p>
        <h1 className="surface-title">Summary review queue</h1>
        <p className="surface-sub">Approve or reject generated summaries with explicit diffs and auditability.</p>
      </section>

      {items.map((item) => (
        <section key={item.id} className="surface-card">
          <h2 className="surface-title">{item.summaryId}</h2>
          <p className="surface-sub">Created {new Date(item.createdAt).toLocaleString()}</p>

          <div className="data-grid" style={{ marginTop: "0.7rem" }}>
            <div className="data-pill">Summary ID: {item.summaryId}</div>
            <div className="data-pill">Status: {item.status}</div>
          </div>

          <ReviewActions orgId={session.organizationId} summaryId={item.summaryId} />
        </section>
      ))}
    </main>
  );
}
