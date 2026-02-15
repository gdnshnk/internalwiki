"use client";

import { useState } from "react";
import type {
  AuditExportJob,
  SessionPolicy,
  UserMemoryEntry,
  UserMemoryProfile
} from "@internalwiki/core";

type IntegrityStatus = {
  valid: boolean;
  checked: number;
  legacyEventsWithoutHash: number;
  brokenEventId?: string;
};

type AnswerQualityContractSummary = {
  version: string;
  policy: {
    groundedness: {
      requireCitations: boolean;
      minCitationCoverage: number;
      maxUnsupportedClaims: number;
    };
    freshness: {
      windowDays: number;
      minFreshCitationCoverage: number;
    };
    permissionSafety: {
      mode: "fail_closed";
    };
  };
  rolling7d: {
    total: number;
    blocked: number;
    passRate: number;
    groundednessPassRate: number;
    freshnessPassRate: number;
    permissionSafetyPassRate: number;
  };
  latest?: {
    status: "passed" | "blocked";
    groundednessStatus: "passed" | "blocked";
    freshnessStatus: "passed" | "blocked";
    permissionSafetyStatus: "passed" | "blocked";
    citationCoverage: number;
    unsupportedClaims: number;
    freshnessCoverage?: number;
    staleCitationCount?: number;
    citationCount?: number;
    historicalOverride: boolean;
    reasons: string[];
    createdAt: string;
  };
};

function statusLabel(value: "passed" | "blocked"): string {
  return value === "blocked" ? "Needs attention" : "Pass";
}

