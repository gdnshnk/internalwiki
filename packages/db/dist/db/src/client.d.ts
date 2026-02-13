import { Pool, type QueryResultRow } from "pg";
export declare const pool: Pool;
export declare function query<T extends QueryResultRow>(text: string, params?: unknown[]): Promise<T[]>;
//# sourceMappingURL=client.d.ts.map