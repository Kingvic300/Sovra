import { type CanActivate, type ExecutionContext, HttpStatus, Inject, Injectable, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import type { Request, Response } from "express";
import { SESSION_COOKIE, type Session } from "../auth/session.js";
import { AppError } from "../common/errors.js";
import { ENV, type Env } from "../config/env.js";

export type RateLimitPolicy = "auth" | "demo" | "ask" | "import" | "walletSync";

type Rule = { limit: number; windowMs: number; by: "ip" | "user" };
type RuleName = RateLimitPolicy | "global" | "demoAsk";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const RATE_LIMIT_KEY = "sovra:rateLimit";

/** Adds a stricter limit to a route, on top of the global per-IP limit. */
export const RateLimit = (policy: RateLimitPolicy) => SetMetadata(RATE_LIMIT_KEY, policy);

export function rateLimitRules(env: Env): Record<RuleName, Rule> {
  return {
    global: { limit: env.RATE_LIMIT_GLOBAL_PER_MINUTE, windowMs: MINUTE, by: "ip" },
    auth: { limit: env.RATE_LIMIT_AUTH_PER_MINUTE, windowMs: MINUTE, by: "ip" },
    demo: { limit: env.RATE_LIMIT_DEMO_PER_HOUR, windowMs: HOUR, by: "ip" },
    ask: { limit: env.RATE_LIMIT_ASK_PER_HOUR, windowMs: HOUR, by: "user" },
    import: { limit: env.RATE_LIMIT_IMPORT_PER_HOUR, windowMs: HOUR, by: "user" },
    walletSync: { limit: env.RATE_LIMIT_WALLET_SYNC_PER_HOUR, windowMs: HOUR, by: "user" },
    // Every demo visitor is a new user, so per-user limits alone don't cap AI spend from demos.
    demoAsk: { limit: env.RATE_LIMIT_DEMO_ASK_PER_HOUR, windowMs: HOUR, by: "ip" },
  };
}

/**
 * Fixed-window counters in process memory. Each instance counts on its own, so with N instances
 * a client can reach up to N times a limit; a shared store is needed before scaling out.
 */
export class RateLimitStore {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();
  private nextSweep = 0;

  hit(key: string, limit: number, windowMs: number, now = Date.now()) {
    if (now >= this.nextSweep) this.sweep(now);
    let window = this.windows.get(key);
    if (!window || window.resetAt <= now) {
      window = { count: 0, resetAt: now + windowMs };
      this.windows.set(key, window);
    }
    window.count++;
    return { allowed: window.count <= limit, retryAfterSeconds: Math.max(1, Math.ceil((window.resetAt - now) / 1000)) };
  }

  get size() {
    return this.windows.size;
  }

  /** Drops expired windows at most once a minute, so memory stays bounded without scanning on every request. */
  private sweep(now: number) {
    for (const [key, window] of this.windows) if (window.resetAt <= now) this.windows.delete(key);
    this.nextSweep = now + MINUTE;
  }
}

/**
 * Global guard: every request counts against its IP's global limit, and routes marked with
 * @RateLimit also count against their policy. User-keyed policies use the session's address
 * (read from the signed cookie, as guards on the route haven't run yet) and fall back to the IP.
 * Demo sessions asking questions also count against a per-IP demo limit.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly store = new RateLimitStore();
  private readonly rules: ReturnType<typeof rateLimitRules>;

  constructor(
    @Inject(ENV) env: Env,
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {
    this.rules = rateLimitRules(env);
  }

  async canActivate(ctx: ExecutionContext) {
    if (ctx.getType() !== "http") return true;
    const req = ctx.switchToHttp().getRequest<Request>();
    const res = ctx.switchToHttp().getResponse<Response>();
    const ip = `ip:${req.ip ?? "unknown"}`;

    this.consume("global", ip, res);
    const policy = this.reflector.getAllAndOverride<RateLimitPolicy | undefined>(RATE_LIMIT_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (policy) {
      const session = this.rules[policy].by === "user" ? await this.session(req) : undefined;
      this.consume(policy, session ? `user:${session.sub}` : ip, res);
      if (policy === "ask" && session?.method === "demo") this.consume("demoAsk", ip, res);
    }
    return true;
  }

  private consume(policy: RuleName, subject: string, res: Response) {
    const rule = this.rules[policy];
    const { allowed, retryAfterSeconds } = this.store.hit(`${policy}|${subject}`, rule.limit, rule.windowMs);
    if (allowed) return;
    res.setHeader("Retry-After", String(retryAfterSeconds));
    throw new AppError(
      HttpStatus.TOO_MANY_REQUESTS,
      "rate_limited",
      `Too many requests. Try again in ${retryAfterSeconds} second${retryAfterSeconds === 1 ? "" : "s"}.`,
    );
  }

  private async session(req: Request) {
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    if (typeof token !== "string" || !token) return undefined;
    try {
      return await this.jwt.verifyAsync<Session & { sub: string }>(token);
    } catch {
      return undefined;
    }
  }
}
