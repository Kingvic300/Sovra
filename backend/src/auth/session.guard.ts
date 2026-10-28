import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { unauthorized } from "../common/errors.js";
import { DemoService } from "./demo.service.js";
import { SESSION_COOKIE, type RequestWithSession, type Session } from "./session.js";

/** Requires a valid session cookie and attaches it to `req.session`. Demo sessions also need a live demo account. */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly demo: DemoService,
  ) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<RequestWithSession>();
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    if (typeof token !== "string" || !token) throw unauthorized();
    let payload: Session & { sub: string };
    try {
      payload = await this.jwt.verifyAsync<Session & { sub: string }>(token);
    } catch {
      throw unauthorized("Your session has expired. Sign in again.");
    }
    if (payload.method === "demo" && !(await this.demo.isActive(payload.sub))) {
      throw unauthorized("This demo has ended. Start a new one to keep exploring.");
    }
    req.session = { address: payload.sub, method: payload.method, name: payload.name, email: payload.email };
    return true;
  }
}
