import type { AiProvider, AskModelInput } from "./provider";
import type { Citation, GroundedAnswer } from "@internalwiki/core";
export declare class MockAiProvider implements AiProvider {
    readonly name = "mock";
    answerQuestion(input: AskModelInput): Promise<GroundedAnswer>;
    summarize(input: {
        content: string;
        citations: Citation[];
    }): Promise<{
        summary: string;
        citations: Citation[];
    }>;
}
//# sourceMappingURL=mock-provider.d.ts.map