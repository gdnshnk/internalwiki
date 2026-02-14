import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  createConnectorAccount,
  listConnectorAccounts,
  updateConnectorAccount,
  upsertUserSourceIdentity
} from "@internalwiki/db";
import { requireSessionContext } from "@/lib/api-auth";
import { writeAuditEvent } from "@/lib/audit";
import { encryptSecret } from "@/lib/crypto";
import { enqueueSyncConnectorJob } from "@/lib/worker-jobs";

type SlackOauthTokenResponse = {
  ok?: boolean;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  team?: {
    id?: string;
    name?: string;
  };
};

function redirectWithError(origin: string, message: string): Response {
  return NextResponse.redirect(new URL(`/app/settings/connectors?error=${encodeURIComponent(message)}`, origin));
}

async function exchangeSlackCode(input: {
  code: string;
  redirectUri: string;
}): Promise<SlackOauthTokenResponse> {
  if (process.env.INTERNALWIKI_CONNECTOR_MODE === "sample") {
    return {
      ok: true,
      access_token: `sample-slack-${randomUUID()}`,
      refresh_token: `sample-slack-refresh-${randomUUID()}`,
      expires_in: 3600,
      team: { id: "sample-team", name: "Sample Slack Workspace" }
    };
  }

  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Slack OAuth credentials are missing");
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code: input.code,
    redirect_uri: input.redirectUri
  });

  const response = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: body.toString()
  });

  if (!response.ok) {
    throw new Error(`Slack token exchange failed (${response.status})`);
  }

  return (await response.json()) as SlackOauthTokenResponse;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ orgId: string }> }
): Promise<Response> {
  const { orgId } = await context.params;
  const sessionResult = await requireSessionContext(randomUUID());
  if (sessionResult instanceof Response) {
    return NextResponse.redirect(new URL(`/auth/login?next=${encodeURIComponent("/app/settings/connectors")}`, request.url));
  }
  const session = sessionResult;
  if (session.organizationId !== orgId) {
    return redirectWithError(request.url, "Cross-org callback denied");
  }

  const redirectUri = process.env.SLACK_OAUTH_REDIRECT_URI;
  if (!redirectUri) {
    return redirectWithError(request.url, "Slack OAuth is not configured");
  }

  const params = new URL(request.url).searchParams;
  const state = params.get("state");
  const code = params.get("code");
  if (!state || !code) {
    return redirectWithError(request.url, "Slack OAuth callback missing required parameters");
  }

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(`iw_slack_oauth_state_${orgId}`)?.value;
  if (!expectedState || expectedState !== state) {
    return redirectWithError(request.url, "Slack OAuth state verification failed");
  }
  const nextPath = cookieStore.get(`iw_slack_oauth_next_${orgId}`)?.value ?? "/app/settings/connectors";

  try {
    const token = await exchangeSlackCode({ code, redirectUri });
    if (!token.ok || !token.access_token) {
      return redirectWithError(request.url, `Slack OAuth failed: ${token.error ?? "invalid token payload"}`);
    }

    const encryptedAccessToken = encryptSecret(token.access_token);
    const encryptedRefreshToken = token.refresh_token ? encryptSecret(token.refresh_token) : undefined;
    const tokenExpiresAt = token.expires_in
      ? new Date(Date.now() + token.expires_in * 1000).toISOString()
      : undefined;
    const existing = (await listConnectorAccounts(orgId)).find((connector) => connector.connectorType === "slack");

    const connector = existing
      ? await updateConnectorAccount(orgId, existing.id, {
          status: "active",
          encryptedAccessToken,
          encryptedRefreshToken,
          tokenExpiresAt,
          displayName: token.team?.name ?? existing.displayName ?? "Slack Workspace",
          externalWorkspaceId: token.team?.id ?? existing.externalWorkspaceId ?? "slack-workspace"
        })
      : await createConnectorAccount({
          id: randomUUID(),
          organizationId: orgId,
          connectorType: "slack",
          encryptedAccessToken,
          encryptedRefreshToken,
          tokenExpiresAt,
          status: "active",
          displayName: token.team?.name ?? "Slack Workspace",
          externalWorkspaceId: token.team?.id ?? "slack-workspace",
          createdBy: session.userId
        });

    if (!connector) {
      return redirectWithError(request.url, "Slack connector upsert failed");
    }

    await upsertUserSourceIdentity({
      organizationId: orgId,
      userId: session.userId,
      sourceSystem: "slack",
      sourceUserKey: `email:${session.email.toLowerCase()}`,
      displayName: session.email,
      createdBy: session.userId
    });
    await upsertUserSourceIdentity({
      organizationId: orgId,
      userId: session.userId,
      sourceSystem: "slack",
      sourceUserKey: `org:${orgId}:member`,
      displayName: "Organization member access",
      createdBy: session.userId
    });

    const queued = await enqueueSyncConnectorJob({
      organizationId: orgId,
      connectorAccountId: connector.id,
      connectorType: "slack",
      triggeredBy: session.userId
    });

    await writeAuditEvent({
      organizationId: orgId,
      actorId: session.userId,
      eventType: "connector.oauth.connected",
      entityType: "connector_account",
      entityId: connector.id,
      payload: {
        provider: "slack",
        queueJobId: queued.jobId
      }
    });

    const response = NextResponse.redirect(new URL(`${nextPath}?connected=slack`, request.url));
    response.cookies.delete(`iw_slack_oauth_state_${orgId}`);
    response.cookies.delete(`iw_slack_oauth_next_${orgId}`);
    return response;
  } catch (error) {
    return redirectWithError(request.url, (error as Error).message);
  }
}
