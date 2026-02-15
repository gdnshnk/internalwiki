import type { Citation, DocumentChunk, DocumentRecord, EvidenceItem, EvidenceReason } from "@internalwiki/core";
import type { ConnectorType } from "@internalwiki/core";
import {
  getDocumentByIdCached,
  hashEmbedding,
  listDocumentsCached,
  searchKnowledgeObjectChunksHybrid,
  searchDocumentChunksHybridCached,
  toDocumentChunk,
  vectorToSqlLiteral
} from "@internalwiki/db";

export async function listDocuments(orgId: string): Promise<DocumentRecord[]> {
  return listDocumentsCached(orgId);
}

export async function getDocumentById(orgId: string, docId: string): Promise<DocumentRecord | null> {
  return getDocumentByIdCached(orgId, docId);
}

export async function getChunkCandidates(params: {
  organizationId: string;
  question: string;
  sourceType?: ConnectorType;
  viewerPrincipalKeys?: string[];
  queryEmbedding?: number[];
  dateRange?: { from?: string; to?: string };
  author?: string;
  minSourceScore?: number;
  documentIds?: string[];
  tags?: string[];
  ownerId?: string;
  knowledgeObjectIds?: string[];
}): Promise<DocumentChunk[]> {
  const embedding = params.queryEmbedding ?? hashEmbedding(params.question);
  const queryVector = vectorToSqlLiteral(embedding);

  const [documentRecords, knowledgeRecords] = await Promise.all([
    searchDocumentChunksHybridCached({
      organizationId: params.organizationId,
      queryText: params.question,
      queryVector,
      sourceType: params.sourceType,
      viewerPrincipalKeys: params.viewerPrincipalKeys,
      limit: 8,
      dateRange: params.dateRange,
      author: params.author,
      minSourceScore: params.minSourceScore,
      documentIds: params.documentIds
    }),
    searchKnowledgeObjectChunksHybrid({
      organizationId: params.organizationId,
      queryText: params.question,
      queryVector,
      viewerPrincipalKeys: params.viewerPrincipalKeys,
      ownerUserId: params.ownerId,
      tags: params.tags,
      knowledgeObjectIds: params.knowledgeObjectIds,
      limit: 8
    })
  ]);

  const documentChunks = toDocumentChunk(documentRecords);
  const knowledgeChunks: DocumentChunk[] = knowledgeRecords.map((record) => ({
    chunkId: record.chunkId,
    docVersionId: record.knowledgeObjectVersionId,
    text: record.text,
    rank: record.combinedScore,
    sourceUrl: record.sourceUrl,
    sourceScore: record.sourceScore,
    documentId: record.knowledgeObjectId,
    documentTitle: record.knowledgeObjectTitle,
    connectorType: "google_docs",
    updatedAt: record.updatedAt,
    author: record.ownerUserId,
    sourceFormat: "knowledge_object",
    sourceExternalId: record.knowledgeObjectId,
    canonicalSourceUrl: record.sourceUrl
  }));

  const chunks = [...documentChunks, ...knowledgeChunks]
    .sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0))
    .slice(0, 8);
  if (chunks.length > 0) {
    return chunks;
  }

  // Fail closed: no candidate evidence means no answer should be generated.
  return [];
}

export function mapChunkToCitation(chunk: DocumentChunk): Citation {
  return {
    chunkId: chunk.chunkId,
    docVersionId: chunk.docVersionId,
    sourceUrl: chunk.sourceUrl,
    startOffset: 0,
    endOffset: Math.min(chunk.text.length, 220)
  };
}

function connectorFromSourceUrl(sourceUrl: string): ConnectorType {
  if (sourceUrl.includes("slack.com")) {
    return "slack";
  }
  if (sourceUrl.includes("teams.microsoft.com")) {
    return "microsoft_teams";
  }
  if (sourceUrl.includes("sharepoint.com")) {
    return "microsoft_sharepoint";
  }
  if (sourceUrl.includes("onedrive.live.com")) {
    return "microsoft_onedrive";
  }
  if (sourceUrl.includes("docs.google.com/document")) {
    return "google_docs";
  }
  return "google_drive";
}

export function buildEvidenceItems(chunks: DocumentChunk[]): EvidenceItem[] {
  return chunks
    .map((chunk, index) => {
      const citation = mapChunkToCitation(chunk);
      const excerptStart = Math.max(0, citation.startOffset - 90);
      const excerptEnd = Math.min(chunk.text.length, citation.endOffset + 90);
      const reason: EvidenceReason =
        index === 0
          ? "vector_similarity"
          : index === 1
            ? "text_match"
            : index === 2
              ? "trusted_source"
              : "recency_boost";
      return {
        id: `source-${chunk.chunkId}`,
        title: chunk.documentTitle ?? chunk.docVersionId.replace("-v1", "").replaceAll("-", " "),
        connectorType: chunk.connectorType ?? connectorFromSourceUrl(chunk.sourceUrl),
        sourceUrl: chunk.sourceUrl,
        excerpt: chunk.text.slice(excerptStart, excerptEnd),
        sourceScore: chunk.sourceScore,
        relevance: Math.max(0.1, 1 - index * 0.15),
        reason,
        citation,
        provenance: {
          documentId: chunk.documentId,
          documentTitle: chunk.documentTitle,
          documentVersionId: chunk.docVersionId,
          sourceExternalId: chunk.sourceExternalId,
          sourceFormat: chunk.sourceFormat,
          canonicalSourceUrl: chunk.canonicalSourceUrl ?? chunk.sourceUrl,
          author: chunk.author,
          lastUpdatedAt: chunk.updatedAt,
          syncRunId: chunk.syncRunId,
          checksum: chunk.sourceChecksum
        }
      };
    })
    .sort((a, b) => b.relevance - a.relevance);
}
