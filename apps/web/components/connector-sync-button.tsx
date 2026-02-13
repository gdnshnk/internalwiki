"use client";

import { useState } from "react";

export function ConnectorSyncButton(props: {
  orgId: string;
  connectorId: string;
  onQueued?: (result: { jobId: string }) => void;
}) {
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");

  async function triggerSync(): Promise<void> {
    if (status === "running") {
      return;
    }

    setStatus("running");
    try {
      const response = await fetch(`/api/orgs/${props.orgId}/connectors/${props.connectorId}/sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        }
      });

      if (!response.ok) {
        throw new Error("Sync request failed");
      }
      const payload = (await response.json()) as { jobId?: string };
      setStatus("done");
      if (payload.jobId) {
        props.onQueued?.({ jobId: payload.jobId });
      }
      setTimeout(() => setStatus("idle"), 1500);
    } catch {
      setStatus("error");
    }
  }

  return (
    <button type="button" className="chip chip--active" onClick={() => void triggerSync()}>
      {status === "running"
        ? "Syncing..."
        : status === "done"
          ? "Queued"
          : status === "error"
            ? "Retry sync"
            : "Sync now"}
    </button>
  );
}
