export function chunkText(text, options = {}) {
    const maxCharsPerChunk = options.maxCharsPerChunk ?? 900;
    const overlapChars = options.overlapChars ?? 120;
    if (maxCharsPerChunk <= 0 || overlapChars < 0 || overlapChars >= maxCharsPerChunk) {
        throw new Error("Invalid chunking options");
    }
    const normalized = text.replace(/\s+/g, " ").trim();
    if (!normalized) {
        return [];
    }
    const chunks = [];
    let cursor = 0;
    while (cursor < normalized.length) {
        const end = Math.min(cursor + maxCharsPerChunk, normalized.length);
        chunks.push(normalized.slice(cursor, end));
        if (end === normalized.length) {
            break;
        }
        cursor = Math.max(0, end - overlapChars);
    }
    return chunks;
}
//# sourceMappingURL=chunking.js.map