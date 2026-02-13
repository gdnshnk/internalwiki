import { describe, expect, test } from "vitest";
import { embedTexts } from "../src/embeddings";

describe("embedTexts", () => {
  test("returns deterministic fallback vectors when api key is absent", async () => {
    const [a, b] = await embedTexts({
      texts: ["Incident policy owner", "Incident policy owner"],
      apiKey: ""
    });

    expect(a.length).toBe(1536);
    expect(a).toEqual(b);
  });

  test("preserves ordering for multiple inputs", async () => {
    const vectors = await embedTexts({
      texts: ["alpha", "bravo", "charlie"],
      apiKey: ""
    });

    expect(vectors).toHaveLength(3);
    expect(vectors[0]).not.toEqual(vectors[1]);
    expect(vectors[1]).not.toEqual(vectors[2]);
  });
});
