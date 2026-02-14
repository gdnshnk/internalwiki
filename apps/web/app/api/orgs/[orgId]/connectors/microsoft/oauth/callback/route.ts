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

type MicrosoftTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  id_token?: string;
  error?: string;
  error_description?: string;
};

function redirectWithError(origin: string, message: string): Response {
  return NextResponse.redirect(new URL(`/app/settings/connectors?error=${encodeURIComponent(message)}`, origin));
}

function decodeJwtPayload(jwt: string | undefined): Record<string, unknown> {
  if (!jwt) {
    return {};
  }
  const parts = jwt.split(".");
  if (parts.length < 2) {
    return {};
  }
  try {
    return JSON.parse(Buffer.from(parts[1] ?? "", "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function exchangeMicrosoftCode(input: {
  code: string;
  redirectUri: string;
}): Promise<MicrosoftTokenResponse> {
  if (process.env.INTERNALWIKI_CONNECTOR_MODE === "sample") {
    return {
      access_token: `sample-microsoft-${randomUUID()}`,
      refresh_token: `sample-microsoft-refresh-${randomUUID()}`,
      expires_in: 3600
    };
  }

  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Microsoft OAuth credentials are missing");
  }

  const form = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code: input.code,
    grant_type: "authorization_code",
    redirect_uri: input.redirectUri
  });
  const response = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: form.toString()
  });

  if (!response.ok) {
    throw new Error(`Microsoft token exchange failed (${response.status})`);
  }

  return (await response.json()) as MicrosoftTokenResponse;
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

  const redirectUri = process.env.MICROSOFT_OAUTH_REDIRECT_URI;
  if (!redirectUri) {
    return redirectWithError(request.url, "Microsoft OAuth is not configured");
  }

  const params = new URL(request.url).searchParams;
  const state = params.get("state");
  const code = params.get("code");
  if (!state || !code) {
    return redirectWithError(request.url, "Microsoft OAuth callback missing required parameters");
  }

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(`iw_microsoft_oauth_state_${orgId}`)?.value;
  const connectorTypeCookie = cookieStore.get(`iw_microsoft_connector_type_${orgId}`)?.value;
  if (!expectedState || expectedState !== state) {
    return redirectWithError(request.url, "Microsoft OAuth state verification failed");
  }
  if (
    connectorTypeCookie !== "microsoft_teams" &&
    connectorTypeCookie !== "microsoft_sharepoint" &&
    connectorTypeCookie !== "microsoft_onedrive"
  ) {
    return redirectWithError(request.url, "Missing Microsoft connector type selection");
  }

  const connectorType = connectorTypeCookie;
  const nextPath = cookieStore.get(`iw_microsoft_oauth_next_${orgId}`)?.value ?? "/app/settings/connectors";

  try {
    const token = await exchangeMicrosoftCode({ code, redirectUri });
    if (!token.access_token) {
      return redirectWithError(request.url, token.error_description ?? token.error ?? "Microsoft OAuth failed");
    }

    const claims = decodeJwtPayload(token.id_token);
    const tenantId = String(claims.tid ?? "microsoft-tenant");
    const workspaceName = String(claims.tid ?? "Microsoft Workspace");

    const encryptedAccessToken = encryptSecret(token.access_token);
    const encryptedRefreshToken = token.refresh_token ? encryptSecret(token.refresh_token) : undefined;
    const tokenExpiresAt = token.expires_in
      ? new Date(Date.now() + token.expires_in * 1000).toISOString()
      : undefined;
    const existing = (await listConnectorAccounts(orgId)).find(
      (connector) => connector.connectorType === connectorType
    );

    const connector = existing
      ? await updateConnectorAccount(orgId, existing.id, {
          status: "active",
          encryptedAccessToken,
          encryptedRefreshToken,
          tokenExpiresAt,
          displayName: existing.displayName ?? workspaceName,
          externalWorkspaceId: existing.externalWorkspaceId ?? tenantId
        })
      : await createConnectorAccount({
          id: randomUUID(),
          organizationId: orgId,
          connectorType,
          encryptedAccessToken,
          encryptedRefreshToken,
          tokenExpiresAt,
          status: "active",
          displayName: workspaceName,
          externalWorkspaceId: tenantId,
          createdBy: session.userId
        });

    if (!connector) {
      return redirectWithError(request.url, "Microsoft connector upsert failed");
    }

    await upsertUserSourceIdentity({
      organizationId: orgId,
      userId: session.userId,
      sourceSystem: "microsoft",
      sourceUserKey: `email:${session.email.toLowerCase()}`,
      displayName: session.email,
      createdBy: session.userId
    });
    await upsertUserSourceIdentity({
      organizationId: orgId,
      userId: session.userId,
      sourceSystem: "microsoft",
      sourceUserKey: `org:${orgId}:member`,
      displayName: "Organization member access",
      createdBy: session.userId
    });

    const queued = await enqueueSyncConnectorJob({
      organizationId: orgId,
      connectorAccountId: connector.id,
      connectorType,
      triggeredBy: session.userId
    });

    await writeAuditEvent({
      organizationId: orgId,
      actorId: session.userId,
      eventType: "connector.oauth.connected",
      entityType: "connector_account",
      entityId: connector.id,
      payload: {
        provider: "microsoft",
        connectorType,
        queueJobId: queued.jobId
      }
    });

    const response = NextResponse.redirect(new URL(`${nextPath}?connected=${connectorType}`, request.url));
    response.cookies.delete(`iw_microsoft_oauth_state_${orgId}`);
    response.cookies.delete(`iw_microsoft_oauth_next_${orgId}`);
    response.cookies.delete(`iw_microsoft_connector_type_${orgId}`);
    return response;
  } catch (error) {
    return redirectWithError(request.url, (error as Error).message);
  }
}
