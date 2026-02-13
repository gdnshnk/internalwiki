import type { DocumentChunk } from "./types";
type RankedChunk = DocumentChunk & {
    combinedScore: number;
};
export declare function rerankHybrid(params: {
    chunks: DocumentChunk[];
    lexicalScores: number[];
    semanticScores: number[];
    limit?: number;
}): RankedChunk[];
export {};
//# sourceMappingURL=retrieval.d.ts.map