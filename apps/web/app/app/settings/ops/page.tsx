import { getSloSummary, listIncidentEvents } from "@internalwiki/db";
import { assertScopedOrgAccess } from "@/lib/organization";
import { getSessionContextOptional } from "@/lib/session";
import { redirect } from "next/navigation";

function metricLabel(name: string): string {
  switch (name) {
    case "api_availability":
      return "API availability";
    case "assist_latency_p95_ms":
      return "Assistant latency p95";
    case "sync_success_rate":
      return "Sync success rate";
    case "queue_lag_seconds":
      return "Queue lag";
    default:
      return name;
  }
}

function formatMetricValue(value: number, unit: string): string {
  if (unit === "percent") {
    return `${value.toFixed(2)}%`;
  }
  if (unit === "milliseconds") {
    return `${Math.round(value)}ms`;
  }
  return `${Math.round(value)}s`;
}

export default async function OpsSettingsPage() {
  const session = await getSessionContextOptional();
  if (!session) {
    redirect("/auth/login?next=%2Fapp%2Fsettings%2Fops");
  }
  try {
    assertScopedOrgAccess({
      session,
      targetOrgId: session.organizationId,
      minimumRole: "admin"
    });
  } catch {
    redirect("/app");
  }

  const [slo, incidents] = await Promise.all([
    getSloSummary(session.organizationId),
    listIncidentEvents(session.organizationId, 30)
  ]);

  return (
    <main className="page-wrap">
      <section className="surface-card">
        <p className="workspace-header__eyebrow">Operations</p>
        <h1 className="surface-title">Reliability and incident posture</h1>
        <p className="surface-sub">
          Track SLO health, burn-rate pressure, and open incidents across connectors, queue throughput, and assistant
          response paths.
        </p>
      </section>

      <section className="surface-card">
        <h2 className="surface-title">SLO summary</h2>
        <div className="data-grid" style={{ marginTop: "0.8rem" }}>
          <div className="data-pill">Burn rate: {slo.burnRate.toFixed(2)}</div>
          <div className="data-pill">Open incidents: {slo.openIncidentCount}</div>
          <div className="data-pill">Generated: {new Date(slo.generatedAt).toLocaleString()}</div>
        </div>

        <div className="data-grid" style={{ marginTop: "0.8rem" }}>
          {slo.metrics.map((metric) => (
            <div key={metric.name} className="data-pill">
              {metricLabel(metric.name)} · {formatMetricValue(metric.actual, metric.unit)} / target{" "}
              {formatMetricValue(metric.target, metric.unit)} · {metric.status.toUpperCase()}
            </div>
          ))}
        </div>
      </section>

      <section className="surface-card">
        <h2 className="surface-title">Incident feed</h2>
        <div className="data-grid" style={{ marginTop: "0.8rem" }}>
          {incidents.length === 0 ? (
            <div className="data-pill">No incident events recorded</div>
          ) : (
            incidents.map((incident) => (
              <div key={incident.id} className="data-pill">
                {incident.severity.toUpperCase()} · {incident.status.toUpperCase()} · {incident.summary}
              </div>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
