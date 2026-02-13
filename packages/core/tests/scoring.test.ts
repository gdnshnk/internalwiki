import { describe, expect, test } from "vitest";
import { computeSourceScore, recencyDecay } from "../src/scoring";

describe("scoring", () => {
  test("keeps factors and total in expected range", () => {
    const score = computeSourceScore({
      updatedAt: new Date().toISOString(),
      sourceAuthority: 0.9,
      authorAuthority: 0.8,
      citationCoverage: 1
    });

    expect(score.total).toBeGreaterThanOrEqual(0);
    expect(score.total).toBeLessThanOrEqual(100);
    expect(score.factors.recency).toBeGreaterThan(0.9);
  });

  test("recency decays over time", () => {
    const now = new Date("2026-02-12T00:00:00.000Z");
    const fresh = recencyDecay("2026-02-11T23:00:00.000Z", now);
    const stale = recencyDecay("2025-12-01T00:00:00.000Z", now);

    expect(fresh).toBeGreaterThan(stale);
  });
});
