export type ConnectorType =
  | "google_drive"
  | "google_docs"
  | "slack"
  | "microsoft_teams"
  | "microsoft_sharepoint"
  | "microsoft_onedrive";

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

export type AnswerClaimCitation = {
  claimId: string;
  citation: Citation;
};

export type AnswerClaim = {
  id: string;
  text: string;
  order: number;
  supported: boolean;
  citations: Citation[];
};

export type GroundedAnswer = {
  answer: string;
  citations: Citation[];
  confidence: number;
  sourceScore: number;
};

export type AuthIntent = "login" | "register";

export type AuthErrorCode = "no_account" | "invalid_invite" | "domain_not_allowed" | "invite_expired";

export type AuthStartRequest = {
  next?: string;
  intent?: AuthIntent;
  inviteCode?: string;
};

export type AuthStartResponse = {
  authorizeUrl: string;
};

export type SessionEnvelope = {
  sid: string;
  exp: number;
  v: 1;
};

export type OrganizationDomain = {
  id: string;
  organizationId: string;
  domain: string;
  verifiedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type RegistrationInvite = {
  id: string;
  organizationId: string;
  email?: string;
  domain?: string;
  role: OrgRole;
  expiresAt: string;
  usedAt?: string;
  revokedAt?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
};

export type AssistantMode = "ask" | "summarize" | "trace";

export type AssistantGroundingMeta = {
  citationCoverage: number;
  unsupportedClaimCount: number;
  retrievalScore: number;
};

export type AssistantFeedbackRequest = {
  threadId: string;
  messageId: string;
  vote: "up" | "down";
  reason?: string;
};

export type AssistantFeedbackResponse = {
  ok: true;
};

export type ChatThreadSummary = {
  id: string;
  title: string;
  updatedAt: string;
  lastMessagePreview: string;
};

export type ChatThreadMessage = {
  id: string;
  threadId: string;
  role: "user" | "assistant";
  messageText: string;
  confidence?: number;
  sourceScore?: number;
  createdAt: string;
  citations: Citation[];
};

export type ChatThreadDetail = {
  thread: ChatThreadSummary;
  messages: ChatThreadMessage[];
};

export type EvidenceProvenance = {
  documentId?: string;
  documentTitle?: string;
  documentVersionId?: string;
  sourceExternalId?: string;
  sourceFormat?: string;
  canonicalSourceUrl?: string;
  author?: string;
  lastUpdatedAt?: string;
  syncRunId?: string;
  checksum?: string;
};

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
  provenance: EvidenceProvenance;
};

export type AssistantQueryRequest = {
  query: string;
  mode: AssistantMode;
  threadId?: string;
  filters?: {
    sourceType?: ConnectorType;
    dateRange?: {
      from?: string; // ISO date string
      to?: string; // ISO date string
    };
    author?: string; // Owner/author email or name
    minSourceScore?: number; // Minimum source score (0-100)
    documentIds?: string[]; // Specific document IDs to search
  };
};

export type AssistantQueryResponse = {
  answer: string;
  confidence: number;
  sourceScore: number;
  citations: Citation[];
  claims: AnswerClaim[];
  sources: EvidenceItem[];
  grounding: AssistantGroundingMeta;
  traceability: {
    coverage: number;
    missingAuthorCount: number;
    missingDateCount: number;
  };
  timings: {
    retrievalMs: number;
    generationMs: number;
  };
  verification: {
    status: "passed" | "blocked";
    reasons: string[];
    citationCoverage: number;
    unsupportedClaims: number;
  };
  permissions: {
    filteredOutCount: number;
    aclMode: "enforced";
  };
  mode: AssistantMode;
  model: string;
  threadId?: string;
  messageId?: string;
};

export type EvidenceReason = "vector_similarity" | "text_match" | "trusted_source" | "recency_boost";

export type AssistantQueryStreamEvent =
  | {
      type: "start";
      requestId: string;
      mode: AssistantMode;
    }
  | {
      type: "sources";
      requestId: string;
      sources: EvidenceItem[];
      retrievalMs: number;
    }
  | {
      type: "chunk";
      requestId: string;
      text: string;
      firstTokenMs?: number;
    }
  | {
      type: "complete";
      requestId: string;
      payload: AssistantQueryResponse;
      completionMs: number;
    }
  | {
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
  sourceExternalId?: string;
  sourceFormat?: string;
  canonicalSourceUrl?: string;
};

export type DocumentChunk = {
  chunkId: string;
  docVersionId: string;
  text: string;
  rank: number;
  sourceUrl: string;
  sourceScore: number;
  documentId?: string;
  documentTitle?: string;
  connectorType?: ConnectorType;
  updatedAt?: string;
  author?: string;
  sourceFormat?: string;
  sourceExternalId?: string;
  canonicalSourceUrl?: string;
  sourceVersionLabel?: string;
  sourceChecksum?: string;
  syncRunId?: string;
};

export type WaitlistLeadRequest = {
  email: string;
  company: string;
  role?: string;
  sourcePage?: string;
  website?: string;
};

export type WaitlistLeadResponse = {
  ok: true;
  status: "pending";
  message: string;
};

export type OpsSyncFailureBreakdown = {
  transient: number;
  auth: number;
  payload: number;
  unknown: number;
};

export type OpsSyncWindowStats = {
  total: number;
  completed: number;
  failed: number;
  running: number;
  failureByClassification: OpsSyncFailureBreakdown;
};

export type OpsSummaryResponse = {
  organizationId: string;
  generatedAt: string;
  syncRuns: {
    last24h: OpsSyncWindowStats;
    last7d: OpsSyncWindowStats;
  };
  documents: {
    indexed: number;
  };
  reviewQueue: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
  };
  deadLetters: {
    last24h: number;
    last7d: number;
  };
};

export type SloSummaryMetric = {
  name: "api_availability" | "assist_latency_p95_ms" | "sync_success_rate" | "queue_lag_seconds";
  target: number;
  actual: number;
  unit: "percent" | "milliseconds" | "seconds";
  status: "pass" | "warning" | "breach";
};

export type SloSummary = {
  organizationId: string;
  generatedAt: string;
  burnRate: number;
  openIncidentCount: number;
  metrics: SloSummaryMetric[];
};

export type IncidentSummary = {
  id: string;
  organizationId: string;
  severity: "info" | "warning" | "critical";
  eventType: string;
  status: "open" | "resolved";
  summary: string;
  occurredAt: string;
  resolvedAt?: string;
  metadata: Record<string, unknown>;
};

export type AuditExportJob = {
  id: string;
  organizationId: string;
  requestedBy?: string;
  status: "queued" | "running" | "completed" | "failed";
  filters: Record<string, unknown>;
  rowsExported?: number;
  startedAt?: string;
  completedAt?: string;
  downloadUrl?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
};

export type SessionPolicy = {
  organizationId: string;
  sessionMaxAgeMinutes: number;
  sessionIdleTimeoutMinutes: number;
  concurrentSessionLimit: number;
  forceReauthAfterMinutes: number;
  createdAt: string;
  updatedAt: string;
};
