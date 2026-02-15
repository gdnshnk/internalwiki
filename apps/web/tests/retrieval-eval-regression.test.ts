import { describe, expect, it } from "vitest";
import type { AssistantQueryResponse } from "@internalwiki/core";
import { retrievalBenchmarkCases } from "@/evals/retrieval-benchmark";
import { runRetrievalEvalBenchmark } from "@/lib/retrieval-eval";

function buildMockResponse(input: {
  query: string;
  mode: "ask" | "summarize" | "trace";
  good: boolean;
  expectedPhrase?: string;
  chunkId: string;
}): AssistantQueryResponse {
  const citation = {
    chunkId: input.good ? input.chunkId : `other-${input.chunkId}`,
    docVersionId: `docv-${input.chunkId}`,
    sourceUrl: `https://example.com/${input.chunkId}`,
    startOffset: 0,
    endOffset: 120
  };

  return {
    answer: input.good
      ? `Grounded answer: ${input.expectedPhrase ?? "source-backed response"}`
      : "Insufficient grounded evidence in this context.",
    confidence: input.good ? 0.88 : 0.42,
    sourceScore: input.good ? 84 : 44,
    citations: [citation],
    claims: [
      {
        id: `${input.chunkId}-claim-1`,
        text: input.good ? "Supported claim from source" : "Unsupported claim",
        order: 0,
        supported: input.good,
        citations: input.good ? [citation] : []
      }
    ],
    sources: [
      {
        id: `source-${input.chunkId}`,
        title: `Source ${input.chunkId}`,
        connectorType: "google_docs",
        sourceUrl: citation.sourceUrl,
        excerpt: input.query,
        sourceScore: input.good ? 84 : 44,
        relevance: input.good ? 0.92 : 0.2,
        reason: "vector_similarity",
        citation,
        provenance: {
          documentId: `doc-${input.chunkId}`,
          documentTitle: `Doc ${input.chunkId}`,
          documentVersionId: citation.docVersionId,
          author: "QA Harness",
          lastUpdatedAt: "2026-02-13T00:00:00.000Z"
        }
      }
    ],
    grounding: {
      citationCoverage: input.good ? 0.9 : 0.45,
      unsupportedClaimCount: input.good ? 0 : 2,
      retrievalScore: input.good ? 0.82 : 0.2
    },
    traceability: {
      coverage: input.good ? 1 : 0,
      missingAuthorCount: 0,
      missingDateCount: 0
    },
    timings: {
      retrievalMs: 240,
      generationMs: 680
    },
    verification: {
      status: input.good ? "passed" : "blocked",
      reasons: input.good ? [] : ["Insufficient citation support"],
      citationCoverage: input.good ? 0.9 : 0.45,
      unsupportedClaims: input.good ? 0 : 2
    },
    permissions: {
      filteredOutCount: 0,
      aclMode: "enforced"
    },
    qualityContract: {
      version: "v1",
      status: input.good ? "passed" : "blocked",
      policy: {
        groundedness: {
          requireCitations: true,
          minCitationCoverage: 0.8,
          maxUnsupportedClaims: 0
        },
        freshness: {
          windowDays: 30,
          minFreshCitationCoverage: 0.8
        },
        permissionSafety: {
          mode: "fail_closed"
        }
      },
      allowHistoricalEvidence: false,
      dimensions: {
        groundedness: {
          status: input.good ? "passed" : "blocked",
          reasons: input.good ? [] : ["Insufficient citation support"],
          reasonCodes: input.good ? [] : ["groundedness.low_citation_coverage"],
          metrics: {
            citationCount: 1,
            citationCoverage: input.good ? 0.9 : 0.45,
            unsupportedClaims: input.good ? 0 : 2
          }
        },
        freshness: {
          status: "passed",
          reasons: [],
          reasonCodes: [],
          metrics: {
            freshnessWindowDays: 30,
            citationCount: 1,
            freshCitationCount: 1,
            staleCitationCount: 0,
            citationFreshnessCoverage: 1
          }
        },
        permissionSafety: {
          status: "passed",
          reasons: [],
          reasonCodes: [],
          metrics: {
            candidateCount: 1,
            citationCount: 1,
            hasViewerPrincipalKeys: true
          }
        }
      }
    },
    mode: input.mode,
    model: "eval-harness"
  };
}

describe("retrieval evaluation benchmark gate", () => {
  it("passes quality threshold at 75% with deterministic benchmark profile", async () => {
    const responseByQuery = new Map(
      retrievalBenchmarkCases.map((testCase, index) => [
        testCase.query,
        buildMockResponse({
          query: testCase.query,
          mode: testCase.mode ?? "ask",
          good: index < 8,
          expectedPhrase: testCase.expectedAnyAnswerPhrases?.[0],
          chunkId: testCase.id
        })
      ])
    );

    const result = await runRetrievalEvalBenchmark({
      organizationId: "org_eval",
      cases: retrievalBenchmarkCases,
      thresholdGoodPct: 75,
      persist: false,
      executeQuery: async (params) => {
        const response = responseByQuery.get(params.input.query);
        if (!response) {
          throw new Error(`Missing mocked response for query: ${params.input.query}`);
        }
        return response;
      }
    });

    expect(result.totalCases).toBe(10);
    expect(result.goodCases).toBe(8);
    expect(result.badCases).toBe(2);
    expect(result.scoreGoodPct).toBe(80);
    expect(result.passThreshold).toBe(true);
  });

  it("fails gate when threshold is stricter than benchmark score", async () => {
    const result = await runRetrievalEvalBenchmark({
      organizationId: "org_eval",
      cases: [
        {
          id: "strict-threshold-case",
          query: "Trace latest policy approval owner",
          mode: "trace",
          expectedAnyAnswerPhrases: ["owner"]
        }
      ],
      thresholdGoodPct: 90,
      persist: false,
      executeQuery: async (params) =>
        buildMockResponse({
          query: params.input.query,
          mode: params.input.mode,
          good: false,
          expectedPhrase: "owner",
          chunkId: "strict-threshold-case"
        })
    });

    expect(result.scoreGoodPct).toBe(0);
    expect(result.passThreshold).toBe(false);
  });
});
