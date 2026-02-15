"use client";

import { useState } from "react";

export function KnowledgeReviewTaskActions(props: {
  orgId: string;
  taskId: string;
  initialStatus: "open" | "in_progress" | "resolved" | "dismissed";
}) {
  const [status, setStatus] = useState(props.initialStatus);
  const [busy, setBusy] = useState(false);

  async function submit(nextStatus: "in_progress" | "resolved" | "dismissed"): Promise<void> {
    setBusy(true);
    try {
      const response = await fetch(`/api/orgs/${props.orgId}/knowledge/review-queue/${props.taskId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ status: nextStatus })
      });
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as {
        item?: {
          status: "open" | "in_progress" | "resolved" | "dismissed";
        };
      };
      if (payload.item?.status) {
        setStatus(payload.item.status);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: "0.8rem", display: "flex", gap: "0.45rem", alignItems: "center", flexWrap: "wrap" }}>
      <button
        type="button"
        className="chip"
        disabled={busy || status === "in_progress"}
        onClick={() => {
          void submit("in_progress");
        }}
      >
        In progress
      </button>
      <button
        type="button"
        className="ask-submit"
        disabled={busy || status === "resolved"}
        onClick={() => {
          void submit("resolved");
        }}
      >
        Resolve
      </button>
      <button
        type="button"
        className="chip"
        disabled={busy || status === "dismissed"}
        onClick={() => {
          void submit("dismissed");
        }}
      >
        Dismiss
      </button>
      <span className="surface-sub" style={{ margin: 0 }}>
        Status: {status}
      </span>
    </div>
  );
}
