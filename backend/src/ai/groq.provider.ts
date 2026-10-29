import { HttpStatus, Inject, Injectable, Logger } from "@nestjs/common";
import { z } from "zod";
import { AppError, notConfigured } from "../common/errors.js";
import { ENV, type Env } from "../config/env.js";
import { CATEGORY_IDS, CATEGORY_LABELS, type CategoryId } from "../shared/categories.js";
import type { AiProvider, AnswerInput, ExtractedTransaction, MerchantToCategorize } from "./ai.provider.js";

const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";
const TIMEOUT_MS = 30_000;
/** Reading a whole statement takes longer than an answer. */
const EXTRACT_TIMEOUT_MS = 90_000;
/** About 15 pages of statement text; longer PDFs are cut here. */
const EXTRACT_MAX_CHARS = 48_000;
const CATEGORIZE_BATCH = 60;
/** Larger statements fall back to keyword rules for the remainder. */
const CATEGORIZE_MAX_MERCHANTS = 300;

type Message = { role: "system" | "user"; content: string };

type ChatOptions = {
  model: string;
  messages: Message[];
  maxTokens: number;
  temperature: number;
  reasoningEffort: "low" | "medium" | "high";
  jsonSchema?: { name: string; schema: Record<string, unknown> };
  timeoutMs?: number;
};

const ChatResponse = z.object({
  model: z.string().optional(),
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable().optional() }) })).min(1),
});

const SYSTEM_PROMPT = `You are Sovra, a read-only personal finance assistant.
- Answer in plain, short language: two to five sentences, no headings, no tables.
- Use only the numbers in the provided context and memories. Do not invent balances, dates or amounts.
- If the data needed to answer is missing, say what's missing and what the user could add.
- Use what the user told Sovra (memories) to personalise the answer, and mention it when it matters.
- Never give investment, tax or legal advice. For those, suggest a qualified professional.
- You cannot move, send, pause or cancel anything. Never claim you did; tell the user what they could do.
- Amounts are in the currency named by context.currency (an ISO code such as NGN or USD), unless an item gives its own "currency". Write amounts with that currency's symbol, never assume dollars. suiWalletUsdc is USDC, a US dollar stablecoin.`;

const CATEGORIZE_PROMPT = `You sort bank statement merchants into spending categories for a personal finance app.
Return one category for every merchantKey you are given, using only these ids:
${CATEGORY_IDS.map((id) => `- ${id}: ${CATEGORY_LABELS[id]}`).join("\n")}
Notes: "transfer" is money sent to a person (rent share, family). "income" is money coming in (pay, payouts, refunds).
Use "uncategorized" when you genuinely can't tell.`;

const categorizeSchema = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          merchantKey: { type: "string" },
          category: { type: "string", enum: [...CATEGORY_IDS] },
        },
        required: ["merchantKey", "category"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

const CategorizeResult = z.object({
  items: z.array(z.object({ merchantKey: z.string(), category: z.enum(CATEGORY_IDS) })),
});

const EXTRACT_PROMPT = `You read bank statements that were converted from PDF to plain text.
List every transaction in the text, in the order it appears. For each one give:
- date as YYYY-MM-DD (use the statement's year when a row shows only day and month),
- description: the merchant or payee text, without reference numbers where you can tell,
- amount as a signed number: negative for money out (debits, withdrawals, card payments), positive for money in,
- balance: the running balance printed after that row, or null when the statement doesn't show one.
Skip opening and closing balance lines, totals, interest summaries and page headers. Never invent rows.`;

const extractSchema = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          date: { type: "string" },
          description: { type: "string" },
          amount: { type: "number" },
          balance: { type: ["number", "null"] },
        },
        required: ["date", "description", "amount", "balance"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

const ExtractResult = z.object({
  items: z.array(
    z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      description: z.string().trim().min(1).max(200),
      amount: z.number().finite(),
      balance: z.number().finite().nullable(),
    }),
  ),
});

/** Groq chat completions (OpenAI-compatible). GPT-OSS models: reasoning stays out of the response. */
@Injectable()
export class GroqAiProvider implements AiProvider {
  private readonly logger = new Logger(GroqAiProvider.name);

  constructor(@Inject(ENV) private readonly env: Env) {}

  get configured() {
    return Boolean(this.env.GROQ_API_KEY);
  }

