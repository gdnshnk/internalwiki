"use client";

import { useEffect, useMemo, useRef } from "react";
import type { Citation, EvidenceItem } from "@internalwiki/core";

function connectorLabel(connector: EvidenceItem["connectorType"]): string {
  if (connector === "google_docs") {
    return "Google Docs";
  }
  if (connector === "google_drive") {
    return "Google Drive";
  }
  if (connector === "slack") {
    return "Slack";
  }
  if (connector === "microsoft_teams") {
    return "Microsoft Teams";
  }
  if (connector === "microsoft_sharepoint") {
    return "Microsoft SharePoint";
  }
  return "Microsoft OneDrive";
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightExcerpt(excerpt: string, query: string): string {
  const terms = query
    .split(/\s+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length >= 3)
    .slice(0, 5);

  if (terms.length === 0) {
    return excerpt;
  }

  let result = excerpt;
  for (const term of terms) {
    const regex = new RegExp(`(${escapeRegex(term)})`, "ig");
    result = result.replace(regex, "<mark>$1</mark>");
  }

  return result;
}

export function EvidenceRail(props: {
  activeQuery: string;
  items: EvidenceItem[];
  activeSourceId: string | null;
  mobileOpen: boolean;
  onSelectSource: (id: string) => void;
  onOpenMobile: () => void;
  onCloseMobile: () => void;
  onSelectCitation: (citation: Citation) => void;
}) {
  const sourceRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  useEffect(() => {
    if (!props.activeSourceId) {
      return;
    }

    const target = sourceRefs.current.get(props.activeSourceId);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [props.activeSourceId]);

  const grouped = useMemo(() => {
    const groups = new Map<string, EvidenceItem[]>();
    for (const item of props.items) {
      const key = item.title || "Untitled Source";
      const existing = groups.get(key) ?? [];
      existing.push(item);
      groups.set(key, existing);
    }

    return Array.from(groups.entries());
  }, [props.items]);

  const content = (
    <div className="evidence-rail__content">
      <div className="evidence-rail__head">
        <h3>Evidence</h3>
        <p>Ranked citations with author, date, version, and source provenance.</p>
      </div>

      {props.items.length === 0 ? (
        <div className="evidence-empty">No sources yet. Ask a question to load evidence.</div>
      ) : (
        <ul className="source-list">
          {grouped.map(([title, items]) => (
            <li key={title}>
              <p className="workspace-header__eyebrow" style={{ marginBottom: "0.4rem" }}>
                {title}
              </p>

              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.45rem" }}>
                {items.map((item) => {
                  const active = props.activeSourceId === item.id;
                  const checksumShort = item.provenance.checksum ? item.provenance.checksum.slice(0, 12) : null;
                  const updatedLabel = item.provenance.lastUpdatedAt
                    ? new Date(item.provenance.lastUpdatedAt).toLocaleDateString()
                    : "Unknown";
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        ref={(node) => {
                          if (!node) {
                            sourceRefs.current.delete(item.id);
                            return;
                          }
                          sourceRefs.current.set(item.id, node);
                        }}
                        className={`source-card ${active ? "source-card--active" : ""}`}
                        onClick={() => {
                          props.onSelectSource(item.id);
                          props.onSelectCitation(item.citation);
                        }}
                      >
                        <div className="source-card__top">
                          <span className="source-badge">{connectorLabel(item.connectorType)}</span>
                          <span className="source-score">Score {Math.round(item.sourceScore)}</span>
                        </div>
                        <p className="source-title">{item.provenance.documentTitle ?? item.reason.replaceAll("_", " ")}</p>
                        <p className="source-title" style={{ fontSize: "0.73rem", color: "var(--text-muted)", fontWeight: 530, marginTop: "0.2rem" }}>
                          {item.provenance.author ?? "Unknown author"} • {updatedLabel}
                        </p>
                        <p
                          className="source-excerpt"
                          dangerouslySetInnerHTML={{
                            __html: highlightExcerpt(item.excerpt, props.activeQuery)
                          }}
                        />
                        <div className="msg-meta" style={{ marginTop: "0.45rem" }}>
                          {item.provenance.sourceFormat ? <span>Format {item.provenance.sourceFormat}</span> : null}
                          {item.provenance.documentVersionId ? <span>Version {item.provenance.documentVersionId}</span> : null}
                          {item.provenance.syncRunId ? <span>Run {item.provenance.syncRunId.slice(0, 8)}</span> : null}
                          {checksumShort ? <span>Hash {checksumShort}</span> : null}
                        </div>
                        <div className="source-card__foot">
                          <span>Relevance {(item.relevance * 100).toFixed(0)}%</span>
                          <a
                            href={item.provenance.canonicalSourceUrl ?? item.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(event) => event.stopPropagation()}
                          >
                            Open
                          </a>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <>
      <aside className="evidence-rail">{content}</aside>

      <button type="button" className="mobile-evidence-toggle" onClick={props.onOpenMobile}>
        Sources
      </button>

      <div className={`evidence-drawer ${props.mobileOpen ? "evidence-drawer--open" : ""}`}>
        <button type="button" className="evidence-drawer__overlay" aria-label="Close sources" onClick={props.onCloseMobile} />
        <aside className="evidence-drawer__panel">
          <div className="evidence-drawer__bar" />
          {content}
        </aside>
      </div>
    </>
  );
}
