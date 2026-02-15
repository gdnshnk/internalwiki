import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getAiProviderMock,
  embedQueryTextMock,
  getChunkCandidatesMock,
  buildEvidenceItemsMock,
  persistGroundedAnswerMock,
  persistAnswerClaimsMock,
  createAnswerVerificationRunMock,
  recordUsageMeterEventMock,
  getPersonalizationMemoryContextMock,
  touchUserMemoryProfileLastUsedMock
} = vi.hoisted(() => ({
  getAiProviderMock: vi.fn(),
  embedQueryTextMock: vi.fn(),
  getChunkCandidatesMock: vi.fn(),
  buildEvidenceItemsMock: vi.fn(),
  persistGroundedAnswerMock: vi.fn(),
  persistAnswerClaimsMock: vi.fn(),
  createAnswerVerificationRunMock: vi.fn(),
  recordUsageMeterEventMock: vi.fn(),
  getPersonalizationMemoryContextMock: vi.fn(),
  touchUserMemoryProfileLastUsedMock: vi.fn()
}));

vi.mock("@/lib/ai", () => ({
  getAiProvider: getAiProviderMock,
  embedQueryText: embedQueryTextMock
}));

vi.mock("@/lib/demo-data", () => ({
  getChunkCandidates: getChunkCandidatesMock,
  buildEvidenceItems: buildEvidenceItemsMock
}));

vi.mock("@internalwiki/db", () => ({
  persistGroundedAnswer: persistGroundedAnswerMock,
  persistAnswerClaims: persistAnswerClaimsMock,
  createAnswerVerificationRun: createAnswerVerificationRunMock,
  recordUsageMeterEvent: recordUsageMeterEventMock,
  getPersonalizationMemoryContext: getPersonalizationMemoryContextMock,
  touchUserMemoryProfileLastUsed: touchUserMemoryProfileLastUsedMock
}));

import { runAssistantQuery } from "@/lib/assistant-query";

function makeProvider(): {
  name: string;
  answerQuestion: ReturnType<typeof vi.fn>;
} {
  return {
    name: "test-provider",
    answerQuestion: vi.fn(async (input: { question: string; contextChunks: unknown[] }) => {
      if (input.contextChunks.length === 0) {
        return {
          answer: "who owns incident policy"
        };
      }

      return {
        answer: "Security team owns incident policy approvals.",
        confidence: 0.92,
        sourceScore: 86,
        citations: [
          {
            chunkId: "chunk-1",
            docVersionId: "docv-1",
            sourceUrl: "https://example.com/doc-1",
            startOffset: 0,
            endOffset: 80
          },
          {
            chunkId: "chunk-2",
            docVersionId: "docv-1",
            sourceUrl: "https://example.com/doc-1",
            startOffset: 0,
            endOffset: 80
          },
          {
            chunkId: "chunk-3",
            docVersionId: "docv-2",
            sourceUrl: "https://example.com/doc-2",
            startOffset: 0,
            endOffset: 80
          }
        ]
      };
    })
  };
}

function makeCandidates(updatedAt: string) {
  return [
    {
      chunkId: "chunk-1",
      docVersionId: "docv-1",
      text: "Security team owns incident policy approvals and approves severity overrides.",
      rank: 0,
      sourceUrl: "https://example.com/doc-1",
      sourceScore: 86,
      documentId: "doc-1",
      documentTitle: "Incident Policy",
      connectorType: "slack",
      updatedAt,
      author: "ops@company.com"
    },
    {
      chunkId: "chunk-2",
      docVersionId: "docv-1",
      text: "Security team owns incident policy approvals for cross-team incidents.",
      rank: 0.1,
      sourceUrl: "https://example.com/doc-1",
      sourceScore: 85,
      documentId: "doc-1",
      documentTitle: "Incident Policy",
      connectorType: "slack",
      updatedAt,
      author: "ops@company.com"
    },
    {
      chunkId: "chunk-3",
      docVersionId: "docv-2",
      text: "Incident escalation ownership is held by the security team leadership.",
      rank: 0.2,
      sourceUrl: "https://example.com/doc-2",
      sourceScore: 82,
      documentId: "doc-2",
      documentTitle: "Escalation Matrix",
      connectorType: "slack",
      updatedAt,
      author: "security@company.com"
    }
  ];
}

function makeEvidence(updatedAt: string) {
  return [
    {
      id: "source-1",
      title: "Incident Policy",
      connectorType: "slack" as const,
      sourceUrl: "https://example.com/doc-1",
      excerpt: "Security team owns incident policy approvals.",
      sourceScore: 86,
      relevance: 0.9,
      reason: "vector_similarity" as const,
      citation: {
        chunkId: "chunk-1",
        docVersionId: "docv-1",
        sourceUrl: "https://example.com/doc-1",
        startOffset: 0,
        endOffset: 80
      },
      provenance: {
        documentId: "doc-1",
        documentTitle: "Incident Policy",
        documentVersionId: "docv-1",
        author: "ops@company.com",
        lastUpdatedAt: updatedAt
      }
    },
    {
      id: "source-2",
      title: "Incident Policy",
      connectorType: "slack" as const,
      sourceUrl: "https://example.com/doc-1",
      excerpt: "Security team owns incident policy approvals for cross-team incidents.",
      sourceScore: 85,
      relevance: 0.84,
      reason: "text_match" as const,
      citation: {
        chunkId: "chunk-2",
        docVersionId: "docv-1",
        sourceUrl: "https://example.com/doc-1",
        startOffset: 0,
        endOffset: 80
      },
      provenance: {
        documentId: "doc-1",
        documentTitle: "Incident Policy",
        documentVersionId: "docv-1",
        author: "ops@company.com",
        lastUpdatedAt: updatedAt
      }
    },
    {
      id: "source-3",
      title: "Escalation Matrix",
      connectorType: "slack" as const,
      sourceUrl: "https://example.com/doc-2",
      excerpt: "Incident escalation ownership is held by the security team leadership.",
      sourceScore: 82,
      relevance: 0.8,
      reason: "trusted_source" as const,
      citation: {
        chunkId: "chunk-3",
        docVersionId: "docv-2",
        sourceUrl: "https://example.com/doc-2",
        startOffset: 0,
        endOffset: 80
      },
      provenance: {
        documentId: "doc-2",
        documentTitle: "Escalation Matrix",
        documentVersionId: "docv-2",
        author: "security@company.com",
        lastUpdatedAt: updatedAt
      }
    }
  ];
}

