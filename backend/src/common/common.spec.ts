import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { HttpException, HttpStatus, Logger, type ArgumentsHost } from "@nestjs/common";
import { z } from "zod";
import { loadEnv } from "../config/env.js";
import { monthRange } from "../transactions/transactions.service.js";
import { AllExceptionsFilter } from "./all-exceptions.filter.js";
import { AppError, badRequest, notConfigured, notFound, unauthorized, upstreamFailed } from "./errors.js";
import { ZodPipe } from "./zod.pipe.js";

/** Runs the exception filter and captures what it would send. */
function filter(exception: unknown) {
  const sent: { status?: number; body?: unknown } = {};
  const res = {
    status(code: number) {
      sent.status = code;
      return this;
    },
    json(body: unknown) {
      sent.body = body;
    },
  };
  const host = { switchToHttp: () => ({ getResponse: () => res }) } as unknown as ArgumentsHost;
  new AllExceptionsFilter().catch(exception, host);
  return sent;
}

describe("error helpers", () => {
  it("carry stable codes and statuses", () => {
    const cases: [AppError, number, string][] = [
      [notConfigured("Groq"), 503, "not_configured"],
      [notFound("Goal"), 404, "not_found"],
      [badRequest("nope"), 400, "bad_request"],
      [badRequest("nope", "invalid_address"), 400, "invalid_address"],
      [unauthorized(), 401, "unauthorized"],
      [upstreamFailed("Tatum", "timeout"), 502, "upstream_failed"],
    ];
    for (const [err, status, code] of cases) {
      assert.equal(err.getStatus(), status);
      assert.equal(err.code, code);
    }
    assert.equal(upstreamFailed("Tatum", "timeout").message, "Tatum request failed: timeout");
  });
});

describe("AllExceptionsFilter", () => {
  it("passes AppError code and message through", () => {
    assert.deepEqual(filter(notFound("Goal")), { status: 404, body: { error: { code: "not_found", message: "Goal not found." } } });
  });

  it("maps plain HttpExceptions to a code from the status", () => {
    assert.deepEqual(filter(new HttpException("Slow down", HttpStatus.TOO_MANY_REQUESTS)), {
      status: 429,
      body: { error: { code: "rate_limited", message: "Slow down" } },
    });
  });

  it("joins validation message arrays", () => {
    const sent = filter(new HttpException({ message: ["a is bad", "b is bad"] }, 400));
    assert.deepEqual(sent.body, { error: { code: "bad_request", message: "a is bad; b is bad" } });
  });

  it("hides unexpected errors behind a generic 500", () => {
    Logger.overrideLogger(false);
    const sent = filter(new Error("database password is hunter2"));
    assert.equal(sent.status, 500);
    assert.deepEqual(sent.body, { error: { code: "internal_error", message: "Something went wrong on our side." } });
  });
});

describe("ZodPipe", () => {
  const pipe = new ZodPipe(z.object({ limit: z.number().positive(), name: z.string().default("x") }));

  it("returns parsed data with defaults", () => {
    assert.deepEqual(pipe.transform({ limit: 5 }), { limit: 5, name: "x" });
  });

  it("throws 400 invalid_request naming the bad field", () => {
    assert.throws(
      () => pipe.transform({ limit: -1 }),
      (err: unknown) => err instanceof AppError && err.code === "invalid_request" && /^limit: /.test(err.message),
    );
  });
});

describe("loadEnv", () => {
  it("applies defaults and treats blank optional keys as unset", () => {
    const env = loadEnv({ SESSION_SECRET: "x".repeat(16), DATABASE_URL: "  ", GROQ_API_KEY: "" });
    assert.equal(env.PORT, 8787);
    assert.equal(env.NODE_ENV, "development");
    assert.equal(env.FRONTEND_ORIGIN, "http://localhost:5173");
    assert.equal(env.DATABASE_URL, undefined);
    assert.equal(env.GROQ_API_KEY, undefined);
    assert.equal(env.GROQ_MODEL, "openai/gpt-oss-120b");
  });

  it("exits with a readable message when SESSION_SECRET is too short", () => {
    const exit = mock.method(process, "exit", () => {
      throw new Error("exit called");
    });
    const error = mock.method(console, "error", () => {});
    try {
      assert.throws(() => loadEnv({ SESSION_SECRET: "short" }), /exit called/);
      assert.equal(exit.mock.calls[0].arguments[0], 1);
      assert.match(String(error.mock.calls[0].arguments[0]), /SESSION_SECRET/);
    } finally {
      exit.mock.restore();
      error.mock.restore();
    }
  });
});

describe("monthRange", () => {
  it("covers the month as a half-open range", () => {
    assert.deepEqual(monthRange("2026-10"), { from: "2026-10-01", to: "2026-11-01" });
  });

  it("rolls December into the next year", () => {
    assert.deepEqual(monthRange("2026-12"), { from: "2026-12-01", to: "2027-01-01" });
  });
});
