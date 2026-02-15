import type {
  AnswerClaim,
  AuditExportJob,
  ChatThreadSummary,
  ConnectorSyncRunStatus,
  ConnectorType,
  IncidentSummary,
  OrganizationDomain,
  PlanTier,
  OrgRole,
  RegistrationInvite,
  ReviewAction,
  SessionPolicy,
  SloSummary,
  SourceScore,
  UserMemoryEntry,
  UserMemoryProfile
} from "@internalwiki/core";

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
  documentId?: string;
  documentTitle?: string;
  author?: string;
  sourceFormat?: string;
  sourceExternalId?: string;
  canonicalSourceUrl?: string;
  sourceVersionLabel?: string;
  sourceChecksum?: string;
  syncRunId?: string;
  vectorRank?: number;
  lexicalRank?: number;
  vectorDistance?: number;
  lexicalScore?: number;
  combinedScore: number;
  updatedAt: string;
  connectorType: ConnectorType;
};

export type UserSessionRecord = {
  id: string;
  userId: string;
  organizationId: string;
  expiresAt: string;
  issuedAt: string;
  lastSeenAt: string;
  revokedAt?: string;
  revokedReason?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type OrganizationDomainRecord = OrganizationDomain;

export type RegistrationInviteRecord = RegistrationInvite;

export type RateLimitRecord = {
  bucketKey: string;
  windowStart: string;
  count: number;
};

export type ChatThreadSummaryRecord = ChatThreadSummary;

export type ChatThreadMessageRecord = {
  id: string;
  threadId: string;
  role: "user" | "assistant";
  messageText: string;
  confidence?: number;
  sourceScore?: number;
  createdAt: string;
};

export type AnswerClaimRecord = AnswerClaim;

export type MarketingWaitlistLeadRecord = {
  id: string;
  email: string;
  company: string;
  role?: string;
  sourcePage: string;
  ipHash: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  updatedAt: string;
};

export type ConnectorSyncStats = {
  last24h: {
    total: number;
    completed: number;
    failed: number;
    running: number;
    failureByClassification: {
      transient: number;
      auth: number;
      payload: number;
      unknown: number;
    };
  };
  last7d: {
    total: number;
    completed: number;
    failed: number;
    running: number;
    failureByClassification: {
      transient: number;
      auth: number;
      payload: number;
      unknown: number;
    };
  };
};

export type ReviewQueueStats = {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
};

export type RecentDeadLetterStats = {
  last24h: number;
  last7d: number;
};

export type SessionPolicyRecord = SessionPolicy;
export type UserMemoryProfileRecord = UserMemoryProfile;
export type UserMemoryEntryRecord = UserMemoryEntry;

export type AuditExportJobRecord = AuditExportJob;

export type IncidentSummaryRecord = IncidentSummary;

export type SloSummaryRecord = SloSummary;

export type PrivacyRequestRecord = {
  id: string;
  organizationId: string;
  requestType: "export" | "delete";
  subjectUserId: string;
  requestedBy?: string;
  status: "requested" | "processing" | "completed" | "blocked" | "failed";
  legalHoldBlocked: boolean;
  result: Record<string, unknown>;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  processedAt?: string;
};

export type OrganizationBillingSettingsRecord = {
  id: string;
  organizationId: string;
  planTier: PlanTier;
  overageEnabled: boolean;
  hardCapCredits?: number;
  createdAt: string;
  updatedAt: string;
};
