"use client";

import { useMemo } from "react";
import type { AssistantMode } from "@internalwiki/core";
import { SourceFilterChips, type SourceFilterValue } from "@/components/source-filter-chips";

const modeItems: Array<{ value: AssistantMode; label: string }> = [
  { value: "ask", label: "Ask" },
  { value: "summarize", label: "Summarize" },
  { value: "trace", label: "Trace" }
];

export function AskComposer(props: {
  value: string;
  mode: AssistantMode;
  sourceFilter: SourceFilterValue;
  allowHistoricalEvidence: boolean;
  loading: boolean;
  sticky?: boolean;
  placeholder?: string;
  onValueChange: (value: string) => void;
  onModeChange: (mode: AssistantMode) => void;
  onSourceFilterChange: (value: SourceFilterValue) => void;
  onAllowHistoricalEvidenceChange: (value: boolean) => void;
  onSubmit: () => void;
}) {
  const lineCount = useMemo(() => Math.max(1, Math.min(6, props.value.split("\n").length)), [props.value]);

  return (
    <section className={`ask-shell ${props.sticky ? "ask-shell--sticky" : ""}`}>
      <div className="ask-shell__modes" role="radiogroup" aria-label="Assistant mode">
        {modeItems.map((mode) => {
          const active = props.mode === mode.value;
          return (
            <button
              key={mode.value}
              type="button"
              role="radio"
              aria-checked={active}
              className={`mode-chip ${active ? "mode-chip--active" : ""}`}
              onClick={() => props.onModeChange(mode.value)}
            >
              {mode.label}
            </button>
          );
        })}
      </div>

      <label htmlFor="ask-input" className="sr-only">
        Ask InternalWiki
      </label>
      <textarea
        id="ask-input"
        rows={lineCount}
        value={props.value}
        placeholder={props.placeholder ?? "Ask anything about your organization knowledge"}
        className="ask-input"
        onChange={(event) => props.onValueChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            props.onSubmit();
          }
        }}
      />

      <div className="ask-shell__footer">
        <div className="ask-shell__controls">
          <SourceFilterChips value={props.sourceFilter} onChange={props.onSourceFilterChange} />
          <label className="ask-toggle">
            <input
              type="checkbox"
              checked={props.allowHistoricalEvidence}
              onChange={(event) => props.onAllowHistoricalEvidenceChange(event.target.checked)}
            />
            <span>Include older sources</span>
          </label>
        </div>
        <button
          type="button"
          className="ask-submit"
          disabled={props.loading || props.value.trim().length < 2}
          onClick={props.onSubmit}
        >
          {props.loading ? "Thinking..." : "Send"}
        </button>
      </div>
    </section>
  );
}
