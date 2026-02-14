import { createHash } from "node:crypto";
import type { ConnectorSyncInput, ConnectorSyncResult, NormalizedExternalItem, WorkspaceConnector } from "./types";
import { ConnectorSyncError } from "./types";

type SlackChannel = {
  id: string;
  name?: string;
  created?: number;
};

type SlackMessage = {
  user?: string;
  text?: string;
  ts?: string;
};

type SlackApiResponse<T> = {
  ok: boolean;
  error?: string;
  channels?: SlackChannel[];
  messages?: SlackMessage[];
  response_metadata?: {
    next_cursor?: string;
  };
} & T;

const SLACK_API_BASE = "https://slack.com/api";

function checksum(value: string): string {
  return createHash("sha256").update(value).digest("hex");
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

async function slackApi<T>(accessToken: string, path: string, params: URLSearchParams): Promise<SlackApiResponse<T>> {
  const response = await fetch(`${SLACK_API_BASE}${path}?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new ConnectorSyncError(`Slack API request failed (${response.status})`, classifyError(response.status), response.status);
  }

  const payload = (await response.json()) as SlackApiResponse<T>;
  if (!payload.ok) {
    const errorCode = payload.error ?? "unknown_error";
    const classification = errorCode.includes("invalid_auth") || errorCode.includes("not_authed") ? "auth" : "payload";
    throw new ConnectorSyncError(`Slack API error: ${errorCode}`, classification);
  }

  return payload;
}

function buildSampleItems(nowIso: string, organizationId: string): NormalizedExternalItem[] {
  return [
    {
      externalId: "slack-channel-launch",
      checksum: checksum(`slack-channel-launch:${nowIso}`),
      title: "#launch-ops weekly summary",
      sourceUrl: "https://slack.com/app_redirect?channel=launch-ops",
      canonicalSourceUrl: "https://slack.com/app_redirect?channel=launch-ops",
      sourceType: "slack",
      updatedAt: nowIso,
      sourceLastUpdatedAt: nowIso,
      sourceVersionLabel: "sample-v1",
      sourceExternalId: "launch-ops",
      sourceFormat: "slack/channel",
      owner: "ops@internalwiki.com",
      author: "ops@internalwiki.com",
      sourceSystem: "slack",
      aclPrincipalKeys: [`org:${organizationId}:member`, "email:ops@internalwiki.com"],
      mimeType: "text/plain",
      content:
        "Launch operations updates: blocker triage moved to Tuesday standup. Owner assignments confirmed for security review and release checklist."
    }
  ];
}

export class SlackConnector implements WorkspaceConnector {
  readonly type = "slack" as const;

  async sync(input: ConnectorSyncInput): Promise<ConnectorSyncResult> {
    const nowIso = new Date().toISOString();
    if (useSampleMode(input)) {
      return {
        nextCursor: nowIso,
        items: buildSampleItems(nowIso, input.organizationId)
      };
    }

    const accessToken = input.credentials.accessToken;
    const channelsPayload = await slackApi<{}>(
      accessToken,
      "/conversations.list",
      new URLSearchParams({
        types: "public_channel,private_channel",
        limit: "20"
      })
    );

    const channels = channelsPayload.channels ?? [];
    const items: NormalizedExternalItem[] = [];
    for (const channel of channels) {
      const history = await slackApi<{}>(
        accessToken,
        "/conversations.history",
        new URLSearchParams({
          channel: channel.id,
          limit: "40"
        })
      );

      const lines = (history.messages ?? [])
        .slice(0, 40)
        .reverse()
        .map((message) => message.text ?? "")
        .filter((line) => line.trim().length > 0);

      const content = lines.join("\n");
      if (content.length === 0) {
        continue;
      }

      const updatedTs = history.messages?.[0]?.ts;
      const updatedAt = updatedTs ? new Date(Number(updatedTs) * 1000).toISOString() : nowIso;
      const title = channel.name ? `#${channel.name}` : `Slack channel ${channel.id}`;
      const sourceUrl = channel.name
        ? `https://slack.com/app_redirect?channel=${encodeURIComponent(channel.name)}`
        : `https://slack.com/app_redirect?channel=${encodeURIComponent(channel.id)}`;

      items.push({
        externalId: channel.id,
        checksum: checksum(`${channel.id}:${updatedAt}:${content.length}`),
        title,
        sourceUrl,
        canonicalSourceUrl: sourceUrl,
        sourceType: "slack",
        updatedAt,
        sourceLastUpdatedAt: updatedAt,
        sourceVersionLabel: `ts-${updatedTs ?? "unknown"}`,
        sourceExternalId: channel.id,
        sourceFormat: "slack/channel",
        owner: "slack-workspace",
        author: "slack-workspace",
        sourceSystem: "slack",
        aclPrincipalKeys: [`slack:channel:${channel.id}`, `org:${input.organizationId}:member`],
        mimeType: "text/plain",
        content
      });
    }

    return {
      nextCursor: nowIso,
      items
    };
  }
}
