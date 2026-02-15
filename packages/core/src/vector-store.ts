import type { ConnectorType } from "./types";

export type HybridSearchRequest = {
  organizationId: string;
  queryText: string;
  queryEmbedding: number[];
  limit: number;
  sourceType?: ConnectorType;
  principalKeys?: string[];
};

export type HybridSearchResult = {
  chunkId: string;
  documentId?: string;
  knowledgeObjectId?: string;
  text: string;
  sourceUrl: string;
  sourceType: ConnectorType | "knowledge_object";
  score: number;
  updatedAt?: string;
};

export type VectorStore = {
  indexChunks(input: {
    organizationId: string;
    sourceType: ConnectorType | "knowledge_object";
    sourceId: string;
    chunks: Array<{ chunkId: string; text: string; embedding: number[] }>;
    embeddingModel: string;
  }): Promise<void>;
  hybridSearch(input: HybridSearchRequest): Promise<HybridSearchResult[]>;
};
