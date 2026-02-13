import { AssistantWorkspace } from "@/components/assistant-workspace";
import { getSessionContextOptional } from "@/lib/session";
import { redirect } from "next/navigation";
import {
  countDocumentsByOrganization,
  getChatThread,
  listConnectorAccounts
} from "@internalwiki/db";

export default async function DashboardPage({
  searchParams
}: {
  searchParams: Promise<{ thread?: string }>;
}) {
  const session = await getSessionContextOptional();
  if (!session) {
    redirect("/auth/login?next=%2Fapp");
  }

  const resolvedSearch = await searchParams;
  const [connectors, documentCount] = await Promise.all([
    listConnectorAccounts(session.organizationId),
    countDocumentsByOrganization(session.organizationId)
  ]);
  const selectedThread = resolvedSearch.thread
    ? await getChatThread(session.organizationId, resolvedSearch.thread)
    : null;

  if (connectors.length === 0) {
    return (
      <main className="page-wrap">
        <section className="surface-card">
          <p className="workspace-header__eyebrow">First run</p>
          <h1 className="surface-title">Connect your first workspace source</h1>
          <p className="surface-sub">
            Add your first source integration to start indexing organization knowledge for grounded answers.
            Current connector catalog includes Google Workspace and Notion.
          </p>
          <a href="/app/settings/connectors" className="ask-submit" style={{ display: "inline-flex", marginTop: "0.8rem" }}>
            Open connector setup
          </a>
        </section>
      </main>
    );
  }

  if (documentCount === 0) {
    return (
      <main className="page-wrap">
        <section className="surface-card">
          <p className="workspace-header__eyebrow">First sync</p>
          <h1 className="surface-title">Run your first sync</h1>
          <p className="surface-sub">
            Your source integrations are configured, but no documents are indexed yet. Trigger sync from connector
            settings.
          </p>
          <a href="/app/settings/connectors" className="ask-submit" style={{ display: "inline-flex", marginTop: "0.8rem" }}>
            View connector health
          </a>
        </section>

        <section className="surface-card">
          <h2 className="surface-title">Connected workspaces</h2>
          <div className="data-grid" style={{ marginTop: "0.7rem" }}>
            {connectors.map((connector) => (
              <div key={connector.id} className="data-pill">
                {(connector.displayName ?? connector.connectorType).toString()} - {connector.status}
              </div>
            ))}
          </div>
        </section>
      </main>
    );
  }

  return (
    <AssistantWorkspace
      orgId={session.organizationId}
      title={selectedThread ? selectedThread.thread.title : "Search your organization knowledge"}
      subtitle={
        selectedThread
          ? `Resumed thread with ${selectedThread.messages.length} prior messages and citations.`
          : "Ask once, get grounded answers with traceable evidence and trust scores."
      }
      defaultMode="ask"
      quickMode
      initialThreadId={selectedThread?.thread.id}
      initialMessages={
        selectedThread
          ? selectedThread.messages.map((message) => ({
              id: message.id,
              role: message.role,
              content: message.messageText,
              citations: message.citations,
              confidence: message.confidence,
              sourceScore: message.sourceScore,
              threadId: selectedThread.thread.id,
              messageId: message.role === "assistant" ? message.id : undefined
            }))
          : undefined
      }
    />
  );
}
