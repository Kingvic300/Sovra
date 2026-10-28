import type { NextFunction, Request, Response } from "express";
import type { Env } from "../config/env.js";

/**
 * Headers for a JSON-only API. Set before routing, so errors, 404s and CORS preflights get them too.
 * The CSP blocks everything because the API never serves HTML or scripts.
 */
export function securityHeaders(env: Env) {
  const production = env.NODE_ENV === "production";
  return (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
    // Responses carry personal financial data: never store them in shared or browser caches.
    res.setHeader("Cache-Control", "no-store");
    if (production) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    next();
  };
}
