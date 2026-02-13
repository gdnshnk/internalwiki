export class MockAiProvider {
    name = "mock";
    async answerQuestion(input) {
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
    async summarize(input) {
        return {
            summary: input.content.slice(0, 500),
            citations: input.citations
        };
    }
}
//# sourceMappingURL=mock-provider.js.map