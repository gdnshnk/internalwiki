import type { AiProvider } from "@internalwiki/ai";

export type ExpandedQuery = {
  original: string;
  variations: string[];
  intent?: "factual" | "procedural" | "analytical";
};

/**
 * Expands a query by generating synonyms and related terms using AI
 */
export async function expandQuery(
  query: string,
  aiProvider: AiProvider
): Promise<ExpandedQuery> {
  // Simple expansion: generate 3-5 query variations
  const expansionPrompt = `Generate 3-5 alternative phrasings or related queries for the following question. Return only the queries, one per line, without numbering or bullets:

Question: ${query}

Alternative queries:`;

  try {
    // Use AI to generate query variations
    const response = await aiProvider.answerQuestion({
      question: expansionPrompt,
      contextChunks: []
    });

    const variations = response.answer
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.match(/^\d+[\.\)]/))
      .slice(0, 5);

    // Classify intent
    const intent = classifyQueryIntent(query);

    return {
      original: query,
      variations: variations.length > 0 ? variations : [query],
      intent
    };
  } catch (error) {
    // Fallback to original query if expansion fails
    console.error("[QueryExpansion] Failed to expand query:", error);
    return {
      original: query,
      variations: [query],
      intent: classifyQueryIntent(query)
    };
  }
}

/**
 * Classifies query intent based on keywords and patterns
 */
function classifyQueryIntent(query: string): "factual" | "procedural" | "analytical" {
  const lowerQuery = query.toLowerCase();

  // Procedural indicators
  if (
    /\b(how|what steps|process|procedure|workflow|guide|tutorial|instructions)\b/i.test(lowerQuery)
  ) {
    return "procedural";
  }

  // Analytical indicators
  if (
    /\b(why|analyze|compare|evaluate|assess|trend|pattern|relationship|impact)\b/i.test(lowerQuery)
  ) {
    return "analytical";
  }

  // Default to factual
  return "factual";
}

/**
 * Generates multiple query variations for better retrieval
 */
export function generateQueryVariations(query: string): string[] {
  const variations: string[] = [query];

  // Add variations with common synonyms
  const synonyms: Record<string, string[]> = {
    what: ["which", "what is"],
    how: ["what is the process", "what are the steps"],
    who: ["which person", "which team"],
    when: ["what time", "what date"],
    where: ["which location", "in what"]
  };

  for (const [word, alternatives] of Object.entries(synonyms)) {
    if (query.toLowerCase().startsWith(word)) {
      for (const alt of alternatives) {
        const variation = query.replace(new RegExp(`^${word}`, "i"), alt);
        if (variation !== query) {
          variations.push(variation);
        }
      }
      break;
    }
  }

  return variations.slice(0, 5);
}
