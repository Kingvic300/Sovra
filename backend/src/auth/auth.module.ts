import { Global, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ENV, type Env } from "../config/env.js";
import { WalletModule } from "../wallet/wallet.module.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { DemoService } from "./demo.service.js";
import { SessionGuard } from "./session.guard.js";

/** Global so every feature module can use SessionGuard without re-importing JwtModule. */
@Global()
@Module({
  imports: [
    WalletModule,
    JwtModule.registerAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({ secret: env.SESSION_SECRET }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, DemoService, SessionGuard],
  exports: [SessionGuard, JwtModule, DemoService, AuthService],
})
export class AuthModule {}