export function SecuritySettingsManager(props: {
  orgId: string;
  initialPolicy: SessionPolicy;
  initialJobs: AuditExportJob[];
  initialIntegrity: IntegrityStatus;
  initialContract: AnswerQualityContractSummary;
  initialMemoryProfile: UserMemoryProfile;
  initialMemoryEntries: UserMemoryEntry[];
}) {
  const [policy, setPolicy] = useState(props.initialPolicy);
  const [jobs, setJobs] = useState<AuditExportJob[]>(props.initialJobs);
  const [integrity, setIntegrity] = useState<IntegrityStatus>(props.initialIntegrity);
  const [contract] = useState<AnswerQualityContractSummary>(props.initialContract);
  const [memoryProfile, setMemoryProfile] = useState<UserMemoryProfile>(props.initialMemoryProfile);
  const [memoryEntries, setMemoryEntries] = useState<UserMemoryEntry[]>(props.initialMemoryEntries);
  const [memoryKey, setMemoryKey] = useState("");
  const [memoryValue, setMemoryValue] = useState("");
  const [memorySensitivity, setMemorySensitivity] = useState<UserMemoryEntry["sensitivity"]>("low");
  const [busy, setBusy] = useState<
    "save" | "revoke" | "export" | "refresh" | "memory_save" | "memory_entry" | "memory_clear" | null
  >(null);
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
      setMessage("Audit export status updated.");
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
          ? `Policy updated and ${payload.revokedSessions ?? 0} active sessions were signed out.`
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
      setMessage("Audit export requested.");
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function updateMemory(payload: Record<string, unknown>): Promise<void> {
    const response = await fetch(`/api/orgs/${props.orgId}/security/personalization-memory`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const data = (await response.json()) as {
      profile?: UserMemoryProfile;
      entries?: UserMemoryEntry[];
      error?: string;
    };
    if (!response.ok || !data.profile || !data.entries) {
      throw new Error(data.error ?? `Failed to update memory settings (${response.status})`);
    }
    setMemoryProfile(data.profile);
    setMemoryEntries(data.entries);
  }

  async function saveMemorySettings(): Promise<void> {
    setBusy("memory_save");
    setError(null);
    try {
      await updateMemory({
        personalizationEnabled: memoryProfile.personalizationEnabled,
        profileSummary: memoryProfile.profileSummary ?? null,
        retentionDays: memoryProfile.retentionDays
      });
      setMessage("Personalization memory settings updated.");
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function saveMemoryEntry(): Promise<void> {
    if (memoryKey.trim().length < 2 || memoryValue.trim().length < 1) {
      setError("Add both a short memory key and value before saving.");
      return;
    }

    setBusy("memory_entry");
    setError(null);
    try {
      await updateMemory({
        upsertEntry: {
          key: memoryKey,
          value: memoryValue,
          sensitivity: memorySensitivity
        }
      });
      setMemoryKey("");
      setMemoryValue("");
      setMemorySensitivity("low");
      setMessage("Memory entry saved.");
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function removeMemoryEntry(key: string): Promise<void> {
    setBusy("memory_entry");
    setError(null);
    try {
      await updateMemory({ deleteEntryKey: key });
      setMessage("Memory entry removed.");
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function clearMemory(): Promise<void> {
    setBusy("memory_clear");
    setError(null);
    try {
      const response = await fetch(`/api/orgs/${props.orgId}/security/personalization-memory`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json"
        }
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? `Failed to clear memory (${response.status})`);
      }

      const refreshed = await fetch(`/api/orgs/${props.orgId}/security/personalization-memory`);
      const refreshedPayload = (await refreshed.json()) as {
        profile?: UserMemoryProfile;
        entries?: UserMemoryEntry[];
        error?: string;
      };
      if (!refreshed.ok || !refreshedPayload.profile || !refreshedPayload.entries) {
        throw new Error(refreshedPayload.error ?? `Failed to refresh memory settings (${refreshed.status})`);
      }
      setMemoryProfile(refreshedPayload.profile);
      setMemoryEntries(refreshedPayload.entries);
      setMessage("Personalization memory cleared.");
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
          Set session lifetime, idle timeout, and concurrent session limits for your workspace.
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
            {busy === "revoke" ? "Saving..." : "Save and sign out all active sessions"}
          </button>
        </div>
      </section>

      <section className="surface-card">
        <h2 className="surface-title">Audit export controls</h2>
        <p className="surface-sub">
          Export audit activity for security reviews and compliance evidence.
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
          <div className="data-pill">Audit integrity: {integrity.valid ? "Verified" : "Needs review"}</div>
          <div className="data-pill">Events reviewed: {integrity.checked}</div>
          <div className="data-pill">Legacy events: {integrity.legacyEventsWithoutHash}</div>
          {integrity.brokenEventId ? <div className="data-pill">Issue detected in audit history</div> : null}
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

      <section className="surface-card">
        <h2 className="surface-title">Answer quality standards</h2>
        <p className="surface-sub">
          Answers are delivered only when evidence quality, source recency, and access protection checks pass.
        </p>

        <div className="data-grid" style={{ marginTop: "0.8rem" }}>
          <div className="data-pill">Evidence quality pass (7d): {contract.rolling7d.groundednessPassRate.toFixed(2)}%</div>
          <div className="data-pill">Source recency pass (7d): {contract.rolling7d.freshnessPassRate.toFixed(2)}%</div>
          <div className="data-pill">
            Access protection pass (7d): {contract.rolling7d.permissionSafetyPassRate.toFixed(2)}%
          </div>
          <div className="data-pill">Overall pass (7d): {contract.rolling7d.passRate.toFixed(2)}%</div>
          <div className="data-pill">Answers held for review (7d): {contract.rolling7d.blocked}</div>
        </div>
        {contract.latest ? (
          <div className="msg-meta" style={{ marginTop: "0.8rem" }}>
            <span>
              Latest status: {statusLabel(contract.latest.groundednessStatus)}/
              {statusLabel(contract.latest.freshnessStatus)}/{statusLabel(contract.latest.permissionSafetyStatus)}
            </span>
            <span>Latest evidence coverage {Math.round(contract.latest.citationCoverage * 100)}%</span>
          </div>
        ) : null}
      </section>

      <section className="surface-card">
        <h2 className="surface-title">Personalization memory</h2>
        <p className="surface-sub">
          Opt in to durable memory for your account. Only approved memory is stored, and you can clear it at any time.
        </p>

        <div className="connector-form-grid" style={{ marginTop: "0.8rem" }}>
          <label className="connector-field">
            <span>Personalization</span>
            <select
              value={memoryProfile.personalizationEnabled ? "enabled" : "disabled"}
              onChange={(event) =>
                setMemoryProfile((current) => ({
                  ...current,
                  personalizationEnabled: event.target.value === "enabled"
                }))
              }
            >
              <option value="disabled">Disabled</option>
              <option value="enabled">Enabled</option>
            </select>
          </label>
          <label className="connector-field">
            <span>Retention (days)</span>
            <input
              type="number"
              min={7}
              max={365}
              value={memoryProfile.retentionDays}
              onChange={(event) =>
                setMemoryProfile((current) => ({
                  ...current,
                  retentionDays: Number(event.target.value || current.retentionDays)
                }))
              }
            />
          </label>
          <label className="connector-field" style={{ gridColumn: "1 / -1" }}>
            <span>Profile summary (optional)</span>
            <textarea
              rows={3}
              value={memoryProfile.profileSummary ?? ""}
              onChange={(event) =>
                setMemoryProfile((current) => ({
                  ...current,
                  profileSummary: event.target.value
                }))
              }
              placeholder="Example: Prefer concise summaries with source links first."
            />
          </label>
        </div>

        <div className="chip-row" style={{ marginTop: "0.8rem" }}>
          <button type="button" className="ask-submit" disabled={busy !== null} onClick={() => void saveMemorySettings()}>
            {busy === "memory_save" ? "Saving..." : "Save memory settings"}
          </button>
          <button type="button" className="chip chip--active" disabled={busy !== null} onClick={() => void clearMemory()}>
            {busy === "memory_clear" ? "Clearing..." : "Clear all memory"}
          </button>
        </div>

        <div className="connector-form-grid" style={{ marginTop: "0.8rem" }}>
          <label className="connector-field">
            <span>Memory key</span>
            <input
              value={memoryKey}
              onChange={(event) => setMemoryKey(event.target.value)}
              placeholder="summary_style"
            />
          </label>
          <label className="connector-field">
            <span>Sensitivity</span>
            <select
              value={memorySensitivity}
              onChange={(event) => setMemorySensitivity(event.target.value as UserMemoryEntry["sensitivity"])}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
          <label className="connector-field" style={{ gridColumn: "1 / -1" }}>
            <span>Memory value</span>
            <textarea
              rows={2}
              value={memoryValue}
              onChange={(event) => setMemoryValue(event.target.value)}
              placeholder="Prefers headline summary first, then supporting details."
            />
          </label>
        </div>

        <div className="chip-row" style={{ marginTop: "0.8rem" }}>
          <button type="button" className="ask-submit" disabled={busy !== null} onClick={() => void saveMemoryEntry()}>
            {busy === "memory_entry" ? "Saving entry..." : "Save memory entry"}
          </button>
        </div>

        <div className="data-grid" style={{ marginTop: "0.8rem" }}>
          {memoryEntries.length === 0 ? (
            <div className="data-pill">No memory entries saved yet.</div>
          ) : (
            memoryEntries.map((entry) => (
              <div className="data-pill" key={entry.id}>
                <strong>{entry.key}</strong>: {entry.value}
                <div className="msg-meta" style={{ marginTop: "0.35rem" }}>
                  <span>{entry.sensitivity.toUpperCase()}</span>
                  <span>{entry.source}</span>
                </div>
                <div className="chip-row" style={{ marginTop: "0.35rem" }}>
                  <button
                    type="button"
                    className="chip"
                    disabled={busy !== null}
                    onClick={() => void removeMemoryEntry(entry.key)}
                  >
                    Remove
                  </button>
                </div>
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
