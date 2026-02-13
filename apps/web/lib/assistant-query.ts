import { z } from "zod";
import type { AnswerClaim, AssistantQueryRequest, AssistantQueryResponse, Citation } from "@internalwiki/core";
import { persistAnswerClaims, persistGroundedAnswer } from "@internalwiki/db";
import { embedQueryText, getAiProvider } from "@/lib/ai";
import { buildEvidenceItems, getChunkCandidates } from "@/lib/demo-data";

export const assistantQuerySchema = z.object({
  query: z.string().min(2),
  mode: z.enum(["ask", "summarize", "trace"]).default("ask"),
  threadId: z.string().min(8).optional(),
  filters: z
    .object({
      sourceType: z.enum(["google_docs", "google_drive", "notion"]).optional()
    })
    .optional()
});

function fallbackCitationsFromSources(input: {
  existing: Citation[];
  sources: AssistantQueryResponse["sources"];
}): Citation[] {
  if (input.existing.length > 0) {
    return input.existing;
  }

  return input.sources.slice(0, 2).map((source) => source.citation);
}

function augmentQuestionForMode(input: AssistantQueryRequest): string {
  if (input.mode === "summarize") {
    return `Create an executive summary in 4-6 bullets with key decisions, owners, and risks, all grounded in citations.\nQuestion: ${input.query}`;
  }

  if (input.mode === "trace") {
    return `Trace claims to exact evidence. Prefer claim-to-source mapping over narrative.\nQuestion: ${input.query}`;
  }

  return `Provide a direct grounded answer, then 2-4 bullets with sources.\nQuestion: ${input.query}`;
}

function strictGroundingPrompt(input: string): string {
  return `${input}\n\nStrict grounding: include only claims supported by context; if evidence is insufficient, say so explicitly.`;
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 20);
}

function termSet(text: string): Set<string> {
  const terms = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 4);

  return new Set(terms);
}

function assessGrounding(input: {
  answer: string;
  citations: Citation[];
  chunkTextById: Map<string, string>;
}): { citationCoverage: number; unsupportedClaimCount: number } {
  const sentences = splitSentences(input.answer);
  if (sentences.length === 0) {
    return { citationCoverage: 1, unsupportedClaimCount: 0 };
  }

  const citedTerms = new Set<string>();
  for (const citation of input.citations) {
    const chunkText = input.chunkTextById.get(citation.chunkId);
    if (!chunkText) {
      continue;
    }
    for (const term of termSet(chunkText)) {
      citedTerms.add(term);
    }
  }

  if (citedTerms.size === 0) {
    return { citationCoverage: 0, unsupportedClaimCount: sentences.length };
  }

  let supportedSentences = 0;
  for (const sentence of sentences) {
    const sentenceTerms = termSet(sentence);
    const supported = Array.from(sentenceTerms).some((term) => citedTerms.has(term));
    if (supported) {
      supportedSentences += 1;
    }
  }

  return {
    citationCoverage: supportedSentences / sentences.length,
    unsupportedClaimCount: Math.max(0, sentences.length - supportedSentences)
  };
}

function citationOverlapScore(claimTerms: Set<string>, chunkText: string): number {
  if (claimTerms.size === 0) {
    return 0;
  }

  const chunkTerms = termSet(chunkText);
  if (chunkTerms.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const term of claimTerms) {
    if (chunkTerms.has(term)) {
      overlap += 1;
    }
  }

  return overlap / claimTerms.size;
}

function buildClaims(input: {
  answer: string;
  citations: Citation[];
  chunkTextById: Map<string, string>;
}): AnswerClaim[] {
  const lines = splitSentences(input.answer);
  const claims = lines.length > 0 ? lines : [input.answer.trim()].filter((entry) => entry.length > 0);
  return claims.map((claim, index) => {
    const claimTerms = termSet(claim);
    const matchedCitations = input.citations.filter((citation) => {
      const chunkText = input.chunkTextById.get(citation.chunkId);
      if (!chunkText) {
        return false;
      }
      return citationOverlapScore(claimTerms, chunkText) >= 0.14;
    });

    return {
      id: `claim-${index + 1}`,
      text: claim,
      order: index,
      supported: matchedCitations.length > 0,
      citations: matchedCitations
    };
  });
}

function computeRetrievalScore(sources: AssistantQueryResponse["sources"]): number {
  const top = sources.slice(0, 3);
  if (top.length === 0) {
    return 0;
  }

  const score =
    top.reduce((acc, source) => acc + source.relevance * Math.min(1, Math.max(0, source.sourceScore / 100)), 0) /
    top.length;

  return Math.max(0, Math.min(1, score));
}

function averageCitationTrust(citations: Citation[], chunkScores: Map<string, number>): number {
  if (citations.length === 0) {
    return 0;
  }

  const avg =
    citations.reduce((acc, citation) => acc + Math.min(1, Math.max(0, (chunkScores.get(citation.chunkId) ?? 0) / 100)), 0) /
    citations.length;

  return Math.max(0, Math.min(1, avg));
}

function computeAnswerConfidence(input: {
  modelConfidence: number;
  retrievalScore: number;
  citationCoverage: number;
  citationTrust: number;
}): number {
  const blended =
    input.modelConfidence * 0.1 +
    input.retrievalScore * 0.35 +
    input.citationCoverage * 0.35 +
    input.citationTrust * 0.2;

  return Math.max(0.05, Math.min(0.99, blended));
}

