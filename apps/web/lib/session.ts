import { cookies, headers } from "next/headers";
import type { OrgRole } from "@internalwiki/core";
import { getActiveUserSession, resolveMembership } from "@internalwiki/db";
import { safeInfo } from "@/lib/safe-log";
import { requestClientMetadataFromHeaders } from "@/lib/security";
import { parseSessionCookieValue } from "@/lib/session-cookie";

export type SessionContext = {
  userId: string;
  email: string;
  organizationId: string;
  role: OrgRole;
};

function toSessionContext(input: {
  userId: string;
  email: string;
  organizationId: string;
  role: OrgRole;
}): SessionContext {
  return {
    userId: input.userId,
    email: input.email,
    organizationId: input.organizationId,
    role: input.role
  };
}

export async function getSessionContextOptional(): Promise<SessionContext | null> {
  const cookieStore = await cookies();
  const rawSessionCookie = cookieStore.get("iw_session")?.value;
  const sessionEnvelope = parseSessionCookieValue(rawSessionCookie);

  if (sessionEnvelope) {
    const userSession = await getActiveUserSession(sessionEnvelope.sid);
    if (userSession) {
      const membership = await resolveMembership({
        userId: userSession.userId,
        organizationId: userSession.organizationId
      });

      if (membership) {
        const headerStore = await headers();
        const currentMetadata = requestClientMetadataFromHeaders(headerStore) as {
          ipAddress?: string | null;
          userAgent?: string | null;
        };
        const storedMetadata = (userSession.metadata ?? {}) as {
          ipAddress?: string | null;
          userAgent?: string | null;
        };
        const ipChanged =
          Boolean(storedMetadata.ipAddress) &&
          Boolean(currentMetadata.ipAddress) &&
          storedMetadata.ipAddress !== currentMetadata.ipAddress;
        const uaChanged =
          Boolean(storedMetadata.userAgent) &&
          Boolean(currentMetadata.userAgent) &&
          storedMetadata.userAgent !== currentMetadata.userAgent;
        if (ipChanged && uaChanged) {
          safeInfo("auth.session.metadata_drift", {
            sessionId: userSession.id,
            userId: userSession.userId,
            organizationId: userSession.organizationId
          });
        }

        return toSessionContext(membership);
      }
    }
  }

  const allowHeaderDebugAuth =
    process.env.NODE_ENV !== "production" && process.env.INTERNALWIKI_ENABLE_DEBUG_AUTH === "true";
  if (!allowHeaderDebugAuth) {
    return null;
  }

  const headerStore = await headers();
  const requestedOrgId = headerStore.get("x-org-id") ?? undefined;
  const userId = headerStore.get("x-user-id") ?? undefined;
  const email = headerStore.get("x-user-email") ?? undefined;

  const membership = await resolveMembership({
    userId,
    email,
    organizationId: requestedOrgId
  });
  if (!membership) {
    return null;
  }

  return toSessionContext(membership);
}

export async function getSessionContext(): Promise<SessionContext> {
  const session = await getSessionContextOptional();
  if (!session) {
    throw new Error("No authenticated membership found. Login first to create a valid session.");
  }
  return session;
}
