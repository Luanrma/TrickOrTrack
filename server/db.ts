import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import { readFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
export interface SQL {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
}
export interface Database extends SQL {
  transaction<T>(fn: (tx: SQL) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
export async function openDatabase(
  url?: string,
  path = ".data/pglite",
): Promise<Database> {
  if (url) {
    const pool = new pg.Pool({ connectionString: url, max: 10 });
    return {
      query: async <T>(sql: string, params?: unknown[]) => ({
        rows: (await pool.query(sql, params)).rows as T[],
      }),
      transaction: async (fn) => {
        const c = await pool.connect();
        try {
          await c.query("BEGIN");
          const v = await fn({
            query: async <T>(s: string, p?: unknown[]) => ({
              rows: (await c.query(s, p)).rows as T[],
            }),
          });
          await c.query("COMMIT");
          return v;
        } catch (e) {
          await c.query("ROLLBACK");
          throw e;
        } finally {
          c.release();
        }
      },
      close: () => pool.end(),
    };
  }
  if (path !== ":memory:") await mkdir(dirname(path), { recursive: true });
  const db = new PGlite(path === ":memory:" ? undefined : path);
  await db.waitReady;
  return {
    query: async <T>(sql: string, params?: unknown[]) =>
      db.query<T>(sql, params),
    transaction: (fn) =>
      db.transaction((tx) =>
        fn({
          query: async <T>(sql: string, params?: unknown[]) =>
            tx.query<T>(sql, params),
        }),
      ),
    close: () => db.close(),
  };
}
export async function migrate(db: Database) {
  // A single versioned, idempotent migration for the initial schema.
  const sql = await readFile(
    new URL("../migrations/001_initial.sql", import.meta.url),
    "utf8",
  );
  await db.transaction(async (tx) => {
    for (const statement of sql.split(";").filter((s) => s.trim()))
      await tx.query(statement);
  });
}
