import { Body, Controller, HttpCode, Post, Res } from "@nestjs/common";
import type { Response } from "express";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe.js";
import { RateLimit } from "../security/rate-limit.js";
import { AuthService } from "./auth.service.js";
import { SESSION_COOKIE, type Session } from "./session.js";

const NonceBody = z.object({ address: z.string().min(3) });
const VerifyBody = z.object({
  address: z.string().min(3),
  /** The exact challenge string returned by /auth/nonce. */
  message: z.string().min(10).max(1000),
  /** Base64 serialized signature from signPersonalMessage. */
  signature: z.string().min(10),
  /** Display-only profile fields from the Google ID token, read in the browser. */
  name: z.string().max(120).optional(),
  email: z.string().email().max(200).optional(),
});

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("nonce")
  @HttpCode(200)
  @RateLimit("auth")
  nonce(@Body(new ZodPipe(NonceBody)) body: z.infer<typeof NonceBody>) {
    return this.auth.createChallenge(body.address);
  }

  @Post("verify")
  @HttpCode(200)
  @RateLimit("auth")
  async verify(@Body(new ZodPipe(VerifyBody)) body: z.infer<typeof VerifyBody>, @Res({ passthrough: true }) res: Response) {
    const session = await this.auth.verify(body);
    return this.startSession(session, res);
  }

  @Post("demo")
  @HttpCode(200)
  @RateLimit("demo")
  async demo(@Res({ passthrough: true }) res: Response) {
    return this.startSession(await this.auth.demo(), res);
  }

  @Post("logout")
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    const { maxAge: _maxAge, ...options } = this.auth.cookieOptions();
    res.clearCookie(SESSION_COOKIE, options);
    return { ok: true };
  }

  private async startSession(session: Session, res: Response) {
    res.cookie(SESSION_COOKIE, await this.auth.sign(session), this.auth.cookieOptions(session));
    return { user: session };
  }
}
