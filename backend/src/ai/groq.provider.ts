import { HttpStatus, Inject, Injectable, Logger } from "@nestjs/common";
import { z } from "zod";
import { AppError, notConfigured } from "../common/errors.js";
import { ENV, type Env } from "../config/env.js";
import { CATEGORY_IDS, CATEGORY_LABELS, type CategoryId } from "../shared/categories.js";
import type { AiProvider, AnswerInput, CutPlanInput, CutPlanResult, ExtractedTransaction, MerchantToCategorize } from "./ai.provider.js";

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
- Amounts are in the currency named by context.currency (an ISO code such as NGN or USD), unless an item gives its own "currency". Write amounts with that currency's symbol, never assume dollars. suiWalletUsdc is USDC, a US dollar stablecoin.
- When asked what to cut or how to stay under a budget, name specific items from budgetsThisMonth.renewalsStillDue and spendingByMerchantThisMonth, with their amounts, and say which budget each one helps. Never suggest cutting something the user said matters to them. A budget goes over when its projected amount is above its limit.
- totalBalance is what the user has across accounts, in context.currency; accounts lists each one in its own currency. balancesNotCounted names accounts whose balance is unknown, so the total leaves them out.`;

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

const CUTS_PROMPT = `You help someone stay under their monthly budgets in a personal finance app.
You get the categories that will go over this month (targets; "over" is how far over the limit) and candidate cuts taken from their own data:
- "pause": stop counting a renewal still due this month. The saving is fixed. The user still has to cancel or pause it with the merchant.
- "skip": skip some visits to a merchant they go to often. You choose "visits" from 1 to maxSkips; the saving is visits times perVisit.
Choose the fewest, least painful cuts that bring each target to or under its limit. If every candidate together can't close the gap, choose the best ones and say so in the summary.
A target with few or no candidates has mostly been spent already this month. Say that plainly, and name what to cut back on next month from its biggestThisMonth merchants, using their amounts as given. Never answer vaguely ("focus on other areas"): always name a merchant or a renewal.
Respect what the user told Sovra (memories). Never cut something a memory says matters to them, keeps them safe or healthy, or that they decided to keep: list it in "kept" with the reason instead. When a cut or a kept item depends on a memory, copy that memory's text exactly into "memory" (cuts) or mention it in "why" (kept).
Before choosing a cut, decide whether the merchant is a need (supermarkets and groceries, pharmacies and health, rent and bills, fuel or rides to work) or a want (takeaways, restaurants, delivery, cinema, bars, streaming, shopping treats). Cut wants first. Cut a need only when every want in that category together can't close the gap, and say so in "why".
Use ids exactly as given. Set "visits" only for skip cuts, null for pause cuts.
"why": one short sentence to the user ("you"), plain words, using only numbers from the input, amounts in the given currency with its symbol and two decimals when there are cents (e.g. $63.50).
"summary": one or two sentences on what the plan does, linked to a goal when one fits. Don't state totals or end-of-month amounts: Sovra adds those.
You can't pause, cancel or move anything yourself, so never say a cut is done.`;

function cutsSchema(ids: string[]) {
  const id = ids.length ? { type: "string", enum: ids } : { type: "string" };
  return {
    type: "object",
    properties: {
      summary: { type: "string" },
      cuts: {
        type: "array",
        items: {
          type: "object",
          properties: { id, visits: { type: ["integer", "null"] }, why: { type: "string" }, memory: { type: ["string", "null"] } },
          required: ["id", "visits", "why", "memory"],
          additionalProperties: false,
        },
      },
      kept: {
        type: "array",
        items: {
          type: "object",
          properties: { id, why: { type: "string" } },
          required: ["id", "why"],
          additionalProperties: false,
        },
      },
    },
    required: ["summary", "cuts", "kept"],
    additionalProperties: false,
  };
}

const CutsResult = z.object({
  summary: z.string().trim().max(600),
  cuts: z.array(z.object({ id: z.string(), visits: z.number().int().nullable(), why: z.string().max(400), memory: z.string().nullable() })),
  kept: z.array(z.object({ id: z.string(), why: z.string().max(400) })),
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

  async planCuts(input: CutPlanInput): Promise<CutPlanResult> {
    const candidates = input.candidates.map((c) =>
      c.kind === "pause"
        ? { id: c.id, kind: c.kind, category: c.category, merchant: c.merchant, saving: c.saving, nextDate: c.nextDate }
        : {
            id: c.id,
            kind: c.kind,
            category: c.category,
            merchant: c.merchant,
            perVisit: c.perVisit,
            maxSkips: c.maxSkips,
            visitsThisMonth: c.visitsThisMonth,
            spentThisMonth: c.spentThisMonth,
          },
    );
    const user = [
      `Today is ${input.today}. Currency: ${input.currency}.`,
      `Targets (JSON): ${JSON.stringify(input.targets)}`,
      `Candidates (JSON): ${JSON.stringify(candidates)}`,
      `Goals (JSON): ${JSON.stringify(input.goals)}`,
      input.memories.length
        ? `What the user told Sovra:\n${input.memories.map((m) => `- ${m}`).join("\n")}`
        : "What the user told Sovra: nothing relevant found.",
    ].join("\n\n");
    const result = await this.chat({
      model: this.env.GROQ_MODEL,
      messages: [
        { role: "system", content: CUTS_PROMPT },
        { role: "user", content: user },
      ],
      maxTokens: 4096,
      temperature: 0.3,
      reasoningEffort: "medium",
      jsonSchema: { name: "budget_cuts", schema: cutsSchema(input.candidates.map((c) => c.id)) },
    });
    const parsed = CutsResult.safeParse(parseJson(result.content));
    if (!parsed.success) throw upstreamError("Sovra's AI model gave an answer it couldn't use. Try again.");
    const { summary, cuts, kept } = parsed.data;
    return { summary, cuts, kept, model: result.model };
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

    const send = () =>
      fetch(GROQ_CHAT_URL, {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS),
      });
    let res: Response;
    try {
      res = await send();
      // One retry for a dropped connection or a server error: these are usually momentary.
      if (res.status >= 500) res = await send();
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      this.logger.warn(`Groq request failed: ${err instanceof Error ? err.message : String(err)}`);
      if (timedOut) throw upstreamError("The AI model took too long to answer. Try again.");
      try {
        res = await send();
      } catch (retryErr) {
        this.logger.warn(`Groq retry failed: ${retryErr instanceof Error ? retryErr.message : String(retryErr)}`);
        throw upstreamError();
      }
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

/** The model's JSON output, or null when it isn't JSON. */
function parseJson(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function upstreamError(message = "Sovra couldn't reach its AI model. Try again shortly.") {
  return new AppError(HttpStatus.BAD_GATEWAY, "ai_upstream_error", message);
}
