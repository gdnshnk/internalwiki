import type {
  AssistantMode,
  AssistantQueryRequest,
  AssistantQueryResponse,
  ConnectorType
} from "@internalwiki/core";
import { recordEvalCases, recordEvalRun } from "@internalwiki/db";
import { runAssistantQuery } from "@/lib/assistant-query";

export type RetrievalEvalCase = {
  id: string;
  query: string;
  mode?: AssistantMode;
  sourceType?: ConnectorType;
  minCitationCount?: number;
  expectedAnyCitationChunkIds?: string[];
  expectedAnyAnswerPhrases?: string[];
};

export type RetrievalEvalCaseResult = {
  id: string;
  query: string;
  verdict: "good" | "bad" | "unknown";
  reasons: string[];
  citationChunkIds: string[];
  citationCoverage: number;
  confidence: number;
  sourceScore: number;
  response: AssistantQueryResponse;
};

export type RetrievalEvalRunResult = {
  runId?: string;
  organizationId: string;
  thresholdGoodPct: number;
  totalCases: number;
  goodCases: number;
  badCases: number;
  unknownCases: number;
  scoreGoodPct: number;
  passThreshold: boolean;
  results: RetrievalEvalCaseResult[];
};

function toLowerSet(items: string[]): Set<string> {
  return new Set(items.map((item) => item.trim().toLowerCase()).filter((item) => item.length > 0));
}

function evaluateCase(input: {
  testCase: RetrievalEvalCase;
  response: AssistantQueryResponse;
}): RetrievalEvalCaseResult {
  const reasons: string[] = [];
  const citations = input.response.citations ?? [];
  const citationChunkIds = citations.map((citation) => citation.chunkId);
  const minCitationCount = input.testCase.minCitationCount ?? 1;

  if (citations.length < minCitationCount) {
    reasons.push(`citations below minimum (${citations.length}/${minCitationCount})`);
  }

  if (input.response.grounding.citationCoverage < 0.8) {
    reasons.push(
      `citation coverage below 0.8 (${input.response.grounding.citationCoverage.toFixed(2)})`
    );
  }

  if (input.testCase.expectedAnyCitationChunkIds?.length) {
    const expected = toLowerSet(input.testCase.expectedAnyCitationChunkIds);
    const matched = citationChunkIds.some((chunkId) => expected.has(chunkId.toLowerCase()));
    if (!matched) {
      reasons.push("expected citation chunk not present");
    }
  }

  if (input.testCase.expectedAnyAnswerPhrases?.length) {
    const answerLower = input.response.answer.toLowerCase();
    const hasPhrase = input.testCase.expectedAnyAnswerPhrases.some((phrase) =>
      answerLower.includes(phrase.toLowerCase())
    );
    if (!hasPhrase) {
      reasons.push("expected answer phrase not present");
    }
  }

  const verdict = reasons.length === 0 ? "good" : "bad";
  return {
    id: input.testCase.id,
    query: input.testCase.query,
    verdict,
    reasons,
    citationChunkIds,
    citationCoverage: input.response.grounding.citationCoverage,
    confidence: input.response.confidence,
    sourceScore: input.response.sourceScore,
    response: input.response
  };
}

export async function runRetrievalEvalBenchmark(input: {
  organizationId: string;
  cases: RetrievalEvalCase[];
  thresholdGoodPct?: number;
  actorId?: string;
  persist?: boolean;
  executeQuery?: (params: {
    organizationId: string;
    input: AssistantQueryRequest;
    actorId?: string;
  }) => Promise<AssistantQueryResponse>;
}): Promise<RetrievalEvalRunResult> {
  const thresholdGoodPct = input.thresholdGoodPct ?? 75;
  const executor = input.executeQuery ?? runAssistantQuery;
  const results: RetrievalEvalCaseResult[] = [];

  for (const testCase of input.cases) {
    const response = await executor({
      organizationId: input.organizationId,
      actorId: input.actorId,
      input: {
        query: testCase.query,
        mode: testCase.mode ?? "ask",
        filters: testCase.sourceType ? { sourceType: testCase.sourceType } : undefined
      }
    });

    results.push(
      evaluateCase({
        testCase,
        response
      })
    );
  }

  const totalCases = results.length;
  const goodCases = results.filter((result) => result.verdict === "good").length;
  const badCases = results.filter((result) => result.verdict === "bad").length;
  const unknownCases = totalCases - goodCases - badCases;
  const scoreGoodPct = totalCases > 0 ? (goodCases / totalCases) * 100 : 0;
  const passThreshold = scoreGoodPct >= thresholdGoodPct;

  let runId: string | undefined;
  if (input.persist ?? false) {
    const run = await recordEvalRun({
      organizationId: input.organizationId,
      totalCases,
      scoreGoodPct,
      createdBy: input.actorId,
      metadata: {
        thresholdGoodPct,
        badCases,
        unknownCases
      }
    });
    runId = run.id;
    await recordEvalCases({
      organizationId: input.organizationId,
      runId,
      createdBy: input.actorId,
      cases: results.map((result) => ({
        queryText: result.query,
        expectedCitations: input.cases.find((testCase) => testCase.id === result.id)?.expectedAnyCitationChunkIds ?? [],
        actualCitations: result.citationChunkIds,
        verdict: result.verdict,
        notes: result.reasons.length > 0 ? result.reasons.join("; ") : undefined
      }))
    });
  }

  return {
    runId,
    organizationId: input.organizationId,
    thresholdGoodPct,
    totalCases,
    goodCases,
    badCases,
    unknownCases,
    scoreGoodPct,
    passThreshold,
    results
  };
}
