import { z } from "zod";

const optional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined));

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
