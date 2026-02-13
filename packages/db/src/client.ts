import { Pool, type QueryResultRow } from "pg";

const connectionString = process.env.DATABASE_URL;
const useSsl = process.env.PG_SSL === "true";
const allowSelfSigned = process.env.PG_SSL_ALLOW_SELF_SIGNED === "true";

export const pool = new Pool({
  connectionString,
  max: 10,
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
