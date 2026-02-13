import { getCache, setCache, invalidateCache } from "@internalwiki/cache";
import type { ConnectorType } from "@internalwiki/core";
import type { DocumentRecord } from "@internalwiki/core";
import type { ChunkSearchRecord } from "./types";
import {
  getDocumentById as getDocumentByIdOriginal,
  getLatestDocumentVersionMetadata as getLatestDocumentVersionMetadataOriginal,
  listDocuments as listDocumentsOriginal,
  searchDocumentChunksHybrid as searchDocumentChunksHybridOriginal
} from "./repositories";

// Cache TTLs (in seconds)
const CACHE_TTL = {
  DOCUMENT_METADATA: 3600, // 1 hour
  DOCUMENT_BY_ID: 3600, // 1 hour
  DOCUMENT_VERSION: 1800, // 30 minutes
  SOURCE_SCORES: 1800, // 30 minutes
  QUERY_RESULTS: 300, // 5 minutes
  EMBEDDING_VECTORS: 86400 // 24 hours
};

function buildCacheKey(prefix: string, ...parts: (string | undefined)[]): string {
  return `${prefix}:${parts.filter(Boolean).join(":")}`;
}

export async function listDocuments(organizationId: string): Promise<DocumentRecord[]> {
  const cacheKey = buildCacheKey("docs", organizationId);
  const cached = await getCache<DocumentRecord[]>(cacheKey);
  if (cached) {
    return cached;
  }

  const result = await listDocumentsOriginal(organizationId);
  await setCache(cacheKey, result, CACHE_TTL.DOCUMENT_METADATA);
  return result;
}

export async function getDocumentById(
  organizationId: string,
  docId: string
): Promise<DocumentRecord | null> {
  const cacheKey = buildCacheKey("doc", organizationId, docId);
  const cached = await getCache<DocumentRecord | null>(cacheKey);
  if (cached !== null) {
    return cached;
  }

  const result = await getDocumentByIdOriginal(organizationId, docId);
  await setCache(cacheKey, result, CACHE_TTL.DOCUMENT_BY_ID);
  return result;
}

export async function getLatestDocumentVersionMetadata(
  organizationId: string,
  documentId: string
): Promise<{
  id: string;
  contentHash: string;
  createdAt: string;
  sourceLastUpdatedAt?: string;
  sourceVersionLabel?: string;
  sourceChecksum?: string;
  connectorSyncRunId?: string;
} | null> {
  const cacheKey = buildCacheKey("doc-version", organizationId, documentId);
  const cached = await getCache<Awaited<ReturnType<typeof getLatestDocumentVersionMetadataOriginal>>>(
    cacheKey
  );
  if (cached !== null) {
    return cached;
  }

  const result = await getLatestDocumentVersionMetadataOriginal(organizationId, documentId);
  await setCache(cacheKey, result, CACHE_TTL.DOCUMENT_VERSION);
  return result;
}

export async function searchDocumentChunksHybrid(params: {
  organizationId: string;
  queryText: string;
  queryVector: string;
  sourceType?: ConnectorType;
  limit?: number;
  dateRange?: { from?: string; to?: string };
  author?: string;
  minSourceScore?: number;
  documentIds?: string[];
}): Promise<ChunkSearchRecord[]> {
  // For search queries, use a hash of the query to create cache key
  // Note: queryVector is a SQL literal, so we hash queryText instead
  const queryHash = Buffer.from(params.queryText).toString("base64").slice(0, 16);
  const cacheKey = buildCacheKey(
    "search",
    params.organizationId,
    params.sourceType ?? "all",
    queryHash,
    String(params.limit ?? 8)
  );

  const cached = await getCache<ChunkSearchRecord[]>(cacheKey);
  if (cached) {
    return cached;
  }

  const result = await searchDocumentChunksHybridOriginal(params);
  await setCache(cacheKey, result, CACHE_TTL.QUERY_RESULTS);
  return result;
}

// Cache invalidation helpers
export async function invalidateDocumentCache(organizationId: string, docId?: string): Promise<void> {
  if (docId) {
    await invalidateCache(`cache:doc:${organizationId}:${docId}`);
    await invalidateCache(`cache:doc-version:${organizationId}:${docId}`);
  }
  // Invalidate list cache
  await invalidateCache(`cache:docs:${organizationId}`);
  // Invalidate search results (they may include this document)
  await invalidateCache(`cache:search:${organizationId}:*`);
}

export async function invalidateOrganizationCache(organizationId: string): Promise<void> {
  await invalidateCache(`cache:*:${organizationId}:*`);
}
