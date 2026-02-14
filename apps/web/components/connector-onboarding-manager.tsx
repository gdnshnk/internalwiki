"use client";

import { useMemo, useState } from "react";
import { ConnectorSyncButton } from "@/components/connector-sync-button";
import { useSearchParams } from "next/navigation";

type ConnectorStatus = "active" | "reauth_required" | "disabled";
type ConnectorType =
  | "google_docs"
  | "google_drive"
  | "slack"
  | "microsoft_teams"
  | "microsoft_sharepoint"
  | "microsoft_onedrive";

type MicrosoftConnectorType = "microsoft_teams" | "microsoft_sharepoint" | "microsoft_onedrive";

type ConnectorAccountPublic = {
  id: string;
  organizationId: string;
  connectorType: ConnectorType;
  status: ConnectorStatus;
  tokenExpiresAt?: string;
  syncCursor?: string;
  lastSyncedAt?: string;
  displayName?: string;
  externalWorkspaceId?: string;
  hasRefreshToken: boolean;
  createdAt: string;
  updatedAt: string;
};

type ConnectorRun = {
  id: string;
  status: "running" | "completed" | "failed";
  startedAt: string;
  completedAt?: string;
  itemsSeen?: number;
  itemsChanged?: number;
  itemsSkipped?: number;
  itemsFailed?: number;
  failureClassification?: "transient" | "auth" | "payload";
  errorMessage?: string;
};

type EditDraft = {
  displayName: string;
  externalWorkspaceId: string;
  status: ConnectorStatus;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: string;
};

function toDatetimeLocalInput(value?: string): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const pad = (input: number) => String(input).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIsoDatetimeOrUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toISOString();
}

