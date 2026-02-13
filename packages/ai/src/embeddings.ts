import { createHash } from "node:crypto";

type EmbeddingsResponse = {
  data?: Array<{
    embedding: number[];
    index: number;
  }>;
};

function hashEmbedding(text: string, dimensions = 1536): number[] {
  const vector = new Array<number>(dimensions).fill(0);
  const normalized = text.toLowerCase();

  for (let i = 0; i < normalized.length; i += 1) {
    const charCode = normalized.charCodeAt(i);
    const index = (charCode * 31 + i * 17) % dimensions;
    vector[index] += ((charCode % 13) + 1) / 13;
  }

  const norm = Math.sqrt(vector.reduce((acc, value) => acc + value * value, 0)) || 1;
  return vector.map((value) => value / norm);
}

function stableSortByIndex(values: Array<{ embedding: number[]; index: number }>): number[][] {
  return values
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((item) => item.embedding);
}

function batched<T>(values: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    output.push(values.slice(index, index + size));
  }
  return output;
}

export async function embedTexts(input: {
  texts: string[];
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  dimensions?: number;
}): Promise<number[][]> {
  if (input.texts.length === 0) {
    return [];
  }

  const model = input.model ?? "text-embedding-3-small";
  const baseUrl = input.baseUrl ?? "https://api.openai.com/v1";
  const dimensions = input.dimensions ?? 1536;
  const apiKey = input.apiKey ?? process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return input.texts.map((text) => hashEmbedding(text, dimensions));
  }

  try {
    const outputs: number[][] = [];
    for (const group of batched(input.texts, 100)) {
      const response = await fetch(`${baseUrl}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          input: group
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI embeddings request failed (${response.status})`);
      }

      const payload = (await response.json()) as EmbeddingsResponse;
      if (!payload.data || payload.data.length !== group.length) {
        throw new Error("OpenAI embeddings response was incomplete");
      }

      outputs.push(...stableSortByIndex(payload.data));
    }

    return outputs;
  } catch (error) {
    const trace = createHash("sha1").update((error as Error).message).digest("hex").slice(0, 8);
    console.warn(`embedTexts fallback to deterministic vectors trace=${trace}`);
    return input.texts.map((text) => hashEmbedding(text, dimensions));
  }
}
