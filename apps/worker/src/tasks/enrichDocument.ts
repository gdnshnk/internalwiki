import type { JobHelpers } from "graphile-worker";
import { MockAiProvider, OpenAiProvider, embedTexts, type AiProvider } from "@internalwiki/ai";
import { chunkText, computeSourceScore } from "@internalwiki/core";
import { appendAuditEvent, upsertExternalItemAndDocuments, vectorToSqlLiteral } from "@internalwiki/db";

type EnrichPayload = {
  organizationId: string;
  connectorAccountId: string;
  connectorType: "google_drive" | "google_docs" | "notion";
  syncRunId: string;
  externalId: string;
  checksum: string;
  sourceType: "google_drive" | "google_docs" | "notion";
  sourceUrl: string;
  canonicalSourceUrl?: string;
  title: string;
  owner: string;
  author?: string;
  content: string;
  updatedAt: string;
  sourceLastUpdatedAt?: string;
  sourceVersionLabel?: string;
  sourceExternalId?: string;
  sourceFormat?: string;
};

function getAiProvider(): AiProvider {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new MockAiProvider();
  }

  return new OpenAiProvider({
    apiKey,
    model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini"
  });
}

export async function enrichDocument(payload: EnrichPayload, helpers: JobHelpers): Promise<void> {
  const ai = getAiProvider();
  const chunks = chunkText(payload.content);
  const embeddings = await embedTexts({
    texts: chunks,
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small"
  });
  const embeddingVectors = embeddings.map((vector) => vectorToSqlLiteral(vector));

  const citations = chunks.slice(0, 2).map((chunk, index) => ({
    chunkId: `${payload.externalId}-${index}`,
    docVersionId: `${payload.externalId}-pending`,
    sourceUrl: payload.sourceUrl,
    startOffset: 0,
    endOffset: Math.min(160, chunk.length)
  }));

  const summary = await ai.summarize({
    content: payload.content,
    citations
  });

  const sourceScore = computeSourceScore({
    updatedAt: payload.sourceLastUpdatedAt ?? payload.updatedAt,
    sourceAuthority: payload.sourceType === "notion" ? 0.8 : 0.9,
    authorAuthority: (payload.author ?? payload.owner).includes("lead") ? 0.85 : 0.7,
    citationCoverage: citations.length > 0 ? 1 : 0
  });

  const persisted = await upsertExternalItemAndDocuments({
    organizationId: payload.organizationId,
    connectorAccountId: payload.connectorAccountId,
    externalId: payload.externalId,
    checksum: payload.checksum,
    sourceType: payload.sourceType,
    sourceUrl: payload.sourceUrl,
    canonicalSourceUrl: payload.canonicalSourceUrl,
    title: payload.title,
    owner: payload.author ?? payload.owner,
    updatedAt: payload.updatedAt,
    sourceLastUpdatedAt: payload.sourceLastUpdatedAt,
    sourceVersionLabel: payload.sourceVersionLabel,
    sourceExternalId: payload.sourceExternalId,
    sourceFormat: payload.sourceFormat,
    syncRunId: payload.syncRunId,
    content: payload.content,
    chunks,
    embeddingVectors,
    embeddingModel: process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small",
    summary: summary.summary,
    sourceScore
  });

  await appendAuditEvent({
    organizationId: payload.organizationId,
    eventType: "document.enriched",
    entityType: "external_item",
    entityId: payload.externalId,
    payload: {
      syncRunId: payload.syncRunId,
      connectorAccountId: payload.connectorAccountId,
      documentId: persisted.documentId,
      documentVersionId: persisted.documentVersionId,
      changed: persisted.changed,
      chunkCount: chunks.length,
      model: ai.name
    }
  });

  helpers.logger.info(
    `enrichDocument org=${payload.organizationId} connectorAccount=${payload.connectorAccountId} title=${payload.title} chunks=${chunks.length} changed=${persisted.changed} score=${sourceScore.total}`
  );
}
