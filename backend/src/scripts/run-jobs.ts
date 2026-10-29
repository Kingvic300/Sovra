import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module.js";
import { DatabaseService } from "../database/database.service.js";
import { JobsService } from "../reminders/reminders.module.js";

/**
 * `npm run jobs:run`: deletes expired demo accounts and refreshes every user's reminders once,
 * then exits. For any cron that can run a command. Uses only the database: no paid API calls.
 */
async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["log", "warn", "error"] });
  try {
    if (!app.get(DatabaseService).available) throw new Error("DATABASE_URL is not set.");
    await app.get(JobsService).runAll();
  } finally {
    await app.close();
  }
}

main().catch((err: unknown) => {
  Logger.error(err instanceof Error ? err.message : String(err), "Jobs");
  process.exitCode = 1;
});
