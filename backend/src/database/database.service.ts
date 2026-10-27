import { Inject, Injectable, Logger, type OnApplicationShutdown } from "@nestjs/common";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { notConfigured } from "../common/errors.js";
import { ENV, type Env } from "../config/env.js";
import * as schema from "./schema.js";

export type Db = PostgresJsDatabase<typeof schema>;

/** Holds the Drizzle client. With no DATABASE_URL the app still boots; `db` throws a 503 when used. */
@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly sql: postgres.Sql | null;
  private readonly client: Db | null;

  constructor(@Inject(ENV) env: Env) {
    if (env.DATABASE_URL) {
      this.sql = postgres(env.DATABASE_URL, { max: 10 });
      this.client = drizzle(this.sql, { schema });
    } else {
      this.sql = null;
      this.client = null;
      this.logger.warn("DATABASE_URL is not set. Routes that need the database will answer 503.");
    }
  }

  get available() {
    return this.client !== null;
  }

  get db(): Db {
    if (!this.client) throw notConfigured("The database");
    return this.client;
  }

  async onApplicationShutdown() {
    await this.sql?.end({ timeout: 5 });
  }
}
