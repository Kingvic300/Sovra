/**
 * Private expense auditor.
 *
 * ─── NOTHING IS KEPT SERVER-SIDE ───────────────────────────────────────────────────────────────
 * This service has no database, no cache, no queue and no file system access. Uploaded files
 * arrive as in-memory buffers (multer memory storage), are parsed into local variables, sent to a
 * TEE-attested model on NEAR AI Cloud, and the result is returned to the caller. The controller
 * wipes the upload buffers in a `finally` block, and nothing here logs file contents, merchants,
 * amounts or model output. When the response is sent, the only trace left is the per-IP request
 * counter the rate limiter keeps in memory (no content, expires within the hour).
 * ───────────────────────────────────────────────────────────────────────────────────────────────
 */
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import Papa from "papaparse";
import { extractText, getDocumentProxy } from "unpdf";
import { z } from "zod";
import { AppError, badRequest, notConfigured } from "../common/errors.js";
import { ENV, type Env } from "../config/env.js";
import { NearCloud, NearCloudError, type Verification } from "../near/near-cloud.js";
import { CATEGORY_IDS, CATEGORY_LABELS, merchantKey, type CategoryId } from "../shared/categories.js";
import { CsvService } from "../transactions/csv.service.js";
import { type AuditRow, detectSignals, type Signal } from "./anomalies.js";

export type AuditUpload = { buffer: Buffer; filename: string; mimetype: string };

/** Statement rows sent to the model. Longer statements keep their newest rows. */
const MAX_ROWS = 400;
/** Characters of receipt or PDF text per file, about 6 pages. */
const MAX_TEXT_CHARS = 18_000;

const SEVERITIES = ["low", "medium", "high"] as const;
const AUDIT_CATEGORIES = CATEGORY_IDS;

const SYSTEM_PROMPT = `You are a private expense auditor. You run inside a trusted execution environment and nothing you see is stored.
You get:
- "rows": transactions already read from bank statements, each with an id like "r12" (amount is signed; negative is money out).
- "documents": the plain text of receipts or statements that aren't tables.
- "signals": suspicious patterns that rule-based checks found, with the row ids they refer to.
Do three things:
1. "extracted": read every purchase or transaction out of "documents" (date as YYYY-MM-DD or null, merchant, amount as a signed number, negative for money spent). For a receipt, give ONE row for the receipt total, not one per item. Never invent rows.
2. "categories": give every distinct merchant in rows and extracted one category id from this list:
${AUDIT_CATEGORIES.map((id) => `   - ${id}: ${CATEGORY_LABELS[id]}`).join("\n")}
3. "flags": list what a careful accountant would question. Confirm or dismiss each signal (dismiss when it is clearly normal, e.g. two coffees on one day), and add anything else unusual: a receipt total that doesn't match its items, tax or tip that looks wrong, a charge with no matching receipt, a merchant that doesn't fit the rest, a subscription nobody seems to use. Refer to rows by id ("r12") and extracted rows by "x" plus their index in your extracted list ("x0").
Write "reason" in one or two plain sentences to the user ("you"), using only numbers from the input.
"summary": two or three sentences on where the money went and what most needs a look. Don't give investment, tax or legal advice.`;

function responseSchema() {
  return {
    type: "object",
    properties: {
      extracted: {
        type: "array",
        items: {
          type: "object",
          properties: {
            document: { type: "integer" },
            date: { type: ["string", "null"] },
            merchant: { type: "string" },
            amount: { type: "number" },
          },
          required: ["document", "date", "merchant", "amount"],
          additionalProperties: false,
        },
      },
      categories: {
        type: "array",
        items: {
          type: "object",
          properties: { merchant: { type: "string" }, category: { type: "string", enum: [...AUDIT_CATEGORIES] } },
          required: ["merchant", "category"],
          additionalProperties: false,
        },
      },
      flags: {
        type: "array",
        items: {
          type: "object",
          properties: {
            refs: { type: "array", items: { type: "string" } },
            severity: { type: "string", enum: [...SEVERITIES] },
            title: { type: "string" },
            reason: { type: "string" },
          },
          required: ["refs", "severity", "title", "reason"],
          additionalProperties: false,
        },
      },
      summary: { type: "string" },
    },
    required: ["extracted", "categories", "flags", "summary"],
    additionalProperties: false,
  };
}

