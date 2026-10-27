import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module.js";
import { AllExceptionsFilter } from "./common/all-exceptions.filter.js";
import { ENV, type Env } from "./config/env.js";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: false });
  const env = app.get<Env>(ENV);

  app.setGlobalPrefix("api");
  app.use(cookieParser());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableCors({ origin: env.FRONTEND_ORIGIN, credentials: true });
  app.set("trust proxy", 1);
  app.enableShutdownHooks();

  await app.listen(env.PORT);
  Logger.log(`Sovra API listening on http://localhost:${env.PORT}/api`, "Bootstrap");
}

void bootstrap();
