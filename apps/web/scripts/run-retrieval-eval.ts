import { retrievalBenchmarkCases } from "@/evals/retrieval-benchmark";
import { runRetrievalEvalBenchmark } from "@/lib/retrieval-eval";

function readNumberEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
}

async function main(): Promise<void> {
  const organizationId = process.env.INTERNALWIKI_EVAL_ORG_ID ?? process.env.INTERNALWIKI_DEFAULT_ORG_ID;
  if (!organizationId) {
    throw new Error("Set INTERNALWIKI_EVAL_ORG_ID to run retrieval eval benchmark.");
  }

  const thresholdGoodPct = readNumberEnv("INTERNALWIKI_EVAL_THRESHOLD", 75);
  const persist = process.env.INTERNALWIKI_EVAL_NO_PERSIST === "1" ? false : true;
  const actorId = process.env.INTERNALWIKI_EVAL_ACTOR_ID;

  const result = await runRetrievalEvalBenchmark({
    organizationId,
    cases: retrievalBenchmarkCases,
    thresholdGoodPct,
    persist,
    actorId
  });

  const summary = [
    `organization=${result.organizationId}`,
    `cases=${result.totalCases}`,
    `good=${result.goodCases}`,
    `bad=${result.badCases}`,
    `score=${result.scoreGoodPct.toFixed(1)}%`,
    `threshold=${result.thresholdGoodPct.toFixed(1)}%`,
    `pass=${result.passThreshold}`,
    `runId=${result.runId ?? "n/a"}`
  ].join(" ");

  console.log(`[retrieval-eval] ${summary}`);

  if (!result.passThreshold) {
    console.error("[retrieval-eval] quality regression: score fell below threshold.");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("[retrieval-eval] failed:", (error as Error).message);
  process.exit(1);
});
