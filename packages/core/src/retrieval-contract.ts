import type { AssistantMode, ConnectorType } from "./types";

export type KnowledgeAnswerBlockReason =
  | "insufficient_evidence"
  | "permission_scope_uncertain"
  | "low_citation_coverage"
  | "unsupported_claims"
  | "freshness_blocked";

export type EvidenceCitation = {
  id: string;
  excerpt: string;
  link: string;
  sourceType: ConnectorType | "knowledge_object";
  updatedAt?: string;
};

export type KnowledgeAnswerRequest = {
  query: string;
  mode: AssistantMode;
  allowHistoricalEvidence?: boolean;
  filters?: {
    sourceType?: ConnectorType;
    tags?: string[];
    ownerId?: string;
    knowledgeObjectIds?: string[];
    dateRange?: {
      from?: string;
      to?: string;
    };
    minSourceScore?: number;
  };
};

export type KnowledgeAnswerResponse = {
  answer: string;
  citations: EvidenceCitation[];
  confidence: number;
  status: "passed" | "blocked";
  blockReasons?: KnowledgeAnswerBlockReason[];
};
