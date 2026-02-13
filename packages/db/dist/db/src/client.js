import { Pool } from "pg";
const connectionString = process.env.DATABASE_URL;
export const pool = new Pool({
    connectionString,
    max: 10,
    ssl: process.env.PG_SSL === "true" ? { rejectUnauthorized: false } : undefined
});
export async function query(text, params = []) {
    const result = await pool.query(text, params);
    return result.rows;
}
//# sourceMappingURL=client.js.map