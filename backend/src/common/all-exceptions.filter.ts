import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { Response } from "express";

const STATUS_CODES: Partial<Record<number, string>> = {
  400: "bad_request",
  401: "unauthorized",
  403: "forbidden",
  404: "not_found",
  405: "method_not_allowed",
  409: "conflict",
  413: "payload_too_large",
  429: "rate_limited",
};

/** Every error leaves the API as { error: { code, message } }. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("Http");

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      let code = STATUS_CODES[status] ?? "error";
      let message = exception.message;
      if (typeof body === "object" && body !== null) {
        const b = body as { code?: unknown; message?: unknown };
        if (typeof b.code === "string") code = b.code;
        if (typeof b.message === "string") message = b.message;
        else if (Array.isArray(b.message)) message = b.message.join("; ");
      }
      res.status(status).json({ error: { code, message } });
      return;
    }

    this.logger.error(exception instanceof Error ? (exception.stack ?? exception.message) : String(exception));
    res
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ error: { code: "internal_error", message: "Something went wrong on our side." } });
  }
}
