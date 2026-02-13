import type { Citation, DocumentChunk, DocumentRecord, EvidenceItem, EvidenceReason } from "@internalwiki/core";
import { computeSourceScore } from "@internalwiki/core";
import {
  getDocumentByIdCached,
  hashEmbedding,
  listDocumentsCached,
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
  sourceType?: "google_docs" | "google_drive" | "notion";
  queryEmbedding?: number[];
  dateRange?: { from?: string; to?: string };
  author?: string;
  minSourceScore?: number;
  documentIds?: string[];
}): Promise<DocumentChunk[]> {
  const embedding = params.queryEmbedding ?? hashEmbedding(params.question);
  const queryVector = vectorToSqlLiteral(embedding);

  const records = await searchDocumentChunksHybridCached({
    organizationId: params.organizationId,
    queryText: params.question,
    queryVector,
    sourceType: params.sourceType,
    limit: 8,
    dateRange: params.dateRange,
    author: params.author,
    minSourceScore: params.minSourceScore,
    documentIds: params.documentIds
  });

  const chunks = toDocumentChunk(records);
  if (chunks.length > 0) {
    return chunks;
  }

  // Fallback to summaries when there are no indexed chunks yet.
  const docs = await listDocuments(params.organizationId);
  return docs.slice(0, 4).map((doc, idx) => ({
    chunkId: `${doc.id}-summary`,
    docVersionId: `${doc.id}-latest`,
    text: doc.summary ?? `${doc.title} has no generated summary yet.`,
    rank: idx,
    sourceUrl: doc.sourceUrl,
    sourceScore:
      doc.sourceScore?.total ??
      computeSourceScore({
        updatedAt: doc.updatedAt,
        sourceAuthority: doc.sourceType === "notion" ? 0.8 : 0.9,
        authorAuthority: 0.75,
        citationCoverage: 0.7
      }).total,
    documentId: doc.id,
    documentTitle: doc.title,
    connectorType: doc.sourceType,
    updatedAt: doc.updatedAt,
    author: doc.owner,
    sourceFormat: doc.sourceFormat,
    sourceExternalId: doc.sourceExternalId,
    canonicalSourceUrl: doc.canonicalSourceUrl
  }));
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

function connectorFromSourceUrl(sourceUrl: string): "google_docs" | "google_drive" | "notion" {
  if (sourceUrl.includes("notion.so")) {
    return "notion";
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
