import { z } from "zod";
export const groundedAnswerSchema = z.object({
    answer: z.string().min(1),
    citations: z
        .array(z.object({
        chunkId: z.string(),
        docVersionId: z.string(),
        sourceUrl: z.string().url(),
        startOffset: z.number().int().nonnegative(),
        endOffset: z.number().int().nonnegative()
    }))
        .min(1),
    confidence: z.number().min(0).max(1),
    sourceScore: z.number().min(0).max(100)
});
//# sourceMappingURL=provider.js.map