import { AssistantWorkspace } from "@/components/assistant-workspace";
import { AppOnboardingChecklist } from "@/components/app-onboarding-checklist";
import { getSessionContextOptional } from "@/lib/session";
import { getSetupStatus } from "@/lib/setup-status";
import { redirect } from "next/navigation";
import {
  countDocumentsByOrganization,
  getChatThread,
  getUserOnboardingCompletedAt,
  listChatThreads,
  listConnectorAccounts
} from "@internalwiki/db";

export default async function DashboardPage({
  searchParams
}: {
  searchParams: Promise<{ thread?: string; onboarding?: string }>;
}) {
  const session = await getSessionContextOptional();
  if (!session) {
    redirect("/auth/login?next=%2Fapp");
  }

  const resolvedSearch = await searchParams;
  const setupStatus = await getSetupStatus({
    organizationId: session.organizationId,
    userId: session.userId,
    userEmail: session.email
  });
  if (!setupStatus.readyToAsk) {
    redirect("/app/setup");
  }

  const [connectors, documentCount, latestThreads, onboardingCompletedAt, selectedThread] = await Promise.all([
    listConnectorAccounts(session.organizationId),
    countDocumentsByOrganization(session.organizationId),
    listChatThreads(session.organizationId, 1),
    getUserOnboardingCompletedAt(session.userId),
    resolvedSearch.thread ? getChatThread(session.organizationId, resolvedSearch.thread) : Promise.resolve(null)
  ]);
  const forceOnboarding = resolvedSearch.onboarding === "1";
  const onboardingProgress = {
    connected: connectors.length > 0,
    synced: documentCount > 0,
    askedFirstQuestion: latestThreads.length > 0
  };
  const onboardingCard = (
    <AppOnboardingChecklist
      forced={forceOnboarding}
      initialCompleted={Boolean(onboardingCompletedAt)}
      progress={onboardingProgress}
    />
  );

  if (connectors.length === 0) {
    return (
      <main className="page-wrap">
        {onboardingCard}
        <section className="surface-card">
          <p className="workspace-header__eyebrow">First run</p>
          <h1 className="surface-title">Connect your first workspace source</h1>
          <p className="surface-sub">
            Connect your first integration to start indexing company knowledge.
            Available integrations include Google Workspace, Slack, and Microsoft 365.
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
        {onboardingCard}
        <section className="surface-card">
          <p className="workspace-header__eyebrow">First sync</p>
          <h1 className="surface-title">Run your first sync</h1>
          <p className="surface-sub">
            Your integrations are connected, but no content is indexed yet. Start a sync from integration settings.
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
    <main className="page-wrap">
      {onboardingCard}
      <AssistantWorkspace
        orgId={session.organizationId}
        title={selectedThread ? selectedThread.thread.title : "Search your organization knowledge"}
        subtitle={
          selectedThread
            ? `Resumed thread with ${selectedThread.messages.length} prior messages and citations.`
            : "Ask questions and get cited, access-aware answers from your connected knowledge."
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
    </main>
  );
}
