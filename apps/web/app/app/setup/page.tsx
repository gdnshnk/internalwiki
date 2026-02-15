import { getSessionContextOptional } from "@/lib/session";
import { getSetupStatus } from "@/lib/setup-status";
import { redirect } from "next/navigation";
import { getAnswerQualityContractSummary } from "@internalwiki/db";

function statusLabel(value: "passed" | "blocked"): string {
  return value === "blocked" ? "Needs attention" : "Pass";
}

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
  const contract = await getAnswerQualityContractSummary(session.organizationId);

  return (
    <main className="page-wrap">
      <section className="surface-card">
        <p className="workspace-header__eyebrow">Setup</p>
        <h1 className="surface-title">Complete setup before asking</h1>
        <p className="surface-sub">
          InternalWiki is running. Finish these steps so answers are cited, up to date, and access-aware.
        </p>
      </section>

      <section className="surface-card">
        <h2 className="surface-title">Readiness checklist</h2>
        <div className="data-grid" style={{ marginTop: "0.8rem" }}>
          <div className="data-pill">Connected source: {status.steps.connected ? "Yes" : "No"}</div>
          <div className="data-pill">First sync complete: {status.steps.firstSyncComplete ? "Yes" : "No"}</div>
          <div className="data-pill">Access checks: {status.steps.permissionMappingComplete ? "Yes" : "No"}</div>
          <div className="data-pill">Assistant ready: {status.steps.aiReady ? "Yes" : "No"}</div>
        </div>

        <div className="chip-row" style={{ marginTop: "0.9rem" }}>
          <a href="/app/settings/connectors" className="ask-submit">
            Open source setup
          </a>
          <a href="/app/settings/security" className="chip chip--active setup-permissions-cta">
            Check access
          </a>
        </div>
      </section>

      <section className="surface-card">
        <h2 className="surface-title">Answer quality standards</h2>
        <p className="surface-sub">
          Answers are shown only when evidence quality, source recency, and access protection checks pass.
        </p>

        <div className="data-grid" style={{ marginTop: "0.8rem" }}>
          <div className="data-pill">Evidence quality pass rate (7d): {contract.rolling7d.groundednessPassRate.toFixed(2)}%</div>
          <div className="data-pill">Source recency pass rate (7d): {contract.rolling7d.freshnessPassRate.toFixed(2)}%</div>
          <div className="data-pill">
            Access protection pass rate (7d): {contract.rolling7d.permissionSafetyPassRate.toFixed(2)}%
          </div>
          <div className="data-pill">Answers held for review (7d): {contract.rolling7d.blocked}</div>
          {contract.latest ? (
            <div className="data-pill">
              Latest status: {statusLabel(contract.latest.groundednessStatus)}/
              {statusLabel(contract.latest.freshnessStatus)}/{statusLabel(contract.latest.permissionSafetyStatus)}
            </div>
          ) : (
            <div className="data-pill">Latest status: No checks yet</div>
          )}
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
