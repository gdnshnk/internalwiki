export type ConnectorType = "google_drive" | "google_docs" | "notion";
export type SourceTrustFactors = {
    recency: number;
    sourceAuthority: number;
    authorAuthority: number;
    citationCoverage: number;
};
export type SourceScore = {
    total: number;
    factors: SourceTrustFactors;
    computedAt: string;
    modelVersion: string;
};
export type Citation = {
    chunkId: string;
    docVersionId: string;
    sourceUrl: string;
    startOffset: number;
    endOffset: number;
};
export type GroundedAnswer = {
    answer: string;
    citations: Citation[];
    confidence: number;
    sourceScore: number;
};
export type AssistantMode = "ask" | "summarize" | "trace";
export type EvidenceItem = {
    id: string;
    title: string;
    connectorType: ConnectorType;
    sourceUrl: string;
    excerpt: string;
    sourceScore: number;
    relevance: number;
    reason: EvidenceReason;
    citation: Citation;
};
export type AssistantQueryRequest = {
    query: string;
    mode: AssistantMode;
    filters?: {
        sourceType?: ConnectorType;
    };
};
export type AssistantQueryResponse = {
    answer: string;
    confidence: number;
    sourceScore: number;
    citations: Citation[];
    sources: EvidenceItem[];
    timings: {
        retrievalMs: number;
        generationMs: number;
    };
    mode: AssistantMode;
    model: string;
};
export type EvidenceReason = "vector_similarity" | "text_match" | "trusted_source" | "recency_boost";
export type AssistantQueryStreamEvent = {
    type: "start";
    requestId: string;
    mode: AssistantMode;
} | {
    type: "chunk";
    requestId: string;
    text: string;
    firstTokenMs?: number;
} | {
    type: "complete";
    requestId: string;
    payload: AssistantQueryResponse;
    completionMs: number;
} | {
    type: "error";
    requestId: string;
    message: string;
};
export type ConnectorSyncRunStatus = "running" | "completed" | "failed";
export type ReviewAction = "approve" | "reject";
export type OrgRole = "owner" | "admin" | "editor" | "viewer";
export type DocumentRecord = {
    id: string;
    organizationId: string;
    title: string;
    sourceType: ConnectorType;
    sourceUrl: string;
    owner: string;
    updatedAt: string;
    summary?: string;
    sourceScore?: SourceScore;
};
export type DocumentChunk = {
    chunkId: string;
    docVersionId: string;
    text: string;
    rank: number;
    sourceUrl: string;
    sourceScore: number;
};
//# sourceMappingURL=types.d.ts.map