  async answer(input: AnswerInput) {
    const user = [
      `Today is ${new Date().toISOString().slice(0, 10)}.`,
      `Context (JSON): ${JSON.stringify(input.context)}`,
      input.memories.length
        ? `What the user told Sovra:\n${input.memories.map((m) => `- ${m.kind ? `[${m.kind}] ` : ""}${m.text}`).join("\n")}`
        : "What the user told Sovra: nothing relevant found.",
      input.missing.length ? `Data not available right now: ${input.missing.join(", ")}.` : "",
      `Question: ${input.question}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    const result = await this.chat({
      model: this.env.GROQ_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: user },
      ],
      maxTokens: 2048,
      temperature: 0.5,
      reasoningEffort: "medium",
    });
    const text = result.content.trim();
    if (!text) throw upstreamError("The AI model returned an empty answer.");
    return { text, model: result.model };
  }

  async categorize(merchants: MerchantToCategorize[]) {
    const out = new Map<string, CategoryId>();
    const todo = merchants.slice(0, CATEGORIZE_MAX_MERCHANTS);

    for (let i = 0; i < todo.length; i += CATEGORIZE_BATCH) {
      const batch = todo.slice(i, i + CATEGORIZE_BATCH);
      const wanted = new Set(batch.map((m) => m.merchantKey));
      try {
        const result = await this.chat({
          model: this.env.GROQ_FAST_MODEL,
          messages: [
            { role: "system", content: CATEGORIZE_PROMPT },
            {
              role: "user",
              content: JSON.stringify(
                batch.map((m) => ({ merchantKey: m.merchantKey, example: m.example.slice(0, 80), amount: m.amount })),
              ),
            },
          ],
          maxTokens: 4096,
          temperature: 0.2,
          reasoningEffort: "low",
          jsonSchema: { name: "merchant_categories", schema: categorizeSchema },
        });
        const parsed = CategorizeResult.safeParse(JSON.parse(result.content));
        if (!parsed.success) throw new Error("categorization JSON did not match the schema");
        for (const item of parsed.data.items) if (wanted.has(item.merchantKey)) out.set(item.merchantKey, item.category);
      } catch (err) {
        // Categorization is best effort: the caller keeps keyword guesses for anything missing.
        this.logger.warn(`Categorization batch failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return out;
  }

  async extractTransactions(statementText: string): Promise<ExtractedTransaction[]> {
    const result = await this.chat({
      model: this.env.GROQ_MODEL,
      messages: [
        { role: "system", content: EXTRACT_PROMPT },
        { role: "user", content: statementText.slice(0, EXTRACT_MAX_CHARS) },
      ],
      maxTokens: 16_384,
      temperature: 0,
      reasoningEffort: "low",
      jsonSchema: { name: "statement_transactions", schema: extractSchema },
      timeoutMs: EXTRACT_TIMEOUT_MS,
    });
    const parsed = ExtractResult.safeParse(JSON.parse(result.content || "null"));
    if (!parsed.success) throw upstreamError("Sovra couldn't read the transactions in that PDF. Try a CSV or Excel export.");
    return parsed.data.items.filter((t) => t.amount !== 0);
  }

  private async chat(options: ChatOptions): Promise<{ content: string; model: string }> {
    const key = this.env.GROQ_API_KEY;
    if (!key) throw notConfigured("Groq (GROQ_API_KEY)");

    const body: Record<string, unknown> = {
      model: options.model,
      messages: options.messages,
      max_completion_tokens: options.maxTokens,
      temperature: options.temperature,
      reasoning_effort: options.reasoningEffort,
      include_reasoning: false,
    };
    if (options.jsonSchema) {
      body.response_format = {
        type: "json_schema",
        json_schema: { name: options.jsonSchema.name, strict: true, schema: options.jsonSchema.schema },
      };
    }

    let res: Response;
    try {
      res = await fetch(GROQ_CHAT_URL, {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS),
      });
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      this.logger.warn(`Groq request failed: ${err instanceof Error ? err.message : String(err)}`);
      throw upstreamError(timedOut ? "The AI model took too long to answer. Try again." : undefined);
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      this.logger.warn(`Groq ${res.status} for ${options.model}: ${detail.slice(0, 300)}`);
      if (res.status === 429 || res.status === 498) {
        throw new AppError(HttpStatus.TOO_MANY_REQUESTS, "rate_limited", "Sovra is busy right now. Try again in a minute.");
      }
      throw upstreamError();
    }

    const parsed = ChatResponse.safeParse(await res.json().catch(() => null));
    if (!parsed.success) throw upstreamError();
    return { content: parsed.data.choices[0].message.content ?? "", model: parsed.data.model ?? options.model };
  }
}

function upstreamError(message = "Sovra couldn't reach its AI model. Try again shortly.") {
  return new AppError(HttpStatus.BAD_GATEWAY, "ai_upstream_error", message);
}
