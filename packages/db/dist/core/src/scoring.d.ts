import type { SourceScore } from "./types";
export declare const SCORE_MODEL_VERSION = "v1.0.0";
export declare function recencyDecay(updatedAtIso: string, now?: Date): number;
export declare function computeSourceScore(input: {
    updatedAt: string;
    sourceAuthority: number;
    authorAuthority: number;
    citationCoverage: number;
    now?: Date;
}): SourceScore;
//# sourceMappingURL=scoring.d.ts.map