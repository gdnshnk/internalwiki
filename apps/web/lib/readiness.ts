import { query } from "@internalwiki/db";

const requiredEnvAlways = ["DATABASE_URL", "INTERNALWIKI_ENCRYPTION_KEY", "INTERNALWIKI_SESSION_SIGNING_KEY"] as const;
const requiredEnvProductionOnly = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_OAUTH_REDIRECT_URI"] as const;

function missingCriticalEnv(nodeEnv: string): string[] {
  const required = [
    ...requiredEnvAlways,
    ...(nodeEnv === "production" ? requiredEnvProductionOnly : [])
  ];

  return required.filter((key) => !process.env[key] || process.env[key]?.trim().length === 0);
}

export type ReadinessResult = {
  ready: boolean;
  environment: string;
  timestamp: string;
  checks: {
    env: {
      ok: boolean;
      missing: string[];
    };
    database: {
      ok: boolean;
      latencyMs: number;
      error?: string;
    };
  };
};

export async function evaluateReadiness(): Promise<ReadinessResult> {
  const environment = process.env.NODE_ENV ?? "development";
  const missing = missingCriticalEnv(environment);

  const dbStartedAt = Date.now();
  let dbOk = false;
  let dbError: string | undefined;
  try {
    const rows = await query<{ ok: number }>("SELECT 1 AS ok");
    dbOk = rows[0]?.ok === 1;
  } catch (error) {
    dbOk = false;
    dbError = (error as Error).message;
  }

  return {
    ready: missing.length === 0 && dbOk,
    environment,
    timestamp: new Date().toISOString(),
    checks: {
      env: {
        ok: missing.length === 0,
        missing
      },
      database: {
        ok: dbOk,
        latencyMs: Date.now() - dbStartedAt,
        ...(dbError ? { error: dbError } : {})
      }
    }
  };
}
