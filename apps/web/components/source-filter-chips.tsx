"use client";

import type { ConnectorType } from "@internalwiki/core";

type SourceFilterValue = "all" | ConnectorType;

const filterItems: Array<{ label: string; value: SourceFilterValue }> = [
  { label: "All", value: "all" },
  { label: "Google Docs", value: "google_docs" },
  { label: "Google Drive", value: "google_drive" },
  { label: "Notion", value: "notion" }
];

export function SourceFilterChips(props: {
  value: SourceFilterValue;
  onChange: (value: SourceFilterValue) => void;
}) {
  return (
    <div className="chip-row" role="radiogroup" aria-label="Source filters">
      {filterItems.map((item) => {
        const active = props.value === item.value;
        return (
          <button
            key={item.value}
            type="button"
            role="radio"
            aria-checked={active}
            className={`chip ${active ? "chip--active" : ""}`}
            onClick={() => props.onChange(item.value)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export type { SourceFilterValue };
