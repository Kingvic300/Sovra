import { z } from "zod";

const optional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined));

const positiveInt = (fallback: number) => z.coerce.number().int().positive().default(fallback);

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8787),
  FRONTEND_ORIGIN: z.string().url().default("http://localhost:5173"),
  SESSION_SECRET: z.string().min(16, "SESSION_SECRET must be at least 16 characters"),
  DATABASE_URL: optional,
  TATUM_API_KEY: optional,
  MEMWAL_KEY: optional,
  MEMWAL_ACCOUNT_ID: optional,
  MEMWAL_SERVER_URL: z.string().url().default("https://relayer.memory.walrus.xyz"),
  GROQ_API_KEY: optional,
  /** Answers. Production model on Groq's developer plan (console.groq.com/docs/models). */
  GROQ_MODEL: z.string().trim().min(1).default("openai/gpt-oss-120b"),
  /** CSV categorization. Smaller, faster production model. */
  GROQ_FAST_MODEL: z.string().trim().min(1).default("openai/gpt-oss-20b"),
  /**
   * Express "trust proxy": how many proxies sit in front of the API ("1" behind one load balancer),
   * or "false" when clients connect directly. Client IPs, and so per-IP rate limits, depend on it.
   */
  TRUST_PROXY: z
    .string()
    .trim()
    .default("1")
    .transform((v) => (v === "false" ? false : /^\d+$/.test(v) ? Number(v) : v)),
  /** Requests per minute per IP across the whole API. */
  RATE_LIMIT_GLOBAL_PER_MINUTE: positiveInt(300),
  /** Sign-in challenges and verifications per minute per IP. */
  RATE_LIMIT_AUTH_PER_MINUTE: positiveInt(20),
  /** Demo sessions started per hour per IP. */
  RATE_LIMIT_DEMO_PER_HOUR: positiveInt(10),
  /** Ask Sovra questions per hour per user (each one is a paid AI call). */
  RATE_LIMIT_ASK_PER_HOUR: positiveInt(30),
  /** Statement uploads (previews included) per hour per user. Imports may call the AI model. */
  RATE_LIMIT_IMPORT_PER_HOUR: positiveInt(30),
  /** Ask Sovra questions per hour per IP from demo accounts, on top of the per-user limit (each demo is a new user). */
  RATE_LIMIT_DEMO_ASK_PER_HOUR: positiveInt(10),
  /** How long a demo account lives before it and its data are deleted. */
  DEMO_TTL_HOURS: positiveInt(24),
});

export type Env = z.infer<typeof EnvSchema>;

/** Parses process.env once at boot. Exits with a readable message when something required is missing. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
    console.error(`Invalid environment. Fix these in backend/.env:\n${lines.join("\n")}`);
    process.exit(1);
  }
  return parsed.data;
}

export const ENV = Symbol("ENV");
