import { describe, expect, test } from "vitest";
import { citationCoverage, validateCitation } from "../src/citations";

describe("citations", () => {
  test("valid citation shape passes", () => {
    const citation = {
      chunkId: "chunk-1",
      docVersionId: "doc-v1",
      sourceUrl: "https://example.com/source",
      startOffset: 0,
      endOffset: 42
    };

    expect(validateCitation(citation)).toBe(true);
  });

  test("coverage uses valid citation count", () => {
    const coverage = citationCoverage({
      claims: 4,
      citations: [
        {
          chunkId: "chunk-1",
          docVersionId: "doc-v1",
          sourceUrl: "https://example.com/source",
          startOffset: 0,
          endOffset: 12
        },
        {
          chunkId: "",
          docVersionId: "doc-v1",
          sourceUrl: "invalid",
          startOffset: 0,
          endOffset: 12
        }
      ]
    });

    expect(coverage).toBe(0.25);
  });
});
