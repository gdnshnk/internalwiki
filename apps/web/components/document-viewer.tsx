"use client";

import { useMemo } from "react";
import type { Citation } from "@internalwiki/core";

export function DocumentViewer(props: {
  content: string;
  citations?: Citation[];
  highlightCitations?: boolean;
}) {
  const highlightedContent = useMemo(() => {
    if (!props.highlightCitations || !props.citations || props.citations.length === 0) {
      return props.content;
    }

    // Sort citations by start offset (descending) to avoid offset issues when replacing
    const sortedCitations = [...props.citations].sort((a, b) => b.startOffset - a.startOffset);
    let result = props.content;

    for (const citation of sortedCitations) {
      const start = Math.max(0, citation.startOffset);
      const end = Math.min(result.length, citation.endOffset);
      const before = result.slice(0, start);
      const cited = result.slice(start, end);
      const after = result.slice(end);

      result = `${before}<mark class="citation-highlight" data-citation-id="${citation.chunkId}">${cited}</mark>${after}`;
    }

    return result;
  }, [props.content, props.citations, props.highlightCitations]);

  // Simple markdown rendering (can be enhanced with a proper markdown library)
  const renderedContent = useMemo(() => {
    let html = highlightedContent
      // Headers
      .replace(/^### (.*$)/gim, "<h3>$1</h3>")
      .replace(/^## (.*$)/gim, "<h2>$1</h2>")
      .replace(/^# (.*$)/gim, "<h1>$1</h1>")
      // Bold
      .replace(/\*\*(.*?)\*\*/gim, "<strong>$1</strong>")
      // Italic
      .replace(/\*(.*?)\*/gim, "<em>$1</em>")
      // Links
      .replace(/\[([^\]]+)\]\(([^)]+)\)/gim, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
      // Code blocks
      .replace(/```([\s\S]*?)```/gim, '<pre><code>$1</code></pre>')
      // Inline code
      .replace(/`([^`]+)`/gim, "<code>$1</code>")
      // Line breaks
      .replace(/\n\n/gim, "</p><p>")
      .replace(/\n/gim, "<br/>");

    return `<p>${html}</p>`;
  }, [highlightedContent]);

  return (
    <div className="document-viewer">
      <div
        className="document-content"
        dangerouslySetInnerHTML={{ __html: renderedContent }}
      />
      {props.citations && props.citations.length > 0 && props.highlightCitations ? (
        <div className="citation-legend">
          <p className="citation-legend-title">Cited passages highlighted</p>
          <div className="citation-list">
            {props.citations.map((citation, index) => (
              <div key={citation.chunkId} className="citation-item">
                <span className="citation-marker" data-citation-id={citation.chunkId}>
                  {index + 1}
                </span>
                <span className="citation-text">
                  {props.content.slice(
                    Math.max(0, citation.startOffset - 20),
                    Math.min(props.content.length, citation.endOffset + 20)
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
