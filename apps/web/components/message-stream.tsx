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

function statusLabel(value: "passed" | "blocked" | undefined): string {
  if (value === "blocked") {
    return "Needs attention";
  }
  return "Pass";
}

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
                  Evidence quality{" "}
                  {statusLabel(
                    message.qualityContract?.dimensions.groundedness.status ??
                      (message.verificationStatus === "blocked" ? "blocked" : "passed")
                  )}
                </span>
                <span>
                  Source recency {statusLabel(message.qualityContract?.dimensions.freshness.status)}
                </span>
                <span>
                  Access protection {statusLabel(message.qualityContract?.dimensions.permissionSafety.status)}
                </span>
                <span>Confidence {Math.round((message.confidence ?? 0) * 100)}%</span>
              </div>

              <div className="msg-meta">
                {message.verificationStatus ? (
                  <span>
                    Answer status {message.verificationStatus === "passed" ? "Ready" : "On hold"}
                  </span>
                ) : null}
                {typeof message.citationCoverage === "number" ? (
                  <span>Evidence coverage {Math.round(message.citationCoverage * 100)}%</span>
                ) : null}
                {message.qualityContract?.allowHistoricalEvidence ? (
                  <span>Including older sources</span>
                ) : null}
              </div>
              {message.verificationStatus === "blocked" && message.verificationReasons?.length ? (
                <p className="error-banner">
                  This answer is on hold: {message.verificationReasons.join(" ")}
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
                  Source {index + 1}
                </button>
              ))}
            </div>
          ) : null}

          {message.claims?.length ? (
            <div className="citation-row" aria-label="Evidence checks">
              {message.claims.map((claim) => (
                claim.citations[0] ? (
                  <button
                    type="button"
                    key={`${message.id}-${claim.order}`}
                    className="citation-link"
                    onClick={() => props.onCitationClick(claim.citations[0] as Citation)}
                  >
                    Point {claim.order + 1}: {claim.supported ? "supported" : "needs more evidence"} (
                    {claim.citations.length})
                  </button>
                ) : (
                  <span key={`${message.id}-${claim.order}`} className="citation-link">
                    Point {claim.order + 1}: needs more evidence
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