function formatTime(value?: string): string {
  if (!value) {
    return "Never";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function createDraft(connector: ConnectorAccountPublic): EditDraft {
  return {
    displayName: connector.displayName ?? "",
    externalWorkspaceId: connector.externalWorkspaceId ?? "",
    status: connector.status,
    accessToken: "",
    refreshToken: "",
    tokenExpiresAt: toDatetimeLocalInput(connector.tokenExpiresAt)
  };
}

function connectorLabel(connectorType: string): string {
  switch (connectorType) {
    case "google_docs":
      return "Google Docs";
    case "google_drive":
      return "Google Drive";
    case "slack":
      return "Slack";
    case "microsoft_teams":
      return "Microsoft Teams";
    case "microsoft_sharepoint":
      return "Microsoft SharePoint";
    case "microsoft_onedrive":
      return "Microsoft OneDrive";
    default:
      return connectorType;
  }
}

export function ConnectorOnboardingManager(props: {
  orgId: string;
  initialConnectors: ConnectorAccountPublic[];
  initialRunsByConnector: Record<string, ConnectorRun[]>;
}) {
  const searchParams = useSearchParams();
  const [connectors, setConnectors] = useState<ConnectorAccountPublic[]>(props.initialConnectors);
  const [runsByConnector, setRunsByConnector] = useState<Record<string, ConnectorRun[]>>(props.initialRunsByConnector);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<ConnectorType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeEditorId, setActiveEditorId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, EditDraft>>(() =>
    Object.fromEntries(props.initialConnectors.map((connector) => [connector.id, createDraft(connector)]))
  );

  const [newConnector, setNewConnector] = useState({
    connectorType: "google_docs" as ConnectorType,
    displayName: "",
    externalWorkspaceId: "",
    accessToken: "",
    refreshToken: "",
    tokenExpiresAt: ""
  });

  const sortedConnectors = useMemo(
    () => [...connectors].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [connectors]
  );
  const connectedFromOauth = searchParams?.get("connected");
  const oauthError = searchParams?.get("error");

  async function startSlackOAuth(): Promise<void> {
    if (loading || oauthLoading) {
      return;
    }

    setError(null);
    setOauthLoading("slack");
    try {
      const response = await fetch(`/api/orgs/${props.orgId}/connectors/slack/oauth/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          next: "/app/settings/connectors"
        })
      });
      const payload = (await response.json().catch(() => ({}))) as {
        authorizeUrl?: string;
        error?: string;
      };
      if (!response.ok || !payload.authorizeUrl) {
        throw new Error(payload.error ?? `Slack OAuth start failed (${response.status})`);
      }

      window.location.href = payload.authorizeUrl;
    } catch (oauthStartError) {
      setError((oauthStartError as Error).message);
      setOauthLoading(null);
    }
  }

  async function startMicrosoftOAuth(connectorType: MicrosoftConnectorType): Promise<void> {
    if (loading || oauthLoading) {
      return;
    }

    setError(null);
    setOauthLoading(connectorType);
    try {
      const response = await fetch(`/api/orgs/${props.orgId}/connectors/microsoft/oauth/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          connectorType,
          next: "/app/settings/connectors"
        })
      });
      const payload = (await response.json().catch(() => ({}))) as {
        authorizeUrl?: string;
        error?: string;
      };
      if (!response.ok || !payload.authorizeUrl) {
        throw new Error(payload.error ?? `Microsoft OAuth start failed (${response.status})`);
      }

      window.location.href = payload.authorizeUrl;
    } catch (oauthStartError) {
      setError((oauthStartError as Error).message);
      setOauthLoading(null);
    }
  }

  async function fetchConnectorRuns(connectorId: string): Promise<ConnectorRun[]> {
    const response = await fetch(`/api/orgs/${props.orgId}/connectors/${connectorId}/runs?limit=6`);
    if (!response.ok) {
      throw new Error(`Failed to load runs (${response.status})`);
    }
    const payload = (await response.json()) as { runs: ConnectorRun[] };
    return payload.runs ?? [];
  }

  async function refreshConnectors(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const connectorsResponse = await fetch(`/api/orgs/${props.orgId}/connectors`);
      if (!connectorsResponse.ok) {
        throw new Error(`Failed to load connectors (${connectorsResponse.status})`);
      }
      const connectorsPayload = (await connectorsResponse.json()) as { connectors: ConnectorAccountPublic[] };
      const nextConnectors = connectorsPayload.connectors ?? [];
      setConnectors(nextConnectors);
      setDrafts((previous) => {
        const next: Record<string, EditDraft> = { ...previous };
        for (const connector of nextConnectors) {
          if (!next[connector.id]) {
            next[connector.id] = createDraft(connector);
          }
        }
        return next;
      });

      const runPairs = await Promise.all(
        nextConnectors.map(async (connector) => [connector.id, await fetchConnectorRuns(connector.id)] as const)
      );
      setRunsByConnector(Object.fromEntries(runPairs));
    } catch (refreshError) {
      setError((refreshError as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function createConnector(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/orgs/${props.orgId}/connectors`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          connectorType: newConnector.connectorType,
          displayName: newConnector.displayName.trim(),
          externalWorkspaceId: newConnector.externalWorkspaceId.trim(),
          accessToken: newConnector.accessToken.trim(),
          refreshToken: newConnector.refreshToken.trim() || undefined,
          tokenExpiresAt: toIsoDatetimeOrUndefined(newConnector.tokenExpiresAt)
        })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({ error: "Connector create failed" }))) as {
          error?: string;
        };
        throw new Error(payload.error ?? `Connector create failed (${response.status})`);
      }

      setNewConnector({
        connectorType: "google_docs",
        displayName: "",
        externalWorkspaceId: "",
        accessToken: "",
        refreshToken: "",
        tokenExpiresAt: ""
      });
      await refreshConnectors();
    } catch (createError) {
      setError((createError as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function updateConnector(connectorId: string): Promise<void> {
    const draft = drafts[connectorId];
    if (!draft) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/orgs/${props.orgId}/connectors/${connectorId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          displayName: draft.displayName.trim(),
          externalWorkspaceId: draft.externalWorkspaceId.trim(),
          status: draft.status,
          accessToken: draft.accessToken.trim() || undefined,
          refreshToken: draft.refreshToken.trim() || undefined,
          tokenExpiresAt: toIsoDatetimeOrUndefined(draft.tokenExpiresAt)
        })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({ error: "Connector update failed" }))) as {
          error?: string;
        };
        throw new Error(payload.error ?? `Connector update failed (${response.status})`);
      }

      setActiveEditorId(null);
      setDrafts((previous) => ({
        ...previous,
        [connectorId]: {
          ...previous[connectorId],
          accessToken: "",
          refreshToken: ""
        }
      }));
      await refreshConnectors();
    } catch (updateError) {
      setError((updateError as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function deleteConnector(connectorId: string): Promise<void> {
    const confirmed = window.confirm("Delete this connector? Sync history remains auditable but integration access is removed.");
    if (!confirmed) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/orgs/${props.orgId}/connectors/${connectorId}`, {
        method: "DELETE"
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({ error: "Connector delete failed" }))) as {
          error?: string;
        };
        throw new Error(payload.error ?? `Connector delete failed (${response.status})`);
      }
      setActiveEditorId(null);
      setRunsByConnector((previous) => {
        const next = { ...previous };
        delete next[connectorId];
        return next;
      });
      setConnectors((previous) => previous.filter((connector) => connector.id !== connectorId));
    } catch (deleteError) {
      setError((deleteError as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="connector-manager">
      <section className="surface-card">
        <h2 className="surface-title">Quick connect (recommended)</h2>
        <p className="surface-sub">
          Connect Slack and Microsoft 365 with OAuth. InternalWiki auto-queues first sync and setup readiness checks.
        </p>

        <div className="chip-row" style={{ marginTop: "0.8rem", flexWrap: "wrap" }}>
          <button type="button" className="ask-submit" disabled={loading || oauthLoading !== null} onClick={() => void startSlackOAuth()}>
            {oauthLoading === "slack" ? "Redirecting to Slack..." : "Connect Slack"}
          </button>
          <button
            type="button"
            className="chip chip--active"
            disabled={loading || oauthLoading !== null}
            onClick={() => void startMicrosoftOAuth("microsoft_teams")}
          >
            {oauthLoading === "microsoft_teams" ? "Redirecting to Teams..." : "Connect Teams"}
          </button>
          <button
            type="button"
            className="chip chip--active"
            disabled={loading || oauthLoading !== null}
            onClick={() => void startMicrosoftOAuth("microsoft_sharepoint")}
          >
            {oauthLoading === "microsoft_sharepoint" ? "Redirecting to SharePoint..." : "Connect SharePoint"}
          </button>
          <button
            type="button"
            className="chip chip--active"
            disabled={loading || oauthLoading !== null}
            onClick={() => void startMicrosoftOAuth("microsoft_onedrive")}
          >
            {oauthLoading === "microsoft_onedrive" ? "Redirecting to OneDrive..." : "Connect OneDrive"}
          </button>
        </div>

        <p className="surface-sub" style={{ marginTop: "0.75rem" }}>
          Notion is deprecated now and will be fully sunset 60 days after deprecation release.
        </p>
      </section>

      {connectedFromOauth ? (
        <section className="surface-card">
          <p className="workspace-header__eyebrow">Connected</p>
          <h3 className="surface-title">{connectorLabel(connectedFromOauth)} connected</h3>
          <p className="surface-sub">Connection succeeded and initial sync was queued automatically.</p>
        </section>
      ) : null}

      {oauthError ? <p className="error-banner">{oauthError}</p> : null}

      <section className="surface-card">
        <h2 className="surface-title">Add source integration</h2>
        <p className="surface-sub">
          Advanced/manual path. Use this when OAuth is unavailable or when you need explicit token entry.
        </p>

        <div className="connector-form-grid" style={{ marginTop: "0.8rem" }}>
          <label className="connector-field">
            <span>Connector type</span>
            <select
              value={newConnector.connectorType}
              onChange={(event) => setNewConnector((current) => ({ ...current, connectorType: event.target.value as ConnectorType }))}
            >
              <option value="google_docs">Google Docs</option>
              <option value="google_drive">Google Drive</option>
              <option value="slack">Slack</option>
              <option value="microsoft_teams">Microsoft Teams</option>
              <option value="microsoft_sharepoint">Microsoft SharePoint</option>
              <option value="microsoft_onedrive">Microsoft OneDrive</option>
            </select>
          </label>
          <label className="connector-field">
            <span>Display name</span>
            <input
              value={newConnector.displayName}
              onChange={(event) => setNewConnector((current) => ({ ...current, displayName: event.target.value }))}
              placeholder="Product Workspace"
            />
          </label>
          <label className="connector-field">
            <span>Workspace ID</span>
            <input
              value={newConnector.externalWorkspaceId}
              onChange={(event) =>
                setNewConnector((current) => ({ ...current, externalWorkspaceId: event.target.value }))
              }
              placeholder="workspace_123"
            />
          </label>
          <label className="connector-field">
            <span>Access token</span>
            <input
              value={newConnector.accessToken}
              onChange={(event) => setNewConnector((current) => ({ ...current, accessToken: event.target.value }))}
              placeholder="Paste access token"
            />
          </label>
          <label className="connector-field">
            <span>Refresh token (optional)</span>
            <input
              value={newConnector.refreshToken}
              onChange={(event) => setNewConnector((current) => ({ ...current, refreshToken: event.target.value }))}
              placeholder="Paste refresh token"
            />
          </label>
          <label className="connector-field">
            <span>Token expiry (optional)</span>
            <input
              type="datetime-local"
              value={newConnector.tokenExpiresAt}
              onChange={(event) => setNewConnector((current) => ({ ...current, tokenExpiresAt: event.target.value }))}
            />
          </label>
        </div>

        <div className="chip-row" style={{ marginTop: "0.8rem" }}>
          <button
            type="button"
            className="ask-submit"
            disabled={
              loading ||
              newConnector.displayName.trim().length < 2 ||
              newConnector.externalWorkspaceId.trim().length < 2 ||
              newConnector.accessToken.trim().length < 8
            }
            onClick={() => void createConnector()}
          >
            {loading ? "Saving..." : "Create connector"}
          </button>
          <button type="button" className="chip" disabled={loading} onClick={() => void refreshConnectors()}>
            Refresh
          </button>
        </div>
      </section>

      {error ? <p className="error-banner">{error}</p> : null}

      <section className="surface-card">
        <h2 className="surface-title">Connected sources</h2>
        <p className="surface-sub">Run syncs, inspect failures, and rotate connector credentials without API calls.</p>

        {sortedConnectors.length === 0 ? (
          <p className="surface-sub" style={{ marginTop: "0.8rem" }}>
            No source integrations yet. Create your first connector above.
          </p>
        ) : (
          <div className="connector-list">
            {sortedConnectors.map((connector) => {
              const runHistory = runsByConnector[connector.id] ?? [];
              const latestRun = runHistory[0];
              const draft = drafts[connector.id] ?? createDraft(connector);
              const editing = activeEditorId === connector.id;

              return (
                <article key={connector.id} className="connector-card">
                  <header className="connector-card__head">
                    <div>
                      <h3>{connector.displayName ?? connector.connectorType}</h3>
                      <p>
                        {connector.connectorType} · Updated {formatTime(connector.updatedAt)}
                      </p>
                    </div>
                    <div className="chip-row">
                      <span className={`chip ${connector.status === "active" ? "chip--active" : ""}`}>
                        {connector.status}
                      </span>
                      <span className="chip">Last sync {formatTime(connector.lastSyncedAt)}</span>
                    </div>
                  </header>

                  {latestRun ? (
                    <div className="connector-run-summary">
                      <span className="chip">{latestRun.status}</span>
                      <span className="chip">
                        Seen {latestRun.itemsSeen ?? 0} · Changed {latestRun.itemsChanged ?? 0}
                      </span>
                      {latestRun.failureClassification ? (
                        <span className="chip">Failure {latestRun.failureClassification}</span>
                      ) : null}
                      {latestRun.errorMessage ? <span className="chip">Error {latestRun.errorMessage}</span> : null}
                    </div>
                  ) : (
                    <p className="surface-sub" style={{ marginTop: "0.6rem" }}>
                      No runs yet. Trigger first sync.
                    </p>
                  )}

                  <div className="chip-row" style={{ marginTop: "0.7rem" }}>
                    <ConnectorSyncButton
                      orgId={props.orgId}
                      connectorId={connector.id}
                      onQueued={() => {
                        window.setTimeout(() => {
                          void refreshConnectors();
                        }, 900);
                      }}
                    />
                    <button
                      type="button"
                      className="chip"
                      onClick={() => setActiveEditorId((current) => (current === connector.id ? null : connector.id))}
                    >
                      {editing ? "Close editor" : "Edit connector"}
                    </button>
                    <button type="button" className="chip" onClick={() => void deleteConnector(connector.id)}>
                      Delete
                    </button>
                  </div>

                  {editing ? (
                    <div className="connector-form-grid" style={{ marginTop: "0.8rem" }}>
                      <label className="connector-field">
                        <span>Display name</span>
                        <input
                          value={draft.displayName}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [connector.id]: { ...draft, displayName: event.target.value }
                            }))
                          }
                        />
                      </label>
                      <label className="connector-field">
                        <span>Workspace ID</span>
                        <input
                          value={draft.externalWorkspaceId}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [connector.id]: { ...draft, externalWorkspaceId: event.target.value }
                            }))
                          }
                        />
                      </label>
                      <label className="connector-field">
                        <span>Status</span>
                        <select
                          value={draft.status}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [connector.id]: { ...draft, status: event.target.value as ConnectorStatus }
                            }))
                          }
                        >
                          <option value="active">active</option>
                          <option value="reauth_required">reauth_required</option>
                          <option value="disabled">disabled</option>
                        </select>
                      </label>
                      <label className="connector-field">
                        <span>New access token (optional)</span>
                        <input
                          value={draft.accessToken}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [connector.id]: { ...draft, accessToken: event.target.value }
                            }))
                          }
                          placeholder="Leave blank to keep current"
                        />
                      </label>
                      <label className="connector-field">
                        <span>New refresh token (optional)</span>
                        <input
                          value={draft.refreshToken}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [connector.id]: { ...draft, refreshToken: event.target.value }
                            }))
                          }
                          placeholder="Leave blank to keep current"
                        />
                      </label>
                      <label className="connector-field">
                        <span>Token expiry (optional)</span>
                        <input
                          type="datetime-local"
                          value={draft.tokenExpiresAt}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [connector.id]: { ...draft, tokenExpiresAt: event.target.value }
                            }))
                          }
                        />
                      </label>
                      <div className="chip-row" style={{ marginTop: "0.1rem" }}>
                        <button
                          type="button"
                          className="ask-submit"
                          disabled={loading || draft.displayName.trim().length < 2 || draft.externalWorkspaceId.trim().length < 2}
                          onClick={() => void updateConnector(connector.id)}
                        >
                          Save changes
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {runHistory.length > 0 ? (
                    <div className="connector-run-history">
                      <p>Recent runs</p>
                      {runHistory.map((run) => (
                        <div key={run.id} className="connector-run-row">
                          <span>{formatTime(run.startedAt)}</span>
                          <span>{run.status}</span>
                          <span>
                            {run.itemsChanged ?? 0}/{run.itemsSeen ?? 0}
                          </span>
                          <span>{run.failureClassification ?? "ok"}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
