import type { ConnectorType } from "@internalwiki/core";

export type ConnectorCredentials = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
};

export type ConnectorSyncInput = {
  connectorAccountId: string;
  organizationId: string;
  lastCursor?: string;
  credentials: ConnectorCredentials;
};

export type NormalizedExternalItem = {
  externalId: string;
  checksum: string;
  title: string;
  sourceUrl: string;
  canonicalSourceUrl?: string;
  sourceType: ConnectorType;
  updatedAt: string;
  sourceLastUpdatedAt?: string;
  sourceVersionLabel?: string;
  sourceExternalId?: string;
  sourceFormat?: string;
  owner: string;
  author?: string;
  mimeType: string;
  content: string;
};

export type ConnectorSyncResult = {
  nextCursor?: string;
  items: NormalizedExternalItem[];
};

export type ConnectorErrorClassification = "transient" | "auth" | "payload";

export class ConnectorSyncError extends Error {
  readonly classification: ConnectorErrorClassification;
  readonly statusCode?: number;

  constructor(message: string, classification: ConnectorErrorClassification, statusCode?: number) {
    super(message);
    this.name = "ConnectorSyncError";
    this.classification = classification;
    this.statusCode = statusCode;
  }
}

export interface WorkspaceConnector {
  type: ConnectorType;
  sync(input: ConnectorSyncInput): Promise<ConnectorSyncResult>;
}
