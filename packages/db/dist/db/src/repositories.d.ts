import type { Citation, ConnectorType, DocumentChunk, DocumentRecord, GroundedAnswer, ReviewAction, SourceScore } from "@internalwiki/core";
import type { ChunkSearchRecord, ConnectorAccountRecord, ConnectorAccountUpsertInput, ReviewQueueItem, SessionContext, SyncRun } from "./types";
export declare function listDocuments(organizationId: string): Promise<DocumentRecord[]>;
export declare function getDocumentById(organizationId: string, docId: string): Promise<DocumentRecord | null>;
export declare function listReviewQueue(organizationId: string): Promise<ReviewQueueItem[]>;
export declare function applyReviewAction(organizationId: string, summaryId: string, action: ReviewAction, params?: {
    actorId?: string;
    reason?: string;
}): Promise<ReviewQueueItem | null>;
export declare function persistGroundedAnswer(input: {
    organizationId: string;
    question: string;
    response: GroundedAnswer;
    actorId?: string;
}): Promise<void>;
export declare function resolveMembership(params: {
    userId?: string;
    email?: string;
    organizationId?: string;
}): Promise<SessionContext | null>;
export declare function upsertGoogleUserAndEnsureMembership(params: {
    googleSub: string;
    email: string;
    displayName?: string;
    organizationSlug: string;
    organizationName: string;
    role?: SessionContext["role"];
}): Promise<SessionContext>;
export declare function createConnectorAccount(input: ConnectorAccountUpsertInput): Promise<ConnectorAccountRecord>;
export declare function listConnectorAccounts(organizationId: string): Promise<ConnectorAccountRecord[]>;
export declare function getConnectorAccount(organizationId: string, connectorAccountId: string): Promise<ConnectorAccountRecord | null>;
export declare function updateConnectorAccount(organizationId: string, connectorAccountId: string, patch: {
    status?: ConnectorAccountRecord["status"];
    encryptedAccessToken?: string;
    encryptedRefreshToken?: string;
    tokenExpiresAt?: string;
    syncCursor?: string;
    displayName?: string;
    externalWorkspaceId?: string;
}): Promise<ConnectorAccountRecord | null>;
export declare function deleteConnectorAccount(organizationId: string, connectorAccountId: string): Promise<boolean>;
export declare function listActiveConnectorAccounts(): Promise<ConnectorAccountRecord[]>;
export declare function markConnectorReauthRequired(organizationId: string, connectorAccountId: string): Promise<void>;
export declare function startConnectorSyncRun(input: {
    organizationId: string;
    connectorAccountId: string;
    createdBy?: string;
}): Promise<SyncRun>;
export declare function finishConnectorSyncRun(input: {
    runId: string;
    organizationId: string;
    status: SyncRun["status"];
    itemsSeen: number;
    itemsChanged: number;
    itemsSkipped: number;
    itemsFailed: number;
    failureClassification?: SyncRun["failureClassification"];
    errorMessage?: string;
    nextCursor?: string;
    connectorAccountId: string;
}): Promise<SyncRun | null>;
export declare function listConnectorSyncRuns(organizationId: string, connectorAccountId: string, limit?: number): Promise<SyncRun[]>;
export declare function getConnectorSyncRun(organizationId: string, connectorAccountId: string, runId: string): Promise<SyncRun | null>;
export declare function getExternalItemChecksums(input: {
    organizationId: string;
    connectorAccountId: string;
    externalIds: string[];
}): Promise<Map<string, string>>;
export declare function upsertExternalItemAndDocuments(input: {
    organizationId: string;
    connectorAccountId: string;
    externalId: string;
    checksum: string;
    sourceType: ConnectorType;
    sourceUrl: string;
    title: string;
    owner: string;
    updatedAt: string;
    content: string;
    chunks: string[];
    embeddingVectors: string[];
    summary: string;
    sourceScore: SourceScore;
    createdBy?: string;
}): Promise<{
    changed: boolean;
    documentId: string;
    documentVersionId: string;
}>;
export declare function searchDocumentChunksHybrid(params: {
    organizationId: string;
    queryText: string;
    queryVector: string;
    sourceType?: ConnectorType;
    limit?: number;
}): Promise<ChunkSearchRecord[]>;
export declare function appendAuditEvent(input: {
    organizationId: string;
    actorId?: string;
    eventType: string;
    entityType: string;
    entityId: string;
    payload: Record<string, unknown>;
}): Promise<void>;
export declare function vectorToSqlLiteral(values: number[]): string;
export declare function hashEmbedding(text: string, dimensions?: number): number[];
export declare function toDocumentChunk(records: ChunkSearchRecord[]): DocumentChunk[];
export declare function getDocumentByVersionId(organizationId: string, documentVersionId: string): Promise<DocumentRecord | null>;
export declare function getCitationsForMessage(organizationId: string, messageId: string): Promise<Citation[]>;
export declare function touchConnectorLastSync(organizationId: string, connectorAccountId: string): Promise<void>;
export declare function getOrganizationIdsWithActiveConnectors(): Promise<string[]>;
export declare function getConnectorAccountsForOrganization(organizationId: string): Promise<ConnectorAccountRecord[]>;
export declare function getConnectorAccountById(connectorAccountId: string): Promise<ConnectorAccountRecord | null>;
export declare function getLatestDocumentVersionMetadata(organizationId: string, documentId: string): Promise<{
    id: string;
    contentHash: string;
    createdAt: string;
} | null>;
export declare function getSummaryCitationsByDocumentVersion(organizationId: string, documentVersionId: string): Promise<Citation[]>;
export declare function upsertSummaryReviewQueue(input: {
    organizationId: string;
    documentVersionId: string;
    summary: string;
    createdBy?: string;
}): Promise<{
    summaryId: string;
}>;
export declare function upsertSourceScore(input: {
    organizationId: string;
    documentVersionId: string;
    sourceScore: SourceScore;
    createdBy?: string;
}): Promise<void>;
export declare function updateConnectorSyncCursor(input: {
    organizationId: string;
    connectorAccountId: string;
    cursor: string;
}): Promise<void>;
export declare function listPendingReviewItems(organizationId: string): Promise<ReviewQueueItem[]>;
export declare function countDocumentsByOrganization(organizationId: string): Promise<number>;
export declare function createMembership(input: {
    organizationId: string;
    userId: string;
    role: SessionContext["role"];
    createdBy?: string;
}): Promise<void>;
export declare function getUserByEmail(email: string): Promise<{
    id: string;
    email: string;
} | null>;
export declare function ensureOrganization(input: {
    id: string;
    name: string;
    slug: string;
    createdBy?: string;
}): Promise<void>;
export declare function createOrUpdateUser(input: {
    id: string;
    email: string;
    displayName?: string;
}): Promise<void>;
export declare function getPrimaryMembership(userId: string): Promise<SessionContext | null>;
export declare function redactSecrets(value: unknown): unknown;
export declare function buildDeterministicContentHash(content: string): string;
export declare function timestampMs(): number;
export declare function isoNow(): string;
//# sourceMappingURL=repositories.d.ts.map