import { HttpException, HttpStatus } from "@nestjs/common";

/** Error with a stable machine-readable code. The exception filter turns it into {error:{code,message}}. */
export class AppError extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: string,
    message: string,
  ) {
    super({ code, message }, status);
  }
}

export const notConfigured = (service: string) =>
  new AppError(HttpStatus.SERVICE_UNAVAILABLE, "not_configured", `${service} is not configured on this server.`);

export const notFound = (what: string) => new AppError(HttpStatus.NOT_FOUND, "not_found", `${what} not found.`);

export const badRequest = (message: string, code = "bad_request") =>
  new AppError(HttpStatus.BAD_REQUEST, code, message);

export const unauthorized = (message = "Sign in to continue.") =>
  new AppError(HttpStatus.UNAUTHORIZED, "unauthorized", message);

export const conflict = (message: string, code = "conflict") => new AppError(HttpStatus.CONFLICT, code, message);

export const upstreamFailed = (service: string, detail?: string) =>
  new AppError(
    HttpStatus.BAD_GATEWAY,
    "upstream_failed",
    `${service} request failed${detail ? `: ${detail}` : "."}`,
  );
