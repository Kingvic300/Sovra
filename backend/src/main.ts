import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module.js";
import { configureApp } from "./app.setup.js";
import { ENV, type Env } from "./config/env.js";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: false });
  const env = app.get<Env>(ENV);

  configureApp(app, env);
  app.enableShutdownHooks();

  await app.listen(env.PORT);
  Logger.log(`Sovra API listening on http://localhost:${env.PORT}/api`, "Bootstrap");
}

void bootstrap();
