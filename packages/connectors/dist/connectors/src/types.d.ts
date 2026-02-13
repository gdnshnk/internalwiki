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
    sourceType: ConnectorType;
    updatedAt: string;
    owner: string;
    mimeType: string;
    content: string;
};
export type ConnectorSyncResult = {
    nextCursor?: string;
    items: NormalizedExternalItem[];
};
export type ConnectorErrorClassification = "transient" | "auth" | "payload";
export declare class ConnectorSyncError extends Error {
    readonly classification: ConnectorErrorClassification;
    readonly statusCode?: number;
    constructor(message: string, classification: ConnectorErrorClassification, statusCode?: number);
}
export interface WorkspaceConnector {
    type: ConnectorType;
    sync(input: ConnectorSyncInput): Promise<ConnectorSyncResult>;
}
//# sourceMappingURL=types.d.ts.map