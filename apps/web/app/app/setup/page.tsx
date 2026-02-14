import { getSessionContextOptional } from "@/lib/session";
import { getSetupStatus } from "@/lib/setup-status";
import { redirect } from "next/navigation";

export default async function SetupPage() {
  const session = await getSessionContextOptional();
  if (!session) {
    redirect("/auth/login?next=%2Fapp%2Fsetup");
  }

  const status = await getSetupStatus({
    organizationId: session.organizationId,
    userId: session.userId,
    userEmail: session.email
  });

  if (status.readyToAsk) {
    redirect("/app");
  }

  return (
    <main className="page-wrap">
      <section className="surface-card">
        <p className="workspace-header__eyebrow">Setup</p>
        <h1 className="surface-title">Complete setup before asking</h1>
        <p className="surface-sub">
          InternalWiki is running. Finish these steps to ensure citations, permissions, and verification checks are
          operational.
        </p>
      </section>

      <section className="surface-card">
        <h2 className="surface-title">Readiness checklist</h2>
        <div className="data-grid" style={{ marginTop: "0.8rem" }}>
          <div className="data-pill">Connected source: {status.steps.connected ? "Yes" : "No"}</div>
          <div className="data-pill">First sync complete: {status.steps.firstSyncComplete ? "Yes" : "No"}</div>
          <div className="data-pill">
            Permission mapping: {status.steps.permissionMappingComplete ? "Yes" : "No"}
          </div>
          <div className="data-pill">AI ready: {status.steps.aiReady ? "Yes" : "No"}</div>
        </div>

        <div className="chip-row" style={{ marginTop: "0.9rem" }}>
          <a href="/app/settings/connectors" className="ask-submit">
            Open source setup
          </a>
          <a href="/app/settings/security" className="chip chip--active">
            Permissions diagnostics
          </a>
        </div>
      </section>

      <section className="surface-card">
        <h2 className="surface-title">Current blockers</h2>
        {status.blockers.length === 0 ? (
          <p className="surface-sub">No blockers detected.</p>
        ) : (
          <ul className="marketing-list" style={{ marginTop: "0.7rem" }}>
            {status.blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
