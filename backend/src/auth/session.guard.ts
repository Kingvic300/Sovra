import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { unauthorized } from "../common/errors.js";
import { SESSION_COOKIE, type RequestWithSession, type Session } from "./session.js";

/** Requires a valid session cookie and attaches it to `req.session`. */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<RequestWithSession>();
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    if (typeof token !== "string" || !token) throw unauthorized();
    try {
      const payload = await this.jwt.verifyAsync<Session & { sub: string }>(token);
      req.session = { address: payload.sub, method: payload.method, name: payload.name, email: payload.email };
      return true;
    } catch {
      throw unauthorized("Your session has expired. Sign in again.");
    }
  }
}
