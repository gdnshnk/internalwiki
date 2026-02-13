import { Pool, type QueryResultRow } from "pg";

const connectionString = process.env.DATABASE_URL;
const useSsl = process.env.PG_SSL === "true";
const allowSelfSigned = process.env.PG_SSL_ALLOW_SELF_SIGNED === "true";

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

export async function query<T extends QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  const result = await pool.query<T>(text, params);
  return result.rows;
}
