import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

export const SESSION_COOKIE = "sovra_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

/** Fixed address for the demo account, shared with the frontend demo data. */
export const DEMO_ADDRESS = "0x7b3e9c41d2a85f60e1c4b9a7d03f5e28c6a1b94d7e2f05c8a3961d4b7e0c2f9a";

export type Session = {
  address: string;
  method: "google" | "demo";
  name?: string;
  email?: string;
};

export type RequestWithSession = Request & { session?: Session };

/** Injects the signed-in session. Only use on routes behind SessionGuard. */
export const CurrentSession = createParamDecorator((_: unknown, ctx: ExecutionContext): Session => {
  const req = ctx.switchToHttp().getRequest<RequestWithSession>();
  return req.session!;
});
