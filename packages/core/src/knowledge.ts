export type FreshnessStatus = "fresh" | "stale" | "at_risk";

export type KnowledgeSourceType = "manual" | "generated" | "imported";

export type KnowledgePermissionsMode = "custom" | "inherited_source_acl" | "org_wide";

export type KnowledgeDependencyType = "knowledge_object" | "system" | "repo";

export type KnowledgeDependencyRelation = "depends_on" | "references" | "validated_by";

export type KnowledgePermissionPrincipalType = "user" | "group" | "role" | "org";

export type KnowledgeAccessLevel = "viewer" | "editor" | "admin";

export type KnowledgePermissionEffect = "allow" | "deny";

export type KnowledgeReviewTaskType =
  | "scheduled_review"
  | "dependency_change"
  | "low_confidence"
  | "canonical_candidate";

export type KnowledgeReviewTaskStatus = "open" | "in_progress" | "resolved" | "dismissed";

export type KnowledgeReviewTaskPriority = "low" | "medium" | "high" | "critical";

export type KnowledgeObject = {
  id: string;
  organizationId: string;
  title: string;
  slug: string;
  ownerUserId: string;
  sourceType: KnowledgeSourceType;
  reviewIntervalDays: number;
  reviewDueAt: string;
  freshnessStatus: FreshnessStatus;
  confidenceScore: number;
  lastValidatedAt?: string;
  provenance: Record<string, unknown>;
  permissionsMode: KnowledgePermissionsMode;
  latestVersionId?: string;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeObjectVersion = {
  id: string;
  organizationId: string;
  knowledgeObjectId: string;
  versionNumber: number;
  contentMarkdown: string;
  contentBlocks: Array<Record<string, unknown>>;
  changeSummary?: string;
  validatedByUserId?: string;
  validatedAt?: string;
  createdAt: string;
};

export type KnowledgeDependency = {
  id: string;
  organizationId: string;
  knowledgeObjectId: string;
  dependencyType: KnowledgeDependencyType;
  dependencyObjectId?: string;
  dependencyRef?: string;
  dependencyLabel?: string;
  relationType: KnowledgeDependencyRelation;
  lastObservedVersion?: string;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeReviewer = {
  id: string;
  organizationId: string;
  knowledgeObjectId: string;
  reviewerUserId: string;
  required: boolean;
  createdAt: string;
};

export type KnowledgeTag = {
  id: string;
  organizationId: string;
  name: string;
  createdAt: string;
};

export type KnowledgePermissionRule = {
  id: string;
  organizationId: string;
  knowledgeObjectId: string;
  principalType: KnowledgePermissionPrincipalType;
  principalKey: string;
  accessLevel: KnowledgeAccessLevel;
  effect: KnowledgePermissionEffect;
  createdAt: string;
};

export type KnowledgeReviewTask = {
  id: string;
  organizationId: string;
  knowledgeObjectId?: string;
  taskType: KnowledgeReviewTaskType;
  status: KnowledgeReviewTaskStatus;
  priority: KnowledgeReviewTaskPriority;
  reason: string;
  metadata: Record<string, unknown>;
  dueAt?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeFreshnessDashboard = {
  counts: {
    fresh: number;
    stale: number;
    atRisk: number;
  };
  overdueReviews: number;
  dependencyAtRisk: number;
  repeatedQuestionCandidates: number;
  lowConfidenceOpen: number;
};
