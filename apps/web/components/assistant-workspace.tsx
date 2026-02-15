"use client";

import { useEffect, useMemo, useState } from "react";
import type { AssistantMode, AssistantQueryResponse, AssistantQueryStreamEvent, Citation } from "@internalwiki/core";
import { AskComposer } from "@/components/ask-composer";
import { EvidenceRail } from "@/components/evidence-rail";
import { MessageStream, type AssistantStreamMessage } from "@/components/message-stream";
import type { SourceFilterValue } from "@/components/source-filter-chips";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const modeCopy: Record<
  AssistantMode,
  {
    launchPlaceholder: string;
    threadPlaceholder: string;
    quickPrompts: string[];
  }
> = {
  ask: {
    launchPlaceholder: "Ask for a cited summary of policies, owners, or decisions...",
    threadPlaceholder: "Refine your summary request or compare evidence...",
    quickPrompts: [
      "Summarize what changed in onboarding SOP this month.",
      "Summarize which teams own launch blockers this week.",
      "Summarize our latest incident escalation policy."
    ]
  },
  summarize: {
    launchPlaceholder: "Summarize a topic into cited key points...",
    threadPlaceholder: "Refine summary by audience or timeframe...",
    quickPrompts: [
      "Summarize current product launch blockers and owners.",
      "Summarize support handoff process with responsible teams.",
      "Summarize Q1 planning decisions and tradeoffs."
    ]
  },
  trace: {
    launchPlaceholder: "Summarize claim traceability with exact source evidence...",
    threadPlaceholder: "Trace another claim and summarize supporting evidence...",
    quickPrompts: [
      "Summarize traceability for incident severity classification policy.",
      "Summarize who approved the latest pricing exceptions with citations.",
      "Summarize the origin of the current security review checklist."
    ]
  }
};

async function* parseSseEvents(response: Response): AsyncGenerator<AssistantQueryStreamEvent, void, void> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Streaming response body is unavailable");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    let boundaryIndex = buffer.indexOf("\n\n");
    while (boundaryIndex >= 0) {
      const packet = buffer.slice(0, boundaryIndex);
      buffer = buffer.slice(boundaryIndex + 2);

      for (const line of packet.split("\n")) {
        if (!line.startsWith("data:")) {
          continue;
        }

        const payload = line.slice(5).trim();
        if (!payload) {
          continue;
        }

        yield JSON.parse(payload) as AssistantQueryStreamEvent;
      }

      boundaryIndex = buffer.indexOf("\n\n");
    }
  }
}

