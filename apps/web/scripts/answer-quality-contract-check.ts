import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

type CheckResult = {
  name: string;
  ok: boolean;
  details?: string;
};

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(thisDir, "..");
const repoRoot = path.resolve(webRoot, "..", "..");

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

function missingTokens(content: string, required: string[]): string[] {
  return required.filter((token) => !content.includes(token));
}

async function runChecks(): Promise<CheckResult[]> {
  const checks: CheckResult[] = [];

  const assistantQuery = await readRepoFile("apps/web/lib/assistant-query.ts");
  const assistantMissing = missingTokens(assistantQuery, [
    "buildAnswerQualityContract",
    "allowHistoricalEvidence",
    "qualityContract"
  ]);
  checks.push({
    name: "assistant_query_contract_enforcement",
    ok: assistantMissing.length === 0,
    details:
      assistantMissing.length > 0 ? `Missing required contract markers: ${assistantMissing.join(", ")}` : undefined
  });

  const contractRoute = await readRepoFile("apps/web/app/api/orgs/[orgId]/answer-quality/contract/route.ts");
  const routeMissing = missingTokens(contractRoute, [
    "requireSessionContext",
    "assertScopedOrgAccess",
    "checkRateLimit",
    "getAnswerQualityContractSummary"
  ]);
  checks.push({
    name: "answer_quality_contract_route_guards",
    ok: routeMissing.length === 0,
    details: routeMissing.length > 0 ? `Missing route guard markers: ${routeMissing.join(", ")}` : undefined
  });

  const streamUi = await readRepoFile("apps/web/components/message-stream.tsx");
  const streamMissing = missingTokens(streamUi, ["Groundedness", "Freshness", "Permission safety"]);
  checks.push({
    name: "message_stream_contract_labels",
    ok: streamMissing.length === 0,
    details: streamMissing.length > 0 ? `Missing UI labels: ${streamMissing.join(", ")}` : undefined
  });

  const repositories = await readRepoFile("packages/db/src/repositories.ts");
  const dbMissing = missingTokens(repositories, ["getAnswerQualityContractSummary", "contract_version"]);
  checks.push({
    name: "db_contract_summary_and_persistence",
    ok: dbMissing.length === 0,
    details: dbMissing.length > 0 ? `Missing DB contract markers: ${dbMissing.join(", ")}` : undefined
  });

  return checks;
}

async function main(): Promise<void> {
  const checks = await runChecks();
  const failures = checks.filter((entry) => !entry.ok);

  for (const check of checks) {
    if (check.ok) {
      console.log(`[ok] ${check.name}`);
    } else {
      console.error(`[fail] ${check.name}${check.details ? ` - ${check.details}` : ""}`);
    }
  }

  if (failures.length > 0) {
    console.error(`answer-quality-contract-check failed (${failures.length} checks)`);
    process.exit(1);
  }

  console.log("answer-quality-contract-check passed");
}

main().catch((error) => {
  console.error("answer-quality-contract-check crashed:", (error as Error).message);
  process.exit(1);
});
