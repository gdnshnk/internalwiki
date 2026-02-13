export const SCORE_MODEL_VERSION = "v1.0.0";
const WEIGHTS = {
    recency: 0.35,
    sourceAuthority: 0.25,
    authorAuthority: 0.2,
    citationCoverage: 0.2
};
function clamp(value) {
    if (Number.isNaN(value)) {
        return 0;
    }
    return Math.min(1, Math.max(0, value));
}
export function recencyDecay(updatedAtIso, now = new Date()) {
    const updatedAt = new Date(updatedAtIso);
    if (Number.isNaN(updatedAt.getTime())) {
        return 0;
    }
    const ageHours = Math.max(0, (now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60));
    const halfLifeHours = 24 * 14;
    return clamp(Math.exp((-Math.log(2) * ageHours) / halfLifeHours));
}
export function computeSourceScore(input) {
    const factors = {
        recency: recencyDecay(input.updatedAt, input.now),
        sourceAuthority: clamp(input.sourceAuthority),
        authorAuthority: clamp(input.authorAuthority),
        citationCoverage: clamp(input.citationCoverage)
    };
    const weighted = factors.recency * WEIGHTS.recency +
        factors.sourceAuthority * WEIGHTS.sourceAuthority +
        factors.authorAuthority * WEIGHTS.authorAuthority +
        factors.citationCoverage * WEIGHTS.citationCoverage;
    return {
        total: Math.round(clamp(weighted) * 100),
        factors,
        computedAt: new Date().toISOString(),
        modelVersion: SCORE_MODEL_VERSION
    };
}
//# sourceMappingURL=scoring.js.map