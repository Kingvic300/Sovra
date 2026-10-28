import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import { AllExceptionsFilter } from "./common/all-exceptions.filter.js";
import type { Env } from "./config/env.js";
import { securityHeaders } from "./security/security-headers.js";

/** HTTP setup shared by main.ts and the integration tests, so both serve the same API. */
export function configureApp(app: NestExpressApplication, env: Env) {
  app.disable("x-powered-by");
  app.use(securityHeaders(env));
  app.setGlobalPrefix("api");
  app.use(cookieParser());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableCors({ origin: env.FRONTEND_ORIGIN, credentials: true });
  app.set("trust proxy", env.TRUST_PROXY);
}
