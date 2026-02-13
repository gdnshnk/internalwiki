"use client";

import { useState } from "react";

export function ReviewActions({ orgId, summaryId }: { orgId: string; summaryId: string }) {
  const [status, setStatus] = useState<string>("pending");

  async function submit(action: "approve" | "reject"): Promise<void> {
    const response = await fetch(`/api/orgs/${orgId}/summaries/${summaryId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action })
    });

    if (!response.ok) {
      setStatus("error");
      return;
    }

    const payload = (await response.json()) as { item: { status: string } };
    setStatus(payload.item.status);
  }

  return (
    <div style={{ marginTop: "0.8rem", display: "flex", gap: "0.45rem", alignItems: "center", flexWrap: "wrap" }}>
      <button
        type="button"
        className="ask-submit"
        onClick={() => {
          void submit("approve");
        }}
      >
        Approve
      </button>
      <button
        type="button"
        className="chip"
        onClick={() => {
          void submit("reject");
        }}
      >
        Reject
      </button>
      <span className="surface-sub" style={{ margin: 0 }}>
        Status: {status}
      </span>
    </div>
  );
}
