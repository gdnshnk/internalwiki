"use client";

import { useState } from "react";
import type { ConnectorType } from "@internalwiki/core";

export type AdvancedSearchFilters = {
  sourceType?: ConnectorType;
  dateRange?: { from?: string; to?: string };
  author?: string;
  minSourceScore?: number;
  documentIds?: string[];
};

const CONNECTOR_TYPES: ConnectorType[] = ["google_docs", "google_drive", "notion"];

function toConnectorType(value: string): ConnectorType | undefined {
  return CONNECTOR_TYPES.includes(value as ConnectorType) ? (value as ConnectorType) : undefined;
}

export function AdvancedSearchFilters(props: {
  filters: AdvancedSearchFilters;
  onFiltersChange: (filters: AdvancedSearchFilters) => void;
  availableAuthors?: string[];
  availableDocuments?: Array<{ id: string; title: string }>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [localFilters, setLocalFilters] = useState<AdvancedSearchFilters>(props.filters);

  function updateFilter<K extends keyof AdvancedSearchFilters>(
    key: K,
    value: AdvancedSearchFilters[K]
  ): void {
    const updated = { ...localFilters, [key]: value };
    setLocalFilters(updated);
    props.onFiltersChange(updated);
  }

  function clearFilters(): void {
    const cleared: AdvancedSearchFilters = {};
    setLocalFilters(cleared);
    props.onFiltersChange(cleared);
  }

  const hasActiveFilters =
    localFilters.sourceType ||
    localFilters.dateRange?.from ||
    localFilters.dateRange?.to ||
    localFilters.author ||
    localFilters.minSourceScore !== undefined ||
    (localFilters.documentIds && localFilters.documentIds.length > 0);

  return (
    <div className="advanced-search-filters">
      <button
        type="button"
        className="advanced-search-toggle"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <span>Advanced Filters</span>
        {hasActiveFilters ? <span className="filter-badge">{Object.keys(localFilters).length}</span> : null}
        <span className="toggle-icon">{expanded ? "−" : "+"}</span>
      </button>

      {expanded ? (
        <div className="advanced-search-panel">
          <div className="filter-group">
            <label htmlFor="filter-source-type">Source Type</label>
              <select
                id="filter-source-type"
                value={localFilters.sourceType ?? ""}
                onChange={(e) => updateFilter("sourceType", toConnectorType(e.target.value))}
              >
              <option value="">All Sources</option>
              <option value="google_docs">Google Docs</option>
              <option value="google_drive">Google Drive</option>
              <option value="notion">Notion</option>
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="filter-date-from">Date Range</label>
            <div className="date-range-inputs">
              <input
                id="filter-date-from"
                type="date"
                value={localFilters.dateRange?.from ?? ""}
                onChange={(e) =>
                  updateFilter("dateRange", {
                    ...localFilters.dateRange,
                    from: e.target.value || undefined
                  })
                }
                placeholder="From"
              />
              <input
                id="filter-date-to"
                type="date"
                value={localFilters.dateRange?.to ?? ""}
                onChange={(e) =>
                  updateFilter("dateRange", {
                    ...localFilters.dateRange,
                    to: e.target.value || undefined
                  })
                }
                placeholder="To"
              />
            </div>
          </div>

          <div className="filter-group">
            <label htmlFor="filter-author">Author</label>
            {props.availableAuthors && props.availableAuthors.length > 0 ? (
              <select
                id="filter-author"
                value={localFilters.author ?? ""}
                onChange={(e) => updateFilter("author", e.target.value || undefined)}
              >
                <option value="">All Authors</option>
                {props.availableAuthors.map((author) => (
                  <option key={author} value={author}>
                    {author}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id="filter-author"
                type="text"
                value={localFilters.author ?? ""}
                onChange={(e) => updateFilter("author", e.target.value || undefined)}
                placeholder="Filter by author name or email"
              />
            )}
          </div>

          <div className="filter-group">
            <label htmlFor="filter-min-score">
              Minimum Source Score: {localFilters.minSourceScore ?? 0}
            </label>
            <input
              id="filter-min-score"
              type="range"
              min="0"
              max="100"
              value={localFilters.minSourceScore ?? 0}
              onChange={(e) => updateFilter("minSourceScore", Number(e.target.value))}
            />
          </div>

          {props.availableDocuments && props.availableDocuments.length > 0 ? (
            <div className="filter-group">
              <label htmlFor="filter-documents">Specific Documents</label>
              <select
                id="filter-documents"
                multiple
                value={localFilters.documentIds ?? []}
                onChange={(e) => {
                  const selected = Array.from(e.target.selectedOptions, (opt) => opt.value);
                  updateFilter("documentIds", selected.length > 0 ? selected : undefined);
                }}
                size={5}
              >
                {props.availableDocuments.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.title}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {hasActiveFilters ? (
            <button type="button" className="clear-filters" onClick={clearFilters}>
              Clear All Filters
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
