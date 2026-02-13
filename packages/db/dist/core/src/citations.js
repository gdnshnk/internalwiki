export function validateCitation(citation) {
    return (citation.chunkId.length > 0 &&
        citation.docVersionId.length > 0 &&
        citation.startOffset >= 0 &&
        citation.endOffset >= citation.startOffset &&
        citation.sourceUrl.startsWith("http"));
}
export function citationCoverage(params) {
    if (params.claims <= 0) {
        return 1;
    }
    const validCount = params.citations.filter(validateCitation).length;
    return Math.min(1, validCount / params.claims);
}
//# sourceMappingURL=citations.js.map