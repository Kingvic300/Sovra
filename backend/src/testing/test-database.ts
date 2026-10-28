import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Db, DatabaseService } from "../database/database.service.js";
import * as schema from "../database/schema.js";

/** Compiled to dist-test/testing/, so the committed migrations are two levels up. */
const MIGRATIONS = fileURLToPath(new URL("../../drizzle", import.meta.url));

export type TestDatabase = {
  /** Drop-in replacement for DatabaseService, backed by in-process Postgres. */
  service: DatabaseService;
  db: Db;
  /** Removes every row. Users cascade to all user-owned tables. */
  reset: () => Promise<void>;
  close: () => Promise<void>;
};

/** In-memory Postgres (PGlite) with the real migrations applied, so schema drift fails tests. */
export async function createTestDatabase(): Promise<TestDatabase> {
  const client = new PGlite();
  const pglite = drizzle(client, { schema });
  await migrate(pglite, { migrationsFolder: MIGRATIONS });
  // The query builder API is the same as postgres-js; only the driver differs.
  const db = pglite as unknown as Db;
  const service = { available: true, db, onApplicationShutdown: async () => {} } as unknown as DatabaseService;
  return {
    service,
    db,
    reset: async () => {
      await pglite.execute(sql`truncate table users, auth_nonces cascade`);
    },
    close: () => client.close(),
  };
}
