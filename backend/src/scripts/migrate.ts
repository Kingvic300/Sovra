import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/** Compiled to dist/scripts/, so the committed migrations are two levels up (the same in the Docker image). */
const MIGRATIONS = fileURLToPath(new URL("../../drizzle", import.meta.url));

/** Any fixed number works; every instance must use the same one. */
const MIGRATION_LOCK = 7_402_118;

/**
 * `npm run migrate`: applies the migrations in drizzle/ with drizzle-orm's migrator, so production needs no
 * dev dependencies. It records them in the same table as `drizzle-kit migrate`, so either can be used on a
 * database. A Postgres advisory lock makes instances that start together take turns: the first applies the
 * migrations, the others then find nothing left to do.
 */
async function main() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.warn("[migrate] DATABASE_URL is not set. Skipping migrations; data routes will answer 503.");
    return;
  }
  // One connection, so the session-level lock and the migrations share it.
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await sql`select pg_advisory_lock(${MIGRATION_LOCK})`;
    await migrate(drizzle(sql), { migrationsFolder: MIGRATIONS });
    await sql`select pg_advisory_unlock(${MIGRATION_LOCK})`;
    console.log("[migrate] Database is up to date.");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err: unknown) => {
  console.error(`[migrate] Failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
