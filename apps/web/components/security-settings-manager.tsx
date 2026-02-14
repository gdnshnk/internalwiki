"use client";

import { useState } from "react";
import type { AuditExportJob, SessionPolicy } from "@internalwiki/core";

type IntegrityStatus = {
  valid: boolean;
  checked: number;
  legacyEventsWithoutHash: number;
  brokenEventId?: string;
};

export function SecuritySettingsManager(props: {
  orgId: string;
  initialPolicy: SessionPolicy;
  initialJobs: AuditExportJob[];
  initialIntegrity: IntegrityStatus;
}) {
  const [policy, setPolicy] = useState(props.initialPolicy);
  const [jobs, setJobs] = useState<AuditExportJob[]>(props.initialJobs);
  const [integrity, setIntegrity] = useState<IntegrityStatus>(props.initialIntegrity);
  const [busy, setBusy] = useState<"save" | "revoke" | "export" | "refresh" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refreshAuditStatus(): Promise<void> {
    setBusy("refresh");
    setError(null);
    try {
      const response = await fetch(`/api/orgs/${props.orgId}/security/audit/export`);
      const payload = (await response.json()) as { jobs?: AuditExportJob[]; integrity?: IntegrityStatus; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? `Failed to refresh audit jobs (${response.status})`);
      }
      setJobs(payload.jobs ?? []);
      setIntegrity(payload.integrity ?? integrity);
      setMessage("Audit export status refreshed.");
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function savePolicy(forceRevokeAll: boolean): Promise<void> {
    setBusy(forceRevokeAll ? "revoke" : "save");
    setError(null);
    try {
      const response = await fetch(`/api/orgs/${props.orgId}/security/session-policies`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sessionMaxAgeMinutes: policy.sessionMaxAgeMinutes,
          sessionIdleTimeoutMinutes: policy.sessionIdleTimeoutMinutes,
          concurrentSessionLimit: policy.concurrentSessionLimit,
          forceReauthAfterMinutes: policy.forceReauthAfterMinutes,
          forceRevokeAll
        })
      });

      const payload = (await response.json()) as {
        policy?: SessionPolicy;
        revokedSessions?: number;
        error?: string;
      };
      if (!response.ok || !payload.policy) {
        throw new Error(payload.error ?? `Failed to save policy (${response.status})`);
      }
      setPolicy(payload.policy);
      setMessage(
        forceRevokeAll
          ? `Policy updated and revoked ${payload.revokedSessions ?? 0} active sessions.`
          : "Session policy updated."
      );
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function requestExport(): Promise<void> {
    setBusy("export");
    setError(null);
    try {
      const response = await fetch(`/api/orgs/${props.orgId}/security/audit/export`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        }
      });
      const payload = (await response.json()) as {
        job?: AuditExportJob;
        error?: string;
      };
      if (!response.ok || !payload.job) {
        throw new Error(payload.error ?? `Failed to request audit export (${response.status})`);
      }
      setJobs((previous) => [payload.job!, ...previous].slice(0, 20));
      setMessage("Audit export requested. Worker picked up the job.");
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="page-wrap">
      <section className="surface-card">
        <h2 className="surface-title">Session security policy</h2>
        <p className="surface-sub">
          Configure default session lifetime, idle timeout, and concurrent session limit. Use revoke-all after policy
          changes or during incident response.
        </p>

        <div className="connector-form-grid" style={{ marginTop: "0.8rem" }}>
          <label className="connector-field">
            <span>Session max age (minutes)</span>
            <input
              type="number"
              value={policy.sessionMaxAgeMinutes}
              onChange={(event) =>
                setPolicy((current) => ({ ...current, sessionMaxAgeMinutes: Number(event.target.value || 0) }))
              }
            />
          </label>
          <label className="connector-field">
            <span>Idle timeout (minutes)</span>
            <input
              type="number"
              value={policy.sessionIdleTimeoutMinutes}
              onChange={(event) =>
                setPolicy((current) => ({ ...current, sessionIdleTimeoutMinutes: Number(event.target.value || 0) }))
              }
            />
          </label>
          <label className="connector-field">
            <span>Concurrent sessions</span>
            <input
              type="number"
              value={policy.concurrentSessionLimit}
              onChange={(event) =>
                setPolicy((current) => ({ ...current, concurrentSessionLimit: Number(event.target.value || 0) }))
              }
            />
          </label>
          <label className="connector-field">
            <span>Force reauth after (minutes)</span>
            <input
              type="number"
              value={policy.forceReauthAfterMinutes}
              onChange={(event) =>
                setPolicy((current) => ({ ...current, forceReauthAfterMinutes: Number(event.target.value || 0) }))
              }
            />
          </label>
        </div>

        <div className="chip-row" style={{ marginTop: "0.8rem" }}>
          <button type="button" className="ask-submit" disabled={busy !== null} onClick={() => void savePolicy(false)}>
            {busy === "save" ? "Saving..." : "Save policy"}
          </button>
          <button type="button" className="chip chip--active" disabled={busy !== null} onClick={() => void savePolicy(true)}>
            {busy === "revoke" ? "Revoking..." : "Save + revoke all sessions"}
          </button>
        </div>
      </section>

      <section className="surface-card">
        <h2 className="surface-title">Audit export controls</h2>
        <p className="surface-sub">
          Request immutable audit export jobs and verify hash-chain integrity before sharing evidence with security
          stakeholders.
        </p>

        <div className="chip-row" style={{ marginTop: "0.8rem" }}>
          <button type="button" className="ask-submit" disabled={busy !== null} onClick={() => void requestExport()}>
            {busy === "export" ? "Requesting..." : "Request new export"}
          </button>
          <button type="button" className="chip chip--active" disabled={busy !== null} onClick={() => void refreshAuditStatus()}>
            {busy === "refresh" ? "Refreshing..." : "Refresh status"}
          </button>
        </div>

        <div className="data-grid" style={{ marginTop: "0.8rem" }}>
          <div className="data-pill">Integrity: {integrity.valid ? "Verified" : "Mismatch detected"}</div>
          <div className="data-pill">Hashed events checked: {integrity.checked}</div>
          <div className="data-pill">Legacy events: {integrity.legacyEventsWithoutHash}</div>
          {integrity.brokenEventId ? <div className="data-pill">Broken event: {integrity.brokenEventId}</div> : null}
        </div>

        <div className="data-grid" style={{ marginTop: "0.8rem" }}>
          {jobs.length === 0 ? (
            <div className="data-pill">No export jobs yet</div>
          ) : (
            jobs.map((job) => (
              <div key={job.id} className="data-pill">
                {job.status.toUpperCase()} · {new Date(job.createdAt).toLocaleString()}
              </div>
            ))
          )}
        </div>
      </section>

      {message ? <p className="surface-sub">{message}</p> : null}
      {error ? <p className="error-banner">{error}</p> : null}
    </div>
  );
}
