import { MockAiProvider, OpenAiProvider, embedTexts, type AiProvider } from "@internalwiki/ai";

export function getAiProvider(): AiProvider {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new MockAiProvider();
  }

  return new OpenAiProvider({
    apiKey,
    model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini"
  });
}

export async function embedQueryText(text: string): Promise<number[]> {
  const vectors = await embedTexts({
    texts: [text],
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small"
  });

  return vectors[0] ?? [];
}
