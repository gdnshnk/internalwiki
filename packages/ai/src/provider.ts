import { z } from "zod";
import type { Citation, GroundedAnswer } from "@internalwiki/core";

export const groundedAnswerSchema = z.object({
  answer: z.string().min(1),
  citations: z
    .array(
      z.object({
        chunkId: z.string(),
        docVersionId: z.string(),
        sourceUrl: z.string().url(),
        startOffset: z.number().int().nonnegative(),
        endOffset: z.number().int().nonnegative()
      })
    )
    .min(1),
  confidence: z.number().min(0).max(1),
  sourceScore: z.number().min(0).max(100)
});

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
  summarize(input: { content: string; citations: Citation[] }): Promise<{ summary: string; citations: Citation[] }>;
}