describe("assistant query answer quality contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    embedQueryTextMock.mockResolvedValue([0.1, 0.2, 0.3]);
    persistGroundedAnswerMock.mockResolvedValue({
      threadId: "thread_1",
      assistantMessageId: "msg_1"
    });
    persistAnswerClaimsMock.mockResolvedValue(undefined);
    createAnswerVerificationRunMock.mockResolvedValue(undefined);
    recordUsageMeterEventMock.mockResolvedValue(undefined);
    getPersonalizationMemoryContextMock.mockResolvedValue({
      enabled: false,
      retentionDays: 90
    });
    touchUserMemoryProfileLastUsedMock.mockResolvedValue(undefined);
    getAiProviderMock.mockReturnValue(makeProvider());
  });

  it("blocks stale evidence when freshness requirement is not met", async () => {
    const stale = "2025-11-01T00:00:00.000Z";
    getChunkCandidatesMock.mockResolvedValue(makeCandidates(stale));
    buildEvidenceItemsMock.mockReturnValue(makeEvidence(stale));

    const response = await runAssistantQuery({
      organizationId: "org_1",
      actorId: "user_1",
      viewerPrincipalKeys: ["email:user@company.com"],
      input: {
        query: "who owns incident policy",
        mode: "ask"
      }
    });

    expect(response.verification.status).toBe("blocked");
    expect(response.qualityContract.dimensions.freshness.status).toBe("blocked");
    expect(response.qualityContract.allowHistoricalEvidence).toBe(false);
    expect(recordUsageMeterEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "summary_blocked",
        credits: 0
      })
    );
  });

  it("allows stale evidence when historical override is explicitly set", async () => {
    const stale = "2025-11-01T00:00:00.000Z";
    getChunkCandidatesMock.mockResolvedValue(makeCandidates(stale));
    buildEvidenceItemsMock.mockReturnValue(makeEvidence(stale));

    const response = await runAssistantQuery({
      organizationId: "org_1",
      actorId: "user_1",
      viewerPrincipalKeys: ["email:user@company.com"],
      input: {
        query: "who owns incident policy",
        mode: "ask",
        allowHistoricalEvidence: true
      }
    });

    expect(response.verification.status).toBe("passed");
    expect(response.qualityContract.dimensions.freshness.status).toBe("passed");
    expect(response.qualityContract.allowHistoricalEvidence).toBe(true);
    expect(recordUsageMeterEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "summary_delivered",
        credits: 1
      })
    );
  });

  it("fails closed when no permitted evidence is returned", async () => {
    getChunkCandidatesMock.mockResolvedValue([]);
    buildEvidenceItemsMock.mockReturnValue([]);

    const response = await runAssistantQuery({
      organizationId: "org_1",
      actorId: "user_1",
      viewerPrincipalKeys: ["email:user@company.com"],
      input: {
        query: "who owns incident policy",
        mode: "ask"
      }
    });

    expect(response.verification.status).toBe("blocked");
    expect(response.qualityContract.dimensions.permissionSafety.status).toBe("blocked");
    expect(response.answer.toLowerCase()).toBe("insufficient evidence");
    expect(createAnswerVerificationRunMock).toHaveBeenCalledWith(
      expect.objectContaining({
        qualityContract: expect.objectContaining({
          status: "blocked"
        })
      })
    );
  });

  it("injects explicit memory context only when enabled", async () => {
    const fresh = "2026-02-14T00:00:00.000Z";
    const provider = makeProvider();
    getAiProviderMock.mockReturnValueOnce(provider);
    getChunkCandidatesMock.mockResolvedValue(makeCandidates(fresh));
    buildEvidenceItemsMock.mockReturnValue(makeEvidence(fresh));
    getPersonalizationMemoryContextMock.mockResolvedValueOnce({
      enabled: true,
      profileSummary: "User prefers concise headlines first.",
      entries: [
        { key: "tone", value: "direct", sensitivity: "low" as const },
        { key: "priority", value: "citations first", sensitivity: "low" as const }
      ],
      retentionDays: 90
    });

    await runAssistantQuery({
      organizationId: "org_1",
      actorId: "user_1",
      viewerPrincipalKeys: ["email:user@company.com"],
      input: {
        query: "who owns incident policy",
        mode: "ask"
      }
    });

    const personalizedCall = provider.answerQuestion.mock.calls
      .map((call) => call[0] as { question: string })
      .find((call) => call.question.includes("Personalization context"));
    expect(personalizedCall?.question).toContain("Personalization context");
    expect(personalizedCall?.question).toContain("tone: direct");
    expect(touchUserMemoryProfileLastUsedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org_1",
        userId: "user_1"
      })
    );
  });
});
