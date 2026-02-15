import { listConnectorAccounts, listConnectorSyncRuns } from "@internalwiki/db";
import { ConnectorOnboardingManager } from "@/components/connector-onboarding-manager";
import { getSessionContextOptional } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function ConnectorSettingsPage() {
  const session = await getSessionContextOptional();
  if (!session) {
    redirect("/auth/login?next=%2Fapp%2Fsettings%2Fconnectors");
  }

  const connectors = await listConnectorAccounts(session.organizationId);
  const latestRuns = await Promise.all(
    connectors.map(async (connector) => {
      const runs = await listConnectorSyncRuns(session.organizationId, connector.id, 6);
      return [connector.id, runs] as const;
    })
  );
  const initialRunsByConnector = Object.fromEntries(latestRuns);

  return (
    <main className="page-wrap">
      <section className="surface-card">
        <p className="workspace-header__eyebrow">Connectors</p>
        <h1 className="surface-title">Workspace integrations</h1>
        <p className="surface-sub">
          Manage connected workspace sources, sync status, and re-auth controls. Current catalog includes Google
          Workspace, Slack, and Microsoft 365. New OAuth connections automatically start first sync.
        </p>
      </section>

      <ConnectorOnboardingManager
        orgId={session.organizationId}
        initialConnectors={connectors.map((connector) => ({
          id: connector.id,
          organizationId: connector.organizationId,
          connectorType: connector.connectorType,
          status: connector.status,
          tokenExpiresAt: connector.tokenExpiresAt,
          syncCursor: connector.syncCursor,
          lastSyncedAt: connector.lastSyncedAt,
          displayName: connector.displayName,
          externalWorkspaceId: connector.externalWorkspaceId,
          hasRefreshToken: Boolean(connector.encryptedRefreshToken),
          createdAt: connector.createdAt,
          updatedAt: connector.updatedAt
        }))}
        initialRunsByConnector={initialRunsByConnector}
      />
    </main>
  );
}
