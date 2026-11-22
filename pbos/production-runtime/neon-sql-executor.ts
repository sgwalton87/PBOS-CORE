/**
 * Private server-side Neon SQL transport. Never expose DATABASE_URL to a browser.
 * The caller owns the pool lifecycle; no connection is made at module import.
 */
import { Pool } from "pg";
import type { SqlExecutor } from "./fenced-cloud-state-coordinator";

export function createNeonSqlExecutor(connectionString: string): SqlExecutor & { close(): Promise<void> } {
  const url = new URL(connectionString);
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error("PBOS requires a PostgreSQL connection URL");
  }
  if (!url.hostname.endsWith(".neon.tech") || !url.username || !url.password) {
    throw new Error("PBOS requires a private authenticated Neon endpoint");
  }
  const pool = new Pool({
    connectionString,
    max: 2,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 10000,
    ssl: { rejectUnauthorized: true },
    application_name: "pbos-cloud-runner"
  });
  return {
    async query<T extends Record<string, unknown>>(sql: string, parameters: readonly unknown[]): Promise<readonly T[]> {
      const result = await pool.query(sql, [...parameters]);
      return result.rows as T[];
    },
    close: () => pool.end()
  };
}
