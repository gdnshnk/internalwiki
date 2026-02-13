import { ReactNode } from "react";
import { AssistantShell } from "@/components/assistant-shell";

// Legacy wrapper retained for compatibility with old imports.
export function AppShell({ children }: { children: ReactNode }): ReactNode {
  return <AssistantShell recentThreads={[]}>{children}</AssistantShell>;
}
