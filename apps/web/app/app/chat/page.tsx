import { AssistantWorkspace } from "@/components/assistant-workspace";
import { getSessionContextOptional } from "@/lib/session";
import { redirect } from "next/navigation";
import { getChatThread } from "@internalwiki/db";

export default async function ChatPage({
  searchParams
}: {
  searchParams: Promise<{ thread?: string }>;
}) {
  const session = await getSessionContextOptional();
  if (!session) {
    redirect("/auth/login?next=%2Fapp%2Fchat");
  }

  const resolvedSearch = await searchParams;
  const selectedThread = resolvedSearch.thread
    ? await getChatThread(session.organizationId, resolvedSearch.thread)
    : null;

  return (
    <AssistantWorkspace
      orgId={session.organizationId}
      title={selectedThread ? selectedThread.thread.title : "Threaded assistant workspace"}
      subtitle={
        selectedThread
          ? `Continue with cited context from ${selectedThread.messages.length} prior messages.`
          : "Follow up across decisions, runbooks, and requirements without losing source traceability."
      }
      defaultMode="ask"
      quickMode={false}
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
