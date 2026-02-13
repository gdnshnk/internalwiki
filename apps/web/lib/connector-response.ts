import type { ConnectorAccountRecord } from "@internalwiki/db";

export type ConnectorAccountPublic = {
  id: string;
  organizationId: string;
  connectorType: ConnectorAccountRecord["connectorType"];
  status: ConnectorAccountRecord["status"];
  tokenExpiresAt?: string;
  syncCursor?: string;
  lastSyncedAt?: string;
  displayName?: string;
  externalWorkspaceId?: string;
  hasRefreshToken: boolean;
  createdAt: string;
  updatedAt: string;
};

export function toPublicConnector(account: ConnectorAccountRecord): ConnectorAccountPublic {
  return {
    id: account.id,
    organizationId: account.organizationId,
    connectorType: account.connectorType,
    status: account.status,
    tokenExpiresAt: account.tokenExpiresAt,
    syncCursor: account.syncCursor,
    lastSyncedAt: account.lastSyncedAt,
    displayName: account.displayName,
    externalWorkspaceId: account.externalWorkspaceId,
    hasRefreshToken: Boolean(account.encryptedRefreshToken),
    createdAt: account.createdAt,
    updatedAt: account.updatedAt
  };
}
