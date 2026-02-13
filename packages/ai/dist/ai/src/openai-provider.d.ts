import type { AiProvider, AskModelInput } from "./provider";
import type { Citation, GroundedAnswer } from "@internalwiki/core";
export declare class OpenAiProvider implements AiProvider {
    private readonly opts;
    readonly name = "openai";
    constructor(opts: {
        apiKey: string;
        model?: string;
        baseUrl?: string;
    });
    answerQuestion(input: AskModelInput): Promise<GroundedAnswer>;
    summarize(input: {
        content: string;
        citations: Citation[];
    }): Promise<{
        summary: string;
        citations: Citation[];
    }>;
}
//# sourceMappingURL=openai-provider.d.ts.map