import type { ReactNode } from "react";
import { AssistantShell } from "@/components/assistant-shell";
import { getSessionContextOptional } from "@/lib/session";
import { listChatThreads } from "@internalwiki/db";

export default async function ProductLayout({ children }: { children: ReactNode }) {
  const session = await getSessionContextOptional();
  const recentThreads = session ? await listChatThreads(session.organizationId, 8) : [];

  return <AssistantShell recentThreads={recentThreads}>{children}</AssistantShell>;
}
