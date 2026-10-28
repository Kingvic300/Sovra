import type { AddressInfo } from "node:net";
import { Logger, type INestApplication } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { AI_PROVIDER, type AiProvider, type AnswerInput, type MerchantToCategorize } from "../ai/ai.provider.js";
import { AppModule } from "../app.module.js";
import { configureApp } from "../app.setup.js";
import { SESSION_COOKIE } from "../auth/session.js";
import { ENV, loadEnv } from "../config/env.js";
import { DatabaseService } from "../database/database.service.js";
import { MemwalService } from "../memory/memwal.service.js";
import { upstreamFailed } from "../common/errors.js";
import type { CategoryId } from "../shared/categories.js";
import { TatumService } from "../wallet/tatum.service.js";
import type { TestDatabase } from "./test-database.js";

export const TEST_SESSION_SECRET = "test-session-secret-not-for-production";

/** Rate limits high enough that ordinary tests never hit them. Rate-limit tests lower them through `env`. */
const GENEROUS_RATE_LIMITS = {
  RATE_LIMIT_GLOBAL_PER_MINUTE: "100000",
  RATE_LIMIT_AUTH_PER_MINUTE: "100000",
  RATE_LIMIT_DEMO_PER_HOUR: "100000",
  RATE_LIMIT_ASK_PER_HOUR: "100000",
  RATE_LIMIT_IMPORT_PER_HOUR: "100000",
  RATE_LIMIT_DEMO_ASK_PER_HOUR: "100000",
};

/** Stands in for Groq. Records every call so tests can check what the model would have seen. */
export class FakeAi implements AiProvider {
  readonly answers: AnswerInput[] = [];
  readonly categorized: MerchantToCategorize[][] = [];
  /** When set, `answer` throws it, like a Groq outage or rate limit. */
  failure: Error | undefined;

  constructor(
    readonly configured = true,
    private readonly categories: Record<string, CategoryId> = {},
  ) {}

  async categorize(merchants: MerchantToCategorize[]) {
    this.categorized.push(merchants);
    return new Map(
      merchants.filter((m) => this.categories[m.merchantKey]).map((m) => [m.merchantKey, this.categories[m.merchantKey]]),
    );
  }

  async answer(input: AnswerInput) {
    this.answers.push(input);
    if (this.failure) throw this.failure;
    return { text: `Answer to: ${input.question}`, model: "fake-model" };
  }
}

/** Stands in for the Walrus Memory relayer: stores memories per namespace and recalls by substring. */
export class FakeMemWal {
  readonly stored: { namespace: string; text: string; blobId: string }[] = [];
  /** Every call that reached the relayer, for asserting that some flows never touch Walrus. */
  calls = 0;
  private jobs = 0;

  async remember(text: string, namespace: string) {
    this.calls++;
    const jobId = `job-${++this.jobs}`;
    this.stored.push({ namespace, text, blobId: `blob-${jobId}` });
    return { job_id: jobId };
  }

  async waitForRememberJob(jobId: string) {
    return { blob_id: `blob-${jobId}` };
  }

  async recall({ query, limit, namespace }: { query: string; limit: number; namespace: string }) {
    this.calls++;
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const results = this.stored
      .filter((m) => m.namespace === namespace && words.some((w) => m.text.toLowerCase().includes(w)))
      .slice(0, limit)
      .map((m) => ({ blob_id: m.blobId, text: m.text, distance: 0.1, created_at: undefined }));
    return { results };
  }

  destroy() {}
}

/** Stands in for Tatum. Balances are set per address; `failing` makes every read fail like an outage. */
export class FakeTatum {
  readonly configured = true;
  readonly verificationClient = undefined;
  readonly balances = new Map<string, string>();
  failing = false;
  calls = 0;

  async getUsdcBalance(address: string) {
    this.calls++;
    if (this.failing) throw upstreamFailed("Tatum", "fake outage");
    const usdc = this.balances.get(address) ?? "0";
    return { raw: String(Math.round(Number(usdc) * 1e6)), usdc };
  }

  async getRecentUsdcTransfers() {
    this.calls++;
    return [];
  }
}

export type TestApp = {
  app: INestApplication;
  baseUrl: string;
  /** `headers` are sent with every request, e.g. X-Forwarded-For to act as a different client IP. */
  client: (headers?: Record<string, string>) => TestClient;
  close: () => Promise<void>;
};

