"use client";

import type { AnswerClaim, AssistantQueryResponse, Citation } from "@internalwiki/core";

export type AssistantStreamMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  confidence?: number;
  sourceScore?: number;
  model?: string;
  threadId?: string;
  messageId?: string;
  retrievalMs?: number;
  generationMs?: number;
  citationCoverage?: number;
  claims?: AnswerClaim[];
  traceabilityCoverage?: number;
  missingAuthorCount?: number;
  missingDateCount?: number;
  verificationStatus?: "passed" | "blocked";
  verificationReasons?: string[];
  permissionFilteredOutCount?: number;
  qualityContract?: AssistantQueryResponse["qualityContract"];
};

export function MessageStream(props: {
  loading: boolean;
  messages: AssistantStreamMessage[];
  firstTokenMs: number | null;
  completionMs: number | null;
  onCitationClick: (citation: Citation) => void;
  onFeedback?: (input: { threadId: string; messageId: string; vote: "up" | "down" }) => void;
}) {
  return (
    <section className="stream" aria-live="polite">
      {props.messages.map((message) => (
        <article
          key={message.id}
          className={`msg ${message.role === "assistant" ? "msg--assistant" : "msg--user"}`}
        >
          <p className="msg__role">{message.role === "assistant" ? "InternalWiki" : "You"}</p>
          <p className="msg__text">{message.content}</p>

          {message.role === "assistant" ? (
            <>
              <div className="msg-trust-strip">
                <span>
                  Groundedness{" "}
                  {message.qualityContract?.dimensions.groundedness.status ??
                    (message.verificationStatus === "blocked" ? "blocked" : "passed")}
                </span>
                <span>
                  Freshness {message.qualityContract?.dimensions.freshness.status ?? "passed"}
                </span>
                <span>
                  Permission safety {message.qualityContract?.dimensions.permissionSafety.status ?? "passed"}
                </span>
                <span>Confidence {Math.round((message.confidence ?? 0) * 100)}%</span>
                <span>Source score {Math.round(message.sourceScore ?? 0)}</span>
                <span>{message.claims?.length ?? 0} claims</span>
              </div>

              <div className="msg-meta">
                {message.verificationStatus ? (
                  <span>
                    Verification {message.verificationStatus === "passed" ? "passed" : "blocked"}
                  </span>
                ) : null}
                {typeof message.citationCoverage === "number" ? (
                  <span>Citation coverage {Math.round(message.citationCoverage * 100)}%</span>
                ) : null}
                {typeof message.permissionFilteredOutCount === "number" ? (
                  <span>Permission filtered {message.permissionFilteredOutCount}</span>
                ) : null}
                {message.qualityContract?.allowHistoricalEvidence ? (
                  <span>Historical evidence override on</span>
                ) : null}
                {typeof message.missingAuthorCount === "number" ? (
                  <span>Missing author {message.missingAuthorCount}</span>
                ) : null}
                {typeof message.missingDateCount === "number" ? (
                  <span>Missing date {message.missingDateCount}</span>
                ) : null}
                <span>Model {message.model ?? "unknown"}</span>
                {typeof message.retrievalMs === "number" ? <span>Retrieval {message.retrievalMs}ms</span> : null}
                {typeof message.generationMs === "number" ? <span>Generation {message.generationMs}ms</span> : null}
                {props.firstTokenMs !== null ? <span>First token {props.firstTokenMs}ms</span> : null}
                {props.completionMs !== null ? <span>Done {props.completionMs}ms</span> : null}
              </div>
              {message.verificationStatus === "blocked" && message.verificationReasons?.length ? (
                <p className="error-banner">
                  {message.verificationReasons.join(" ")}
                </p>
              ) : null}
            </>
          ) : null}

          {message.citations?.length ? (
            <div className="citation-row" aria-label="Citations">
              {message.citations.map((citation, index) => (
                <button
                  type="button"
                  key={`${citation.chunkId}-${index}`}
                  className="citation-link"
                  onClick={() => props.onCitationClick(citation)}
                >
                  [{index + 1}] {citation.chunkId}
                </button>
              ))}
            </div>
          ) : null}

          {message.claims?.length ? (
            <div className="citation-row" aria-label="Claim mapping">
              {message.claims.map((claim) => (
                claim.citations[0] ? (
                  <button
                    type="button"
                    key={`${message.id}-${claim.order}`}
                    className="citation-link"
                    onClick={() => props.onCitationClick(claim.citations[0] as Citation)}
                  >
                    Claim {claim.order + 1}: {claim.supported ? "supported" : "unsupported"} ({claim.citations.length})
                  </button>
                ) : (
                  <span key={`${message.id}-${claim.order}`} className="citation-link">
                    Claim {claim.order + 1}: unsupported
                  </span>
                )
              ))}
            </div>
          ) : null}

          {message.role === "assistant" && message.threadId && message.messageId && props.onFeedback ? (
            <div className="citation-row" aria-label="Answer feedback">
              <button
                type="button"
                className="citation-link"
                onClick={() =>
                  props.onFeedback?.({
                    threadId: message.threadId as string,
                    messageId: message.messageId as string,
                    vote: "up"
                  })
                }
              >
                Helpful
              </button>
              <button
                type="button"
                className="citation-link"
                onClick={() =>
                  props.onFeedback?.({
                    threadId: message.threadId as string,
                    messageId: message.messageId as string,
                    vote: "down"
                  })
                }
              >
                Not helpful
              </button>
            </div>
          ) : null}
        </article>
      ))}

      {props.loading ? (
        <article className="msg msg--assistant">
          <p className="msg__role">InternalWiki</p>
          <div className="skeleton-line" />
          <div className="skeleton-line skeleton-line--short" />
        </article>
      ) : null}
    </section>
  );
}
