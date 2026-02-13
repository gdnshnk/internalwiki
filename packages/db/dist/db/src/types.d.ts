import type { ConnectorSyncRunStatus, ConnectorType, OrgRole, ReviewAction, SourceScore } from "@internalwiki/core";
export type ConnectorAccount = {
    id: string;
    organizationId: string;
    connectorType: ConnectorType;
    status: "active" | "reauth_required" | "disabled";
    encryptedAccessToken: string;
    encryptedRefreshToken?: string;
    lastSyncedAt?: string;
    syncCursor?: string;
};
export type SyncRun = {
    id: string;
    organizationId: string;
    connectorAccountId: string;
    status: ConnectorSyncRunStatus;
    startedAt: string;
    completedAt?: string;
    itemsSeen?: number;
    itemsChanged?: number;
    itemsSkipped?: number;
    itemsFailed?: number;
    failureClassification?: "transient" | "auth" | "payload";
    errorMessage?: string;
};
export type ReviewQueueItem = {
    id: string;
    organizationId: string;
    summaryId: string;
    status: "pending" | "approved" | "rejected";
    createdAt: string;
    updatedAt: string;
};
export type SessionContext = {
    userId: string;
    email: string;
    organizationId: string;
    role: OrgRole;
};
export type DocumentSummaryRecord = {
    documentId: string;
    organizationId: string;
    summary: string;
    sourceScore: SourceScore;
};
export type ReviewActionInput = {
    itemId: string;
    summaryId: string;
    action: ReviewAction;
    reason?: string;
};
export type ConnectorAccountUpsertInput = {
    id: string;
    organizationId: string;
    connectorType: ConnectorType;
    encryptedAccessToken: string;
    encryptedRefreshToken?: string;
    tokenExpiresAt?: string;
    status?: "active" | "reauth_required" | "disabled";
    createdBy?: string;
    syncCursor?: string;
    displayName?: string;
    externalWorkspaceId?: string;
};
export type ConnectorAccountRecord = {
    id: string;
    organizationId: string;
    connectorType: ConnectorType;
    status: "active" | "reauth_required" | "disabled";
    encryptedAccessToken: string;
    encryptedRefreshToken?: string;
    tokenExpiresAt?: string;
    syncCursor?: string;
    lastSyncedAt?: string;
    displayName?: string;
    externalWorkspaceId?: string;
    createdAt: string;
    updatedAt: string;
};
export type ChunkSearchRecord = {
    chunkId: string;
    docVersionId: string;
    text: string;
    sourceUrl: string;
    sourceScore: number;
    vectorRank?: number;
    lexicalRank?: number;
    vectorDistance?: number;
    lexicalScore?: number;
    combinedScore: number;
    updatedAt: string;
    connectorType: ConnectorType;
};
//# sourceMappingURL=types.d.ts.map