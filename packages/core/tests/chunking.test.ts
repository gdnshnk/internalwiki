import { describe, expect, test } from "vitest";
import { chunkText } from "../src/chunking";

describe("chunking", () => {
  test("returns overlapping chunks", () => {
    const text = "a".repeat(2500);
    const chunks = chunkText(text, { maxCharsPerChunk: 500, overlapChars: 100 });

    expect(chunks.length).toBeGreaterThan(4);
    expect(chunks[0].length).toBe(500);
  });

  test("returns empty for blank text", () => {
    expect(chunkText("   ")).toEqual([]);
  });
});
