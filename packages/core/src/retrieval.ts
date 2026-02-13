import type { DocumentChunk } from "./types";

type RankedChunk = DocumentChunk & {
  combinedScore: number;
};

function normalize(scores: number[]): number[] {
  const max = Math.max(...scores, 0.0001);
  return scores.map((score) => score / max);
}

export function rerankHybrid(params: {
  chunks: DocumentChunk[];
  lexicalScores: number[];
  semanticScores: number[];
  limit?: number;
}): RankedChunk[] {
  const limit = params.limit ?? 8;
  if (
    params.chunks.length !== params.lexicalScores.length ||
    params.chunks.length !== params.semanticScores.length
  ) {
    throw new Error("Score and chunk arrays must align");
  }

  const lexical = normalize(params.lexicalScores);
  const semantic = normalize(params.semanticScores);

  return params.chunks
    .map((chunk, i) => {
      const relevance = lexical[i] * 0.45 + semantic[i] * 0.55;
      const trust = Math.min(1, Math.max(0, chunk.sourceScore / 100));
      return {
        ...chunk,
        combinedScore: relevance * 0.7 + trust * 0.3
      };
    })
    .sort((a, b) => b.combinedScore - a.combinedScore)
    .slice(0, limit);
}
