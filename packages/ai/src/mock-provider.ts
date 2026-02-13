import type { AiProvider, AskModelInput } from "./provider";
import type { Citation, GroundedAnswer } from "@internalwiki/core";

export class MockAiProvider implements AiProvider {
  readonly name = "mock";

  async answerQuestion(input: AskModelInput): Promise<GroundedAnswer> {
    const top = input.contextChunks[0];

    return {
      answer: top
        ? `Grounded answer from ${top.sourceUrl}: ${top.text.slice(0, 200)}`
        : "No relevant context found.",
      citations: top
        ? [
            {
              chunkId: top.chunkId,
              docVersionId: top.docVersionId,
              sourceUrl: top.sourceUrl,
              startOffset: 0,
              endOffset: Math.min(180, top.text.length)
            }
          ]
        : [],
      confidence: top ? 0.78 : 0.2,
      sourceScore: top ? top.sourceScore : 0
    };
  }

  async summarize(input: { content: string; citations: Citation[] }): Promise<{ summary: string; citations: Citation[] }> {
    return {
      summary: input.content.slice(0, 500),
      citations: input.citations
    };
  }
}
