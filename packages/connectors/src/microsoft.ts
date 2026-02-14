import { createHash } from "node:crypto";
import type { ConnectorSyncInput, ConnectorSyncResult, NormalizedExternalItem, WorkspaceConnector } from "./types";
import { ConnectorSyncError } from "./types";

type GraphSite = {
  id: string;
  name?: string;
  webUrl?: string;
  lastModifiedDateTime?: string;
};

type GraphDriveItem = {
  id: string;
  name?: string;
  webUrl?: string;
  lastModifiedDateTime?: string;
  file?: {
    mimeType?: string;
  };
  createdBy?: {
    user?: {
      email?: string;
      displayName?: string;
    };
  };
};

type GraphChatMessage = {
  id: string;
  body?: {
    content?: string;
  };
  lastModifiedDateTime?: string;
};

type GraphCollection<T> = {
  value?: T[];
};

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

function checksum(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function useSampleMode(input: ConnectorSyncInput): boolean {
  if (!input.credentials.accessToken) {
    return true;
  }
  return process.env.INTERNALWIKI_CONNECTOR_MODE === "sample";
}

function classifyError(status: number): "auth" | "transient" | "payload" {
  if (status === 401 || status === 403) {
    return "auth";
  }
  if (status === 408 || status === 429 || status >= 500) {
    return "transient";
  }
  return "payload";
}

async function graphRequest<T>(accessToken: string, path: string): Promise<T> {
  const response = await fetch(`${GRAPH_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new ConnectorSyncError(`Microsoft Graph request failed (${response.status})`, classifyError(response.status), response.status);
  }

  return (await response.json()) as T;
}

function sampleByType(type: WorkspaceConnector["type"], nowIso: string, organizationId: string): NormalizedExternalItem[] {
  if (type === "microsoft_teams") {
    return [
      {
        externalId: "teams-ops-standup",
        checksum: checksum(`teams-ops-standup:${nowIso}`),
        title: "Teams: Ops Standup Notes",
        sourceUrl: "https://teams.microsoft.com/l/channel/ops-standup",
        canonicalSourceUrl: "https://teams.microsoft.com/l/channel/ops-standup",
        sourceType: "microsoft_teams",
        updatedAt: nowIso,
        sourceLastUpdatedAt: nowIso,
        sourceVersionLabel: "sample-v1",
        sourceExternalId: "ops-standup",
        sourceFormat: "microsoft/teams-channel",
        owner: "ops@internalwiki.com",
        author: "ops@internalwiki.com",
        sourceSystem: "microsoft",
        aclPrincipalKeys: [`org:${organizationId}:member`, "email:ops@internalwiki.com"],
        mimeType: "text/plain",
        content: "Incident review cadence and escalation owner updates discussed in Teams channel."
      }
    ];
  }

  if (type === "microsoft_sharepoint") {
    return [
      {
        externalId: "sharepoint-security-playbook",
        checksum: checksum(`sharepoint-security-playbook:${nowIso}`),
        title: "SharePoint: Security Playbook",
        sourceUrl: "https://contoso.sharepoint.com/sites/security/Shared%20Documents/playbook.docx",
        canonicalSourceUrl: "https://contoso.sharepoint.com/sites/security/Shared%20Documents/playbook.docx",
        sourceType: "microsoft_sharepoint",
        updatedAt: nowIso,
        sourceLastUpdatedAt: nowIso,
        sourceVersionLabel: "sample-v1",
        sourceExternalId: "security-playbook",
        sourceFormat: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        owner: "security@internalwiki.com",
        author: "security@internalwiki.com",
        sourceSystem: "microsoft",
        aclPrincipalKeys: [`org:${organizationId}:member`, "email:security@internalwiki.com"],
        mimeType: "text/plain",
        content: "Security incident procedures, comms templates, and post-incident review checklist."
      }
    ];
  }

  return [
    {
      externalId: "onedrive-q1-brief",
      checksum: checksum(`onedrive-q1-brief:${nowIso}`),
      title: "OneDrive: Q1 Brief",
      sourceUrl: "https://onedrive.live.com/view.aspx?resid=q1-brief",
      canonicalSourceUrl: "https://onedrive.live.com/view.aspx?resid=q1-brief",
      sourceType: "microsoft_onedrive",
      updatedAt: nowIso,
      sourceLastUpdatedAt: nowIso,
      sourceVersionLabel: "sample-v1",
      sourceExternalId: "q1-brief",
      sourceFormat: "text/plain",
      owner: "leadership@internalwiki.com",
      author: "leadership@internalwiki.com",
      sourceSystem: "microsoft",
      aclPrincipalKeys: [`org:${organizationId}:member`, "email:leadership@internalwiki.com"],
      mimeType: "text/plain",
      content: "Quarterly priorities and dependencies from leadership brief."
    }
  ];
}

async function resolveSharePointItems(accessToken: string, organizationId: string): Promise<NormalizedExternalItem[]> {
  const sites = await graphRequest<GraphCollection<GraphSite>>(accessToken, "/sites?search=*");
  const chosenSite = sites.value?.[0];
  if (!chosenSite?.id) {
    return [];
  }

  const driveItems = await graphRequest<GraphCollection<GraphDriveItem>>(accessToken, `/sites/${chosenSite.id}/drive/root/children`);
  const nowIso = new Date().toISOString();

  return (driveItems.value ?? []).map((item) => ({
    externalId: item.id,
    checksum: checksum(`${item.id}:${item.lastModifiedDateTime ?? nowIso}`),
    title: item.name ?? `SharePoint item ${item.id}`,
    sourceUrl: item.webUrl ?? chosenSite.webUrl ?? "https://sharepoint.microsoft.com",
    canonicalSourceUrl: item.webUrl ?? chosenSite.webUrl ?? "https://sharepoint.microsoft.com",
    sourceType: "microsoft_sharepoint",
    updatedAt: item.lastModifiedDateTime ?? nowIso,
    sourceLastUpdatedAt: item.lastModifiedDateTime ?? nowIso,
    sourceVersionLabel: `updated-${Date.parse(item.lastModifiedDateTime ?? nowIso)}`,
    sourceExternalId: item.id,
    sourceFormat: item.file?.mimeType ?? "application/octet-stream",
    owner: item.createdBy?.user?.email ?? item.createdBy?.user?.displayName ?? "microsoft-workspace",
    author: item.createdBy?.user?.email ?? item.createdBy?.user?.displayName ?? "microsoft-workspace",
    sourceSystem: "microsoft",
    aclPrincipalKeys: [`org:${organizationId}:member`],
    mimeType: item.file?.mimeType ?? "application/octet-stream",
    content: `SharePoint item "${item.name ?? item.id}" indexed as metadata-only. Full body extraction pending.`
  }));
}

async function resolveOneDriveItems(accessToken: string, organizationId: string): Promise<NormalizedExternalItem[]> {
  const payload = await graphRequest<GraphCollection<GraphDriveItem>>(accessToken, "/me/drive/root/children");
  const nowIso = new Date().toISOString();
  return (payload.value ?? []).map((item) => ({
    externalId: item.id,
    checksum: checksum(`${item.id}:${item.lastModifiedDateTime ?? nowIso}`),
    title: item.name ?? `OneDrive item ${item.id}`,
    sourceUrl: item.webUrl ?? "https://onedrive.live.com",
    canonicalSourceUrl: item.webUrl ?? "https://onedrive.live.com",
    sourceType: "microsoft_onedrive",
    updatedAt: item.lastModifiedDateTime ?? nowIso,
    sourceLastUpdatedAt: item.lastModifiedDateTime ?? nowIso,
    sourceVersionLabel: `updated-${Date.parse(item.lastModifiedDateTime ?? nowIso)}`,
    sourceExternalId: item.id,
    sourceFormat: item.file?.mimeType ?? "application/octet-stream",
    owner: item.createdBy?.user?.email ?? item.createdBy?.user?.displayName ?? "microsoft-workspace",
    author: item.createdBy?.user?.email ?? item.createdBy?.user?.displayName ?? "microsoft-workspace",
    sourceSystem: "microsoft",
    aclPrincipalKeys: [`org:${organizationId}:member`],
    mimeType: item.file?.mimeType ?? "application/octet-stream",
    content: `OneDrive item "${item.name ?? item.id}" indexed as metadata-only.`
  }));
}

async function resolveTeamsItems(accessToken: string, organizationId: string): Promise<NormalizedExternalItem[]> {
  const payload = await graphRequest<GraphCollection<GraphChatMessage>>(accessToken, "/me/chats?$top=20");
  const nowIso = new Date().toISOString();
  return (payload.value ?? []).map((message) => ({
    externalId: message.id,
    checksum: checksum(`${message.id}:${message.lastModifiedDateTime ?? nowIso}`),
    title: `Teams chat ${message.id.slice(0, 8)}`,
    sourceUrl: "https://teams.microsoft.com",
    canonicalSourceUrl: "https://teams.microsoft.com",
    sourceType: "microsoft_teams",
    updatedAt: message.lastModifiedDateTime ?? nowIso,
    sourceLastUpdatedAt: message.lastModifiedDateTime ?? nowIso,
    sourceVersionLabel: `updated-${Date.parse(message.lastModifiedDateTime ?? nowIso)}`,
    sourceExternalId: message.id,
    sourceFormat: "microsoft/teams-message",
    owner: "microsoft-workspace",
    author: "microsoft-workspace",
    sourceSystem: "microsoft",
    aclPrincipalKeys: [`org:${organizationId}:member`],
    mimeType: "text/plain",
    content: (message.body?.content ?? "").replace(/<[^>]+>/g, " ").trim() || "Teams message metadata-only item."
  }));
}

class MicrosoftConnectorBase implements WorkspaceConnector {
  readonly type;

  constructor(type: "microsoft_teams" | "microsoft_sharepoint" | "microsoft_onedrive") {
    this.type = type;
  }

  async sync(input: ConnectorSyncInput): Promise<ConnectorSyncResult> {
    const nowIso = new Date().toISOString();
    if (useSampleMode(input)) {
      return {
        nextCursor: nowIso,
        items: sampleByType(this.type, nowIso, input.organizationId)
      };
    }

    const accessToken = input.credentials.accessToken;
    let items: NormalizedExternalItem[] = [];
    if (this.type === "microsoft_teams") {
      items = await resolveTeamsItems(accessToken, input.organizationId);
    } else if (this.type === "microsoft_sharepoint") {
      items = await resolveSharePointItems(accessToken, input.organizationId);
    } else {
      items = await resolveOneDriveItems(accessToken, input.organizationId);
    }

    return {
      nextCursor: nowIso,
      items
    };
  }
}

export class MicrosoftTeamsConnector extends MicrosoftConnectorBase {
  constructor() {
    super("microsoft_teams");
  }
}

export class MicrosoftSharePointConnector extends MicrosoftConnectorBase {
  constructor() {
    super("microsoft_sharepoint");
  }
}

export class MicrosoftOneDriveConnector extends MicrosoftConnectorBase {
  constructor() {
    super("microsoft_onedrive");
  }
}
