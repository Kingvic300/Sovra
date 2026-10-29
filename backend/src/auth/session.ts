import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

export const SESSION_COOKIE = "sovra_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export type Session = {
  address: string;
  /** "google" is a signed-in Sui wallet (named for the earlier zkLogin sign-in). */
  method: "google" | "demo" | "email";
  name?: string;
  email?: string;
};

export type RequestWithSession = Request & { session?: Session };

/** Injects the signed-in session. Only use on routes behind SessionGuard. */
export const CurrentSession = createParamDecorator((_: unknown, ctx: ExecutionContext): Session => {
  const req = ctx.switchToHttp().getRequest<RequestWithSession>();
  return req.session!;
});