const ModelResult = z.object({
  extracted: z
    .array(
      z.object({
        document: z.number().int(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().catch(null),
        merchant: z.string().trim().min(1).max(160),
        amount: z.number().finite(),
      }),
    )
    .max(500),
  categories: z.array(z.object({ merchant: z.string(), category: z.enum(AUDIT_CATEGORIES).catch("uncategorized") })),
  flags: z
    .array(
      z.object({
        refs: z.array(z.string()).max(50),
        severity: z.enum(SEVERITIES).catch("low"),
        title: z.string().trim().min(1).max(140),
        reason: z.string().trim().max(600),
      }),
    )
    .max(40),
  summary: z.string().trim().max(1200),
});

export type AuditedRow = AuditRow & { category: CategoryId; kind: "statement" | "receipt" };
export type AuditResult = {
  model: string;
  rows: AuditedRow[];
  totals: { category: CategoryId; label: string; spent: number; count: number }[];
  moneyIn: number;
  moneyOut: number;
  flags: { refs: string[]; severity: (typeof SEVERITIES)[number]; title: string; reason: string }[];
  signals: Signal[];
  summary: string;
  files: { name: string; kind: "statement" | "receipt"; rows: number; truncated: boolean }[];
  verification: Verification;
  /** Repeated on every response so clients can show it. */
  retention: "none";
};

type Parsed = { rows: AuditRow[]; documents: { index: number; name: string; text: string }[]; files: AuditResult["files"] };

/** Strips the reasoning block some open models prepend, then reads the first JSON object. */
function readJson(content: string): unknown {
  const text = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("model did not return JSON");
  return JSON.parse(text.slice(start, end + 1));
}

@Injectable()
export class AuditService {
  private readonly near: NearCloud | null;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly csv: CsvService,
  ) {
    this.near = env.NEAR_AI_API_KEY ? new NearCloud(env.NEAR_AI_API_KEY) : null;
  }

  get configured() {
    return this.near !== null;
  }

  get model() {
    return this.env.NEAR_AI_MODEL;
  }

  /** Attestation only, nothing private sent: lets the page show the Verified panel before upload. */
  async attest() {
    if (!this.near) throw notConfigured("Private audit (NEAR_AI_API_KEY)");
    const result = await this.near.attest(this.model);
    return {
      model: this.model,
      nonce: result.nonce,
      attestedAt: result.attestedAt,
      signingAddress: result.signingAddress,
      verified: result.checks.every((c) => c.status !== "fail") && result.signers.length > 0,
      checks: result.checks,
      images: result.images,
    };
  }

  async audit(uploads: AuditUpload[]): Promise<AuditResult> {
    if (!this.near) throw notConfigured("Private audit (NEAR_AI_API_KEY)");
    const parsed = await this.parse(uploads);
    if (!parsed.rows.length && !parsed.documents.length) throw badRequest("Couldn't read any transactions or receipt text from those files.", "nothing_to_audit");

    const signals = detectSignals(parsed.rows);
    const payload = {
      rows: parsed.rows.map(({ id, date, merchant, amount }) => ({ id, date, merchant, amount })),
      documents: parsed.documents.map(({ index, name, text }) => ({ index, name, text })),
      signals: signals.map(({ kind, rowIds, detail }) => ({ kind, rowIds, detail })),
    };

    let completion;
    try {
      completion = await this.near.privateCompletion({
        model: this.model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(payload) },
        ],
        max_tokens: 12_000,
        temperature: 0.1,
        response_format: { type: "json_schema", json_schema: { name: "audit", strict: true, schema: responseSchema() } },
      });
    } catch (err) {
      const verification = (err as { verification?: Verification }).verification;
      const status = err instanceof NearCloudError && err.status === 402 ? HttpStatus.PAYMENT_REQUIRED : HttpStatus.BAD_GATEWAY;
      const code = verification && !verification.checks.every((c) => c.status !== "fail") ? "attestation_failed" : "upstream_failed";
      const raw = err instanceof Error ? err.message : "";
      const message =
        code === "attestation_failed"
          ? raw
          : status === HttpStatus.PAYMENT_REQUIRED
            ? "The TEE verified, but the NEAR AI Cloud account on this server has no credits, so the model didn't run. Add credits at cloud.near.ai."
            : /fetch failed|timeout|abort/i.test(raw)
              ? "Couldn't reach NEAR AI Cloud or a verification service. Try again."
              : "NEAR AI Cloud request failed. Try again.";
      throw new AuditError(status, code, message, verification);
    }

    let result: z.infer<typeof ModelResult>;
    try {
      result = ModelResult.parse(readJson(completion.content));
    } catch {
      throw new AuditError(HttpStatus.BAD_GATEWAY, "bad_model_output", "The model's answer couldn't be read. Try again.", completion.verification);
    }

    // Receipt rows come from the model; statement amounts never do.
    const receiptRows: AuditRow[] = result.extracted
      .filter((x) => parsed.documents.some((d) => d.index === x.document))
      .map((x, i) => ({
        id: `x${i}`,
        date: x.date ?? "",
        merchant: x.merchant,
        merchantKey: merchantKey(x.merchant) || x.merchant.toLowerCase(),
        amount: x.amount,
        source: parsed.documents.find((d) => d.index === x.document)?.name ?? "receipt",
      }));
    for (const f of parsed.files) if (f.kind === "receipt") f.rows = receiptRows.filter((r) => r.source === f.name).length;

    const categoryOf = new Map(result.categories.map((c) => [c.merchant.toLowerCase(), c.category]));
    const rows: AuditedRow[] = [
      ...parsed.rows.map((r) => ({ ...r, kind: "statement" as const })),
      ...receiptRows.map((r) => ({ ...r, kind: "receipt" as const })),
    ].map((r) => ({ ...r, category: categoryOf.get(r.merchant.toLowerCase()) ?? (r.amount > 0 ? "income" : "uncategorized") }));

    const ids = new Set(rows.map((r) => r.id));
    const totals = new Map<CategoryId, { spent: number; count: number }>();
    for (const r of rows) {
      if (r.amount >= 0) continue;
      const t = totals.get(r.category) ?? { spent: 0, count: 0 };
      t.spent += -r.amount;
      t.count++;
      totals.set(r.category, t);
    }

    return {
      model: this.model,
      rows,
      totals: [...totals]
        .map(([category, t]) => ({ category, label: CATEGORY_LABELS[category], spent: Math.round(t.spent * 100) / 100, count: t.count }))
        .sort((a, b) => b.spent - a.spent),
      moneyIn: Math.round(rows.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0) * 100) / 100,
      moneyOut: Math.round(rows.filter((r) => r.amount < 0).reduce((s, r) => s - r.amount, 0) * 100) / 100,
      flags: result.flags.map((f) => ({ ...f, refs: f.refs.filter((id) => ids.has(id)) })),
      signals,
      summary: result.summary,
      files: parsed.files,
      verification: completion.verification,
      retention: "none",
    };
  }

  private async parse(uploads: AuditUpload[]): Promise<Parsed> {
    const rows: AuditRow[] = [];
    const documents: Parsed["documents"] = [];
    const files: Parsed["files"] = [];

    for (const [index, file] of uploads.entries()) {
      const name = file.filename.slice(0, 120) || `file-${index + 1}`;
      const lower = name.toLowerCase();
      const isPdf = lower.endsWith(".pdf") || file.mimetype === "application/pdf";
      const isCsv = lower.endsWith(".csv") || file.mimetype === "text/csv";
      const isText = lower.endsWith(".txt") || lower.endsWith(".md") || file.mimetype.startsWith("text/");

      if (isCsv) {
        const text = file.buffer.toString("utf8");
        const first = Papa.parse<string[]>(text, { preview: 1 }).data[0] ?? [];
        if (this.csv.hasColumns(first.map((h) => h.trim()))) {
          const parsed = this.csv.parse(text, new Map());
          const kept = parsed.rows.slice(-MAX_ROWS);
          kept.forEach((r) =>
            rows.push({ id: `r${rows.length}`, date: r.date, merchant: r.merchant, merchantKey: r.merchantKey, amount: r.amount, source: name }),
          );
          files.push({ name, kind: "statement", rows: kept.length, truncated: parsed.rows.length > kept.length });
          continue;
        }
        // A CSV without date/description/amount columns is read as text, like a receipt.
      }

      let text: string;
      if (isPdf) {
        try {
          const pdf = await getDocumentProxy(new Uint8Array(file.buffer));
          ({ text } = await extractText(pdf, { mergePages: true }));
        } catch {
          throw badRequest(`${name} couldn't be opened. If it has a password, remove it and try again.`, "unreadable_file");
        }
        if (text.replace(/\s+/g, "").length < 20) throw badRequest(`${name} looks like a scan with no text in it.`, "no_text");
      } else if (isText || isCsv) {
        text = file.buffer.toString("utf8");
      } else {
        throw badRequest(`${name}: upload CSV statements, PDF statements, or receipts as PDF or text.`, "unsupported_file");
      }
      documents.push({ index, name, text: text.slice(0, MAX_TEXT_CHARS) });
      files.push({ name, kind: "receipt", rows: 0, truncated: text.length > MAX_TEXT_CHARS });
    }

    if (rows.length > MAX_ROWS) rows.splice(0, rows.length - MAX_ROWS);
    return { rows, documents, files };
  }
}

/** An audit error that still carries the attestation checks that ran, so the page can show them. */
export class AuditError extends AppError {
  constructor(
    status: HttpStatus,
    code: string,
    message: string,
    readonly verification?: Verification,
  ) {
    super(status, code, message);
  }
}
