import { ReviewActions } from "@/components/review-actions";
import { KnowledgeReviewTaskActions } from "@/components/knowledge-review-task-actions";
import { listKnowledgeReviewTasks, listReviewQueue } from "@internalwiki/db";
import { getSessionContextOptional } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function ReviewPage() {
  const session = await getSessionContextOptional();
  if (!session) {
    redirect("/auth/login?next=%2Fapp%2Freview");
  }

  const [summaryItems, knowledgeTasks] = await Promise.all([
    listReviewQueue(session.organizationId),
    listKnowledgeReviewTasks({ organizationId: session.organizationId, limit: 200 })
  ]);

  return (
    <main className="page-wrap">
      <section className="surface-card">
        <p className="workspace-header__eyebrow">Governance</p>
        <h1 className="surface-title">Review queue</h1>
        <p className="surface-sub">Manage summary approvals and knowledge freshness tasks in one place.</p>
      </section>

      <section className="surface-card">
        <h2 className="surface-title">Summary approvals</h2>
        <p className="surface-sub">Approve or reject generated summaries with explicit review actions.</p>
      </section>

      {summaryItems.map((item) => (
        <section key={item.id} className="surface-card">
          <h3 className="surface-title">{item.summaryId}</h3>
          <p className="surface-sub">Created {new Date(item.createdAt).toLocaleString()}</p>

          <div className="data-grid" style={{ marginTop: "0.7rem" }}>
            <div className="data-pill">Summary ID: {item.summaryId}</div>
            <div className="data-pill">Status: {item.status}</div>
          </div>

          <ReviewActions orgId={session.organizationId} summaryId={item.summaryId} />
        </section>
      ))}

      <section className="surface-card">
        <h2 className="surface-title">Knowledge freshness tasks</h2>
        <p className="surface-sub">Resolve stale, dependency-risk, low-confidence, and canonicalization work.</p>
      </section>

      {knowledgeTasks.length === 0 ? (
        <section className="surface-card">
          <p className="surface-sub">No knowledge tasks currently open.</p>
        </section>
      ) : (
        knowledgeTasks.map((task) => (
          <section key={task.id} className="surface-card">
            <h3 className="surface-title">{task.taskType.replaceAll("_", " ")}</h3>
            <p className="surface-sub">{task.reason}</p>
            <div className="data-grid" style={{ marginTop: "0.7rem" }}>
              <div className="data-pill">Task ID: {task.id}</div>
              <div className="data-pill">Status: {task.status}</div>
              <div className="data-pill">Priority: {task.priority}</div>
              <div className="data-pill">
                Created: {new Date(task.createdAt).toLocaleString()}
              </div>
              {task.knowledgeObjectId ? (
                <div className="data-pill">Knowledge object: {task.knowledgeObjectId}</div>
              ) : null}
            </div>

            <KnowledgeReviewTaskActions orgId={session.organizationId} taskId={task.id} initialStatus={task.status} />
          </section>
        ))
      )}
    </main>
  );
}
