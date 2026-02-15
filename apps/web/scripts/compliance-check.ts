import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(thisDir, "..");
const repoRoot = path.resolve(webRoot, "..", "..");

type CheckResult = {
  name: string;
  ok: boolean;
  details?: string;
};

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

function assertContainsAll(content: string, required: string[]): string[] {
  return required.filter((token) => !content.includes(token));
}

async function runChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  const nextConfig = await readRepoFile("apps/web/next.config.ts");
  const missingHeaders = assertContainsAll(nextConfig, [
    "Content-Security-Policy",
    "X-Frame-Options",
    "X-Content-Type-Options",
    "Referrer-Policy",
    "Permissions-Policy"
  ]);
  results.push({
    name: "security_headers_present",
    ok: missingHeaders.length === 0,
    details: missingHeaders.length > 0 ? `Missing header declarations: ${missingHeaders.join(", ")}` : undefined
  });

  const mutatingRouteFiles = [
    "apps/web/app/api/auth/password/login/route.ts",
    "apps/web/app/api/auth/password/register/route.ts",
    "apps/web/app/api/onboarding/complete/route.ts",
    "apps/web/app/api/orgs/[orgId]/summaries/[summaryId]/review/route.ts",
    "apps/web/app/api/orgs/[orgId]/connectors/route.ts",
    "apps/web/app/api/orgs/[orgId]/connectors/[connectorId]/route.ts",
    "apps/web/app/api/orgs/[orgId]/connectors/[connectorId]/sync/route.ts",
    "apps/web/app/api/orgs/[orgId]/security/domains/route.ts",
    "apps/web/app/api/orgs/[orgId]/security/domains/[domainId]/route.ts",
    "apps/web/app/api/orgs/[orgId]/security/invites/route.ts",
    "apps/web/app/api/orgs/[orgId]/security/invites/[inviteId]/route.ts",
    "apps/web/app/api/orgs/[orgId]/security/personalization-memory/route.ts",
    "apps/web/app/api/orgs/[orgId]/security/privacy/dsr/export/route.ts",
    "apps/web/app/api/orgs/[orgId]/security/privacy/dsr/delete/route.ts",
    "apps/web/app/api/orgs/[orgId]/knowledge/objects/route.ts",
    "apps/web/app/api/orgs/[orgId]/knowledge/objects/[objectId]/route.ts",
    "apps/web/app/api/orgs/[orgId]/knowledge/objects/[objectId]/versions/route.ts",
    "apps/web/app/api/orgs/[orgId]/knowledge/review-queue/[taskId]/route.ts"
  ];

  for (const routePath of mutatingRouteFiles) {
    const content = await readRepoFile(routePath);
    const missing = assertContainsAll(content, ["enforceMutationSecurity", "checkRateLimit"]);
    results.push({
      name: `route_guard_rate_limit:${routePath}`,
      ok: missing.length === 0,
      details: missing.length > 0 ? `Missing: ${missing.join(", ")}` : undefined
    });
  }

  const idempotencyRouteFiles = [
    "apps/web/app/api/orgs/[orgId]/connectors/route.ts",
    "apps/web/app/api/orgs/[orgId]/connectors/[connectorId]/route.ts",
    "apps/web/app/api/orgs/[orgId]/connectors/[connectorId]/sync/route.ts",
    "apps/web/app/api/orgs/[orgId]/security/domains/route.ts",
    "apps/web/app/api/orgs/[orgId]/security/domains/[domainId]/route.ts",
    "apps/web/app/api/orgs/[orgId]/security/invites/route.ts",
    "apps/web/app/api/orgs/[orgId]/security/invites/[inviteId]/route.ts",
    "apps/web/app/api/orgs/[orgId]/security/personalization-memory/route.ts",
    "apps/web/app/api/orgs/[orgId]/security/session-policies/route.ts",
    "apps/web/app/api/orgs/[orgId]/security/audit/export/route.ts",
    "apps/web/app/api/orgs/[orgId]/security/privacy/dsr/export/route.ts",
    "apps/web/app/api/orgs/[orgId]/security/privacy/dsr/delete/route.ts",
    "apps/web/app/api/orgs/[orgId]/knowledge/objects/route.ts",
    "apps/web/app/api/orgs/[orgId]/knowledge/objects/[objectId]/route.ts",
    "apps/web/app/api/orgs/[orgId]/knowledge/objects/[objectId]/versions/route.ts",
    "apps/web/app/api/orgs/[orgId]/knowledge/review-queue/[taskId]/route.ts"
  ];

  for (const routePath of idempotencyRouteFiles) {
    const content = await readRepoFile(routePath);
    const missing = assertContainsAll(content, ["beginIdempotentMutation", "finalizeIdempotentMutation"]);
    results.push({
      name: `route_idempotency:${routePath}`,
      ok: missing.length === 0,
      details: missing.length > 0 ? `Missing: ${missing.join(", ")}` : undefined
    });
  }

  const repositoriesFile = await readRepoFile("packages/db/src/repositories.ts");
  const orgScopedSystemQueryMatches =
    repositoriesFile.match(
      /export async function\s+\w+\(\s*organizationId:\s*string[\s\S]{0,1400}?querySystem\(/g
    ) ?? [];
  results.push({
    name: "repositories_org_scoped_no_query_system",
    ok: orgScopedSystemQueryMatches.length === 0,
    details:
      orgScopedSystemQueryMatches.length > 0
        ? `Found org-scoped functions using querySystem: ${orgScopedSystemQueryMatches.length}`
        : undefined
  });

  return results;
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
    console.error(`compliance-check failed (${failures.length} checks)`);
    process.exit(1);
  }

  console.log("compliance-check passed");
}

main().catch((error) => {
  console.error("compliance-check crashed:", (error as Error).message);
  process.exit(1);
});
