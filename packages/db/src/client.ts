import { Pool, type PoolClient, type QueryResultRow } from "pg";

const connectionString = process.env.DATABASE_URL;
const useSsl = process.env.PG_SSL === "true";
const allowSelfSigned = process.env.PG_SSL_ALLOW_SELF_SIGNED === "true";
const complianceMode = process.env.INTERNALWIKI_COMPLIANCE_MODE === "enforce" ? "enforce" : "audit";

export const pool = new Pool({
  connectionString,
  max: Number(process.env.DB_POOL_MAX ?? 20), // Increased from 10 to 20 for better concurrency
  min: Number(process.env.DB_POOL_MIN ?? 5), // Minimum connections to keep alive
  idleTimeoutMillis: 30000, // Close idle connections after 30s
  connectionTimeoutMillis: 2000, // Timeout after 2s if connection cannot be established
  ssl: useSsl
    ? {
        rejectUnauthorized: process.env.NODE_ENV === "production" ? true : !allowSelfSigned
      }
    : undefined
});

type QueryScope = {
  organizationId?: string;
  bypassRls?: boolean;
};

async function setScope(client: PoolClient, scope: QueryScope): Promise<void> {
  await client.query("SELECT set_config('internalwiki.rls_mode', $1, false)", [complianceMode]);
  await client.query("SELECT set_config('internalwiki.rls_bypass', $1, false)", [scope.bypassRls ? "on" : "off"]);
  await client.query("SELECT set_config('internalwiki.org_id', $1, false)", [scope.organizationId ?? ""]);
}

async function resetScope(client: PoolClient): Promise<void> {
  await client.query("SELECT set_config('internalwiki.rls_bypass', 'off', false)");
  await client.query("SELECT set_config('internalwiki.org_id', '', false)");
}

async function withScopedClient<T>(scope: QueryScope, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await setScope(client, scope);
    return await fn(client);
  } finally {
    try {
      await resetScope(client);
    } catch {
      // Best-effort cleanup: releasing the client still prevents request deadlock.
    }
    client.release();
  }
}

export function getComplianceMode(): "audit" | "enforce" {
  return complianceMode;
}

export async function queryOrg<T extends QueryResultRow>(
  organizationId: string,
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  if (!organizationId || organizationId.trim().length === 0) {
    throw new Error("queryOrg requires a non-empty organizationId");
  }
  return withScopedClient({ organizationId, bypassRls: false }, async (client) => {
    const result = await client.query<T>(text, params);
    return result.rows;
  });
}

export async function withOrgTransaction<T>(
  organizationId: string,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  if (!organizationId || organizationId.trim().length === 0) {
    throw new Error("withOrgTransaction requires a non-empty organizationId");
  }

  return withScopedClient({ organizationId, bypassRls: false }, async (client) => {
    await client.query("BEGIN");
    try {
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function querySystem<T extends QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await withScopedClient({ bypassRls: true }, async (client) => client.query<T>(text, params));
  return result.rows;
}

// Legacy query path: uses runtime compliance mode, but does not set an org scope automatically.
// New org-scoped repository code should use queryOrg.
export async function query<T extends QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  const result = await withScopedClient({ bypassRls: false }, async (client) => client.query<T>(text, params));
  return result.rows;
}
