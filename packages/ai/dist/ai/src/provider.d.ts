import { z } from "zod";
import type { Citation, GroundedAnswer } from "@internalwiki/core";
export declare const groundedAnswerSchema: z.ZodObject<{
    answer: z.ZodString;
    citations: z.ZodArray<z.ZodObject<{
        chunkId: z.ZodString;
        docVersionId: z.ZodString;
        sourceUrl: z.ZodString;
        startOffset: z.ZodNumber;
        endOffset: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        chunkId: string;
        docVersionId: string;
        sourceUrl: string;
        startOffset: number;
        endOffset: number;
    }, {
        chunkId: string;
        docVersionId: string;
        sourceUrl: string;
        startOffset: number;
        endOffset: number;
    }>, "many">;
    confidence: z.ZodNumber;
    sourceScore: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    answer: string;
    citations: {
        chunkId: string;
        docVersionId: string;
        sourceUrl: string;
        startOffset: number;
        endOffset: number;
    }[];
    confidence: number;
    sourceScore: number;
}, {
    answer: string;
    citations: {
        chunkId: string;
        docVersionId: string;
        sourceUrl: string;
        startOffset: number;
        endOffset: number;
    }[];
    confidence: number;
    sourceScore: number;
}>;
export type AskModelInput = {
    question: string;
    contextChunks: Array<{
        chunkId: string;
        docVersionId: string;
        sourceUrl: string;
        text: string;
        sourceScore: number;
    }>;
};
export interface AiProvider {
    name: string;
    answerQuestion(input: AskModelInput): Promise<GroundedAnswer>;
    summarize(input: {
        content: string;
        citations: Citation[];
    }): Promise<{
        summary: string;
        citations: Citation[];
    }>;
}
//# sourceMappingURL=provider.d.ts.map