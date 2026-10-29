import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { eq } from "drizzle-orm";
import { unauthorized } from "../common/errors.js";
import { DatabaseService } from "../database/database.service.js";
import { users } from "../database/schema.js";
import { SESSION_COOKIE, type RequestWithSession, type Session } from "./session.js";

/**
 * Requires a valid session cookie and attaches it to `req.session`. With a database, the account
 * must also still exist (and a demo must not have expired), so a cookie from before an account
 * was deleted is refused before any route could write to it and re-create the account.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly database: DatabaseService,
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
    if (this.database.available) {
      const [user] = await this.database.db
        .select({ method: users.method, expiresAt: users.expiresAt })
        .from(users)
        .where(eq(users.address, payload.sub));
      const demoEnded = "This demo has ended. Start a new one to keep exploring.";
      if (!user) throw unauthorized(payload.method === "demo" ? demoEnded : "This account no longer exists. Sign in again.");
      if (user.method === "demo" && !(user.expiresAt && user.expiresAt > new Date())) throw unauthorized(demoEnded);
    }
    req.session = { address: payload.sub, method: payload.method, name: payload.name, email: payload.email };
    return true;
  }
}
