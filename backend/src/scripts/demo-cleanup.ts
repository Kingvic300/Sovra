import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module.js";
import { DemoService } from "../auth/demo.service.js";
import { DatabaseService } from "../database/database.service.js";

/** `npm run demo:cleanup`: deletes expired demo accounts once and exits. Safe to run from any cron. */
async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["log", "warn", "error"] });
  try {
    if (!app.get(DatabaseService).available) throw new Error("DATABASE_URL is not set.");
    const deleted = await app.get(DemoService).cleanupExpired();
    Logger.log(`Expired demo accounts deleted: ${deleted}`, "DemoCleanup");
  } finally {
    await app.close();
  }
}

main().catch((err: unknown) => {
  Logger.error(err instanceof Error ? err.message : String(err), "DemoCleanup");
  process.exitCode = 1;
});