/**
 * Boots the real AppModule on a random port with the same HTTP setup as main.ts.
 * External services are off unless a fake is passed, so tests never call Groq, Walrus or Tatum.
 */
export async function createTestApp(
  options: { database?: TestDatabase; ai?: AiProvider; memwal?: FakeMemWal; tatum?: FakeTatum; env?: Record<string, string> } = {},
): Promise<TestApp> {
  // Set TEST_LOGS=1 to see server-side errors while debugging a test.
  const logger = process.env.TEST_LOGS ? (["error", "warn"] as const) : false;
  Logger.overrideLogger(logger ? [...logger] : false);
  const env = loadEnv({ NODE_ENV: "test", SESSION_SECRET: TEST_SESSION_SECRET, ...GENEROUS_RATE_LIMITS, ...options.env });

  let builder = Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ENV).useValue(env);
  if (options.database) builder = builder.overrideProvider(DatabaseService).useValue(options.database.service);
  if (options.ai) builder = builder.overrideProvider(AI_PROVIDER).useValue(options.ai);
  if (options.tatum) builder = builder.overrideProvider(TatumService).useValue(options.tatum);
  const moduleRef = await builder.compile();

  if (options.memwal) {
    // MemwalService builds its client from env; swap in the fake before any request.
    (moduleRef.get(MemwalService) as unknown as { client: unknown }).client = options.memwal;
  }

  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: logger ? [...logger] : false });
  configureApp(app, env);
  await app.listen(0, "127.0.0.1");
  const { port } = app.getHttpServer().address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    app,
    baseUrl,
    client: (headers) => new TestClient(baseUrl, headers),
    close: () => app.close(),
  };
}

export type TestResponse<T = any> = { status: number; body: T; headers: Headers };

/** Minimal HTTP client that keeps the session cookie like a browser would. */
export class TestClient {
  cookie: string | undefined;

  constructor(
    private readonly baseUrl: string,
    private readonly defaultHeaders: Record<string, string> = {},
  ) {}

  async request<T = any>(
    method: string,
    path: string,
    options: { json?: unknown; form?: FormData; headers?: Record<string, string> } = {},
  ): Promise<TestResponse<T>> {
    const headers: Record<string, string> = { ...this.defaultHeaders, ...options.headers };
    if (this.cookie) headers.cookie = this.cookie;
    let body: string | FormData | undefined;
    if (options.json !== undefined) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(options.json);
    } else if (options.form) body = options.form;

    const res = await fetch(`${this.baseUrl}/api${path}`, { method, headers, body });
    for (const setCookie of res.headers.getSetCookie()) {
      const pair = setCookie.split(";")[0];
      const [name, value] = pair.split("=");
      if (name === SESSION_COOKIE) this.cookie = value ? pair : undefined;
    }
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Not JSON; keep the raw text.
    }
    return { status: res.status, body: parsed as T, headers: res.headers };
  }

  get<T = any>(path: string) {
    return this.request<T>("GET", path);
  }
  post<T = any>(path: string, json?: unknown) {
    return this.request<T>("POST", path, { json });
  }
  put<T = any>(path: string, json?: unknown) {
    return this.request<T>("PUT", path, { json });
  }
  patch<T = any>(path: string, json?: unknown) {
    return this.request<T>("PATCH", path, { json });
  }
  delete<T = any>(path: string) {
    return this.request<T>("DELETE", path);
  }
}

/**
 * Signs in through the real nonce + signature flow. Ed25519 signatures verify offline,
 * so this exercises the same code path as zkLogin without calling Sui.
 */
export async function signIn(client: TestClient, keypair = Ed25519Keypair.generate(), profile: { name?: string; email?: string } = {}) {
  const address = keypair.toSuiAddress();
  const challenge = await client.post<{ message: string }>("/auth/nonce", { address });
  const { signature } = await keypair.signPersonalMessage(new TextEncoder().encode(challenge.body.message));
  const res = await client.post("/auth/verify", { address, message: challenge.body.message, signature, ...profile });
  if (res.status !== 200) throw new Error(`Sign-in failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { address, keypair };
}

/** Lets background work (e.g. Walrus upload completion) finish before assertions or teardown. */
export async function flushBackgroundWork() {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve));
}

/** Builds a multipart body for the CSV import route. */
export function csvForm(content: string, filename = "statement.csv", fields: Record<string, string> = {}) {
  const form = new FormData();
  form.append("file", new Blob([content], { type: "text/csv" }), filename);
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  return form;
}