export function AssistantWorkspace(props: {
  orgId: string;
  title: string;
  subtitle: string;
  defaultMode?: AssistantMode;
  quickMode?: boolean;
  initialThreadId?: string;
  initialMessages?: AssistantStreamMessage[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<AssistantMode>(props.defaultMode ?? "ask");
  const [sourceFilter, setSourceFilter] = useState<SourceFilterValue>("all");
  const [allowHistoricalEvidence, setAllowHistoricalEvidence] = useState(false);
  const [messages, setMessages] = useState<AssistantStreamMessage[]>(props.initialMessages ?? []);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(props.initialThreadId ?? null);
  const [sources, setSources] = useState<AssistantQueryResponse["sources"]>([]);
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [mobileEvidenceOpen, setMobileEvidenceOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [firstTokenMs, setFirstTokenMs] = useState<number | null>(null);
  const [completionMs, setCompletionMs] = useState<number | null>(null);
  const activeModeCopy = modeCopy[mode];

  useEffect(() => {
    setMessages(props.initialMessages ?? []);
    setActiveThreadId(props.initialThreadId ?? null);
    setSources([]);
    setActiveSourceId(null);
    setError(null);
    setFirstTokenMs(null);
    setCompletionMs(null);
  }, [props.initialMessages, props.initialThreadId]);

  const hasConversation = messages.length > 0;

  const titleBlock = useMemo(
    () => (
      <header className="workspace-header">
        <p className="workspace-header__eyebrow">Assistant</p>
        <h1>{props.title}</h1>
        <p>{props.subtitle}</p>
      </header>
    ),
    [props.subtitle, props.title]
  );

  async function submitQuery(forcedQuery?: string): Promise<void> {
    const nextQuery = (forcedQuery ?? query).trim();
    if (nextQuery.length < 2 || loading) {
      return;
    }

    setError(null);
    setLoading(true);
    setFirstTokenMs(null);
    setCompletionMs(null);

    const userMessageId = `user-${Date.now()}`;
    const streamAssistantMessageId = `assistant-stream-${Date.now()}`;

    setMessages((prev) => [
      ...prev,
      {
        id: userMessageId,
        role: "user",
        content: nextQuery
      },
      {
        id: streamAssistantMessageId,
        role: "assistant",
        content: ""
      }
    ]);

    setQuery("");

    try {
      const response = await fetch(`/api/orgs/${props.orgId}/assist/query?stream=1`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: nextQuery,
          mode,
          allowHistoricalEvidence,
          threadId: activeThreadId ?? undefined,
          filters: sourceFilter === "all" ? undefined : { sourceType: sourceFilter }
        })
      });

      if (!response.ok) {
        throw new Error(`Assistant query failed (${response.status})`);
      }

      let completedPayload: AssistantQueryResponse | null = null;

      for await (const event of parseSseEvents(response)) {
        if (event.type === "sources") {
          setSources(event.sources);
          setActiveSourceId(event.sources[0]?.id ?? null);
          continue;
        }

        if (event.type === "chunk") {
          if (typeof event.firstTokenMs === "number") {
            setFirstTokenMs(event.firstTokenMs);
          }

          setMessages((prev) =>
            prev.map((message) =>
              message.id === streamAssistantMessageId
                ? {
                    ...message,
                    content: `${message.content}${event.text}`
                  }
                : message
            )
          );
          continue;
        }

        if (event.type === "complete") {
          completedPayload = event.payload;
          setCompletionMs(event.completionMs);
          if (event.payload.threadId) {
            const isNewThread = !activeThreadId || activeThreadId !== event.payload.threadId;
            setActiveThreadId(event.payload.threadId);

            const params = new URLSearchParams(searchParams?.toString() ?? "");
            params.set("thread", event.payload.threadId);
            const nextUrl = `${pathname}?${params.toString()}`;
            router.replace(nextUrl, { scroll: false });
            if (isNewThread) {
              router.refresh();
            }
          }

          setMessages((prev) =>
            prev.map((message) =>
              message.id === streamAssistantMessageId
                ? {
                    ...message,
                    content: event.payload.answer,
                    citations: event.payload.citations,
                    confidence: event.payload.confidence,
                    sourceScore: event.payload.sourceScore,
                    model: event.payload.model,
                    threadId: event.payload.threadId,
                    messageId: event.payload.messageId,
                    retrievalMs: event.payload.timings.retrievalMs,
                    generationMs: event.payload.timings.generationMs,
                    citationCoverage: event.payload.grounding.citationCoverage,
                    claims: event.payload.claims,
                    traceabilityCoverage: event.payload.traceability.coverage,
                    missingAuthorCount: event.payload.traceability.missingAuthorCount,
                    missingDateCount: event.payload.traceability.missingDateCount,
                    verificationStatus: event.payload.verification.status,
                    verificationReasons: event.payload.verification.reasons,
                    permissionFilteredOutCount: event.payload.permissions.filteredOutCount,
                    qualityContract: event.payload.qualityContract
                  }
                : message
            )
          );
          continue;
        }

        if (event.type === "error") {
          throw new Error(event.message);
        }
      }

      if (!completedPayload) {
        throw new Error("Streaming query completed without payload");
      }
    } catch (requestError) {
      const message = (requestError as Error).message;
      setError(`${message}. Try retrying or broadening source filters.`);
      setMessages((prev) =>
        prev.map((entry) =>
          entry.id === streamAssistantMessageId
            ? {
                ...entry,
                content: "I couldn't produce a grounded answer. Try a broader query or remove source filters."
              }
            : entry
        )
      );
    } finally {
      setLoading(false);
    }
  }

  async function submitFeedback(input: { threadId: string; messageId: string; vote: "up" | "down" }): Promise<void> {
    const reason = input.vote === "down" ? window.prompt("Optional: what was missing or incorrect?") ?? undefined : undefined;

    await fetch(`/api/orgs/${props.orgId}/assist/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        threadId: input.threadId,
        messageId: input.messageId,
        vote: input.vote,
        reason
      })
    }).catch(() => undefined);
  }

  function onCitationClick(citation: Citation): void {
    const source = sources.find((item) => item.citation.chunkId === citation.chunkId);
    if (source) {
      setActiveSourceId(source.id);
      if (window.matchMedia("(max-width: 900px)").matches) {
        setMobileEvidenceOpen(true);
      }
    }
  }

  return (
    <main className="assistant-workspace">
      <section className="assistant-main">
        {!hasConversation ? titleBlock : null}

        {!hasConversation ? (
          <div className="launch-state">
            <AskComposer
              value={query}
              mode={mode}
              sourceFilter={sourceFilter}
              allowHistoricalEvidence={allowHistoricalEvidence}
              loading={loading}
              onValueChange={setQuery}
              onModeChange={setMode}
              onSourceFilterChange={setSourceFilter}
              onAllowHistoricalEvidenceChange={setAllowHistoricalEvidence}
              onSubmit={() => void submitQuery()}
              placeholder={activeModeCopy.launchPlaceholder}
            />

            {props.quickMode ?? true ? (
              <div className="quick-prompts">
                {activeModeCopy.quickPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    className="quick-prompts__item"
                    onClick={() => void submitQuery(prompt)}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <>
            <AskComposer
              value={query}
              mode={mode}
              sourceFilter={sourceFilter}
              allowHistoricalEvidence={allowHistoricalEvidence}
              loading={loading}
              sticky
              onValueChange={setQuery}
              onModeChange={setMode}
              onSourceFilterChange={setSourceFilter}
              onAllowHistoricalEvidenceChange={setAllowHistoricalEvidence}
              onSubmit={() => void submitQuery()}
              placeholder={activeModeCopy.threadPlaceholder}
            />

            {error ? <p className="error-banner">{error}</p> : null}

            <MessageStream
              loading={loading}
              messages={messages}
              firstTokenMs={firstTokenMs}
              completionMs={completionMs}
              onCitationClick={onCitationClick}
              onFeedback={(input) => void submitFeedback(input)}
            />
          </>
        )}
      </section>

      <EvidenceRail
        activeQuery={messages.filter((entry) => entry.role === "user").at(-1)?.content ?? ""}
        items={sources}
        activeSourceId={activeSourceId}
        mobileOpen={mobileEvidenceOpen}
        onSelectSource={setActiveSourceId}
        onOpenMobile={() => setMobileEvidenceOpen(true)}
        onCloseMobile={() => setMobileEvidenceOpen(false)}
        onSelectCitation={onCitationClick}
      />
    </main>
  );
}