function computeTraceability(input: {
  claims: AnswerClaim[];
  sources: AssistantQueryResponse["sources"];
  citationCoverage: number;
}): AssistantQueryResponse["traceability"] {
  const supportedClaims = input.claims.filter((claim) => claim.supported).length;
  const coverage = input.claims.length > 0 ? supportedClaims / input.claims.length : input.citationCoverage;

  return {
    coverage: Math.max(0, Math.min(1, coverage)),
    missingAuthorCount: input.sources.filter((source) => !source.provenance.author).length,
    missingDateCount: input.sources.filter((source) => !source.provenance.lastUpdatedAt).length
  };
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function capContextChunks<T extends { text: string }>(chunks: T[], maxTokens = 4000): T[] {
  const selected: T[] = [];
  let used = 0;
  for (const chunk of chunks) {
    const chunkTokens = estimateTokens(chunk.text);
    if (selected.length > 0 && used + chunkTokens > maxTokens) {
      break;
    }
    selected.push(chunk);
    used += chunkTokens;
  }

  return selected.length > 0 ? selected : chunks.slice(0, 1);
}

export async function runAssistantQuery(params: {
  organizationId: string;
  input: AssistantQueryRequest;
  actorId?: string;
}): Promise<AssistantQueryResponse> {
  const retrievalStart = performance.now();
  const queryEmbedding = await embedQueryText(params.input.query);

  const candidates = await getChunkCandidates({
    organizationId: params.organizationId,
    question: params.input.query,
    sourceType: params.input.filters?.sourceType,
    queryEmbedding
  });

  const sources = buildEvidenceItems(candidates);
  const retrievalScore = computeRetrievalScore(sources);
  const retrievalMs = Math.round(performance.now() - retrievalStart);

  const provider = getAiProvider();
  const generationStart = performance.now();
  const preparedQuestion = augmentQuestionForMode(params.input);
  const contextChunks = capContextChunks(
    candidates.map((chunk) => ({
      chunkId: chunk.chunkId,
      docVersionId: chunk.docVersionId,
      sourceUrl: chunk.sourceUrl,
      text: chunk.text,
      sourceScore: chunk.sourceScore
    }))
  );

  let grounded = await provider.answerQuestion({
    question: preparedQuestion,
    contextChunks
  });
  let citations = fallbackCitationsFromSources({ existing: grounded.citations, sources });

  const chunkTextById = new Map<string, string>();
  const chunkSourceScore = new Map<string, number>();
  for (const chunk of candidates) {
    chunkTextById.set(chunk.chunkId, chunk.text);
    chunkSourceScore.set(chunk.chunkId, chunk.sourceScore);
  }

  let grounding = assessGrounding({
    answer: grounded.answer,
    citations,
    chunkTextById
  });

  if (grounding.citationCoverage < 0.8) {
    const retry = await provider.answerQuestion({
      question: strictGroundingPrompt(preparedQuestion),
      contextChunks
    });
    const retryCitations = fallbackCitationsFromSources({ existing: retry.citations, sources });
    const retryGrounding = assessGrounding({
      answer: retry.answer,
      citations: retryCitations,
      chunkTextById
    });

    if (retryGrounding.citationCoverage >= grounding.citationCoverage) {
      grounded = retry;
      citations = retryCitations;
      grounding = retryGrounding;
    }
  }

  const generationMs = Math.round(performance.now() - generationStart);
  if (citations.length === 0) {
    throw new Error("Assistant response rejected: missing citations for generated claim.");
  }

  if (grounding.citationCoverage < 0.8) {
    grounded = {
      ...grounded,
      answer:
        "Insufficient evidence in available sources to provide a fully grounded answer. Try broadening filters or syncing additional documents."
    };
  }

  const claims = buildClaims({
    answer: grounded.answer,
    citations,
    chunkTextById
  });
  const traceability = computeTraceability({
    claims,
    sources,
    citationCoverage: grounding.citationCoverage
  });

  const citationTrust = averageCitationTrust(citations, chunkSourceScore);
  const confidence = computeAnswerConfidence({
    modelConfidence: grounded.confidence,
    retrievalScore,
    citationCoverage: grounding.citationCoverage,
    citationTrust
  });
  const sourceScore =
    citations.reduce((acc, citation) => acc + (chunkSourceScore.get(citation.chunkId) ?? 0), 0) / citations.length || grounded.sourceScore;

  const response: AssistantQueryResponse = {
    answer: grounded.answer,
    confidence,
    sourceScore,
    citations,
    claims,
    sources,
    grounding: {
      citationCoverage: grounding.citationCoverage,
      unsupportedClaimCount: grounding.unsupportedClaimCount,
      retrievalScore
    },
    traceability,
    timings: {
      retrievalMs,
      generationMs
    },
    mode: params.input.mode,
    model: provider.name
  };

  const persisted = await persistGroundedAnswer({
    organizationId: params.organizationId,
    question: params.input.query,
    threadId: params.input.threadId,
    actorId: params.actorId,
    response: {
      answer: response.answer,
      citations: response.citations,
      confidence: response.confidence,
      sourceScore: response.sourceScore
    }
  });

  response.threadId = persisted.threadId;
  response.messageId = persisted.assistantMessageId;
  await persistAnswerClaims({
    organizationId: params.organizationId,
    chatMessageId: persisted.assistantMessageId,
    claims: response.claims,
    actorId: params.actorId
  });

  return response;
}
