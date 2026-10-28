import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { RateLimitGuard } from "./rate-limit.js";

/** Rate limiting for every route. Security headers are Express middleware, set in app.setup.ts. */
@Module({
  providers: [{ provide: APP_GUARD, useClass: RateLimitGuard }],
})
export class SecurityModule {}
