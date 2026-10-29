import { createHash } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import ExcelJS from "exceljs";
import Papa from "papaparse";
import { extractText, getDocumentProxy } from "unpdf";
import { AI_PROVIDER, type AiProvider } from "../ai/ai.provider.js";
import { badRequest } from "../common/errors.js";

export type StatementFile = { buffer: Buffer; filename: string; mimetype: string };
export type StatementFormat = "csv" | "xlsx" | "pdf";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
/** PDF text shorter than this is almost certainly a scan with no text layer. */
const MIN_PDF_TEXT = 40;
/** A preview and the import that follows send the same PDF; keep its rows so the AI reads it once. */
const PDF_CACHE_MS = 15 * 60 * 1000;
const PDF_CACHE_MAX = 50;

export function statementFormat(file: Pick<StatementFile, "filename" | "mimetype">): StatementFormat | null {
  const name = file.filename.toLowerCase();
  if (name.endsWith(".csv") || /^text\/(csv|plain)/.test(file.mimetype)) return "csv";
  if (name.endsWith(".xlsx") || file.mimetype === XLSX_MIME) return "xlsx";
  if (name.endsWith(".pdf") || file.mimetype === "application/pdf") return "pdf";
  return null;
}

/** Excel dates arrive as Date objects at UTC midnight; anything else is written as it reads. */
function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
    if ("richText" in value) return value.richText.map((r) => r.text).join("");
    if ("text" in value) return String(value.text);
    if ("error" in value) return "";
  }
  return String(value);
}

/**
 * Turns any supported statement into the CSV text CsvService parses: CSV as is, the first sheet
 * of an Excel workbook, or the transactions an AI model reads out of a PDF's text.
 */
@Injectable()
export class StatementReaderService {
  private readonly logger = new Logger(StatementReaderService.name);
  private readonly pdfCache = new Map<string, { csv: string; at: number }>();

  constructor(@Inject(AI_PROVIDER) private readonly ai: AiProvider) {}

  async toCsv(file: StatementFile, options: { allowAi: boolean }): Promise<string> {
    const format = statementFormat(file);
    if (format === "csv") return file.buffer.toString("utf8");
    if (format === "xlsx") return this.excelToCsv(file.buffer);
    if (format === "pdf") return this.pdfToCsv(file.buffer, options.allowAi);
    throw badRequest("Upload a CSV, Excel (.xlsx) or PDF statement.", "unsupported_file");
  }

  private async excelToCsv(buffer: Buffer) {
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    } catch {
      throw badRequest("That Excel file couldn't be opened. Save it as .xlsx and try again.", "unreadable_file");
    }
    // Banks often put a title or account details above the table, so start at the row that names a date column.
    for (const sheet of workbook.worksheets) {
      const rows: string[][] = [];
      sheet.eachRow({ includeEmpty: false }, (row) => {
        const values = Array.isArray(row.values) ? row.values.slice(1) : [];
        rows.push(values.map((v) => cellText(v as ExcelJS.CellValue).trim()));
      });
      const header = rows.findIndex((r) => r.some((c) => /date/i.test(c)));
      if (header !== -1 && rows.length > header + 1) return Papa.unparse(rows.slice(header));
    }
    throw badRequest("Couldn't find a table with a date column in that workbook.", "no_transactions");
  }

  private async pdfToCsv(buffer: Buffer, allowAi: boolean) {
    const key = createHash("sha256").update(buffer).digest("hex");
    const cached = this.pdfCache.get(key);
    if (cached && Date.now() - cached.at < PDF_CACHE_MS) return cached.csv;

    if (!allowAi) throw badRequest("PDF statements need a signed-in account. Use a CSV or Excel file in the demo.", "pdf_not_in_demo");
    if (!this.ai.configured) throw badRequest("PDF import isn't switched on here yet. Use a CSV or Excel file.", "pdf_not_configured");

    let text: string;
    try {
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      ({ text } = await extractText(pdf, { mergePages: true }));
    } catch (err) {
      this.logger.warn(`PDF text extraction failed: ${err instanceof Error ? err.message : String(err)}`);
      throw badRequest("That PDF couldn't be opened. If it has a password, remove it and try again.", "unreadable_file");
    }
    if (text.replace(/\s+/g, "").length < MIN_PDF_TEXT) {
      throw badRequest("That PDF looks like a scan with no text in it. Download the statement as CSV or Excel instead.", "no_text");
    }

    const rows = await this.ai.extractTransactions(text);
    if (!rows.length) throw badRequest("Couldn't find any transactions in that PDF.", "no_transactions");
    const hasBalance = rows.some((r) => r.balance !== null);
    const csv = Papa.unparse({
      fields: hasBalance ? ["Date", "Description", "Amount", "Balance"] : ["Date", "Description", "Amount"],
      data: rows.map((r) => (hasBalance ? [r.date, r.description, r.amount, r.balance ?? ""] : [r.date, r.description, r.amount])),
    });

    if (this.pdfCache.size >= PDF_CACHE_MAX) this.pdfCache.delete(this.pdfCache.keys().next().value!);
    this.pdfCache.set(key, { csv, at: Date.now() });
    return csv;
  }
}
