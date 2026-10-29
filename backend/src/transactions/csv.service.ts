import { Injectable } from "@nestjs/common";
import Papa from "papaparse";
import { badRequest } from "../common/errors.js";
import { guessCategory, merchantKey, type CategoryId } from "../shared/categories.js";

export type DateOrder = "dmy" | "mdy";

export type ParsedRow = {
  line: number;
  date: string;
  merchant: string;
  merchantKey: string;
  amount: number;
  category: CategoryId;
  learned: boolean;
  raw: Record<string, string>;
};

export type ColumnMap = {
  date: string;
  description: string;
  amount?: string;
  debit?: string;
  credit?: string;
  /** Running balance after each row, when the bank includes one. */
  balance?: string;
};

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

const pick = (headers: string[], pattern: RegExp, exclude?: RegExp) =>
  headers.find((h) => pattern.test(h.toLowerCase()) && !(exclude && exclude.test(h.toLowerCase())));

/** Statement CSVs differ by bank. This finds the columns, normalises rows and applies learned rules. */
@Injectable()
export class CsvService {
  parse(content: string, rules: Map<string, CategoryId>, dateOrder?: DateOrder) {
    const parsed = Papa.parse<Record<string, string>>(content.replace(/^﻿/, ""), {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim(),
    });
    const headers = parsed.meta.fields ?? [];
    const columns = this.detectColumns(headers);
    const order = dateOrder ?? this.detectDateOrder(parsed.data.map((r) => r[columns.date] ?? ""));

    const rows: ParsedRow[] = [];
    const skipped: { line: number; reason: string }[] = [];

    parsed.data.forEach((record, i) => {
      const line = i + 2; // header is line 1
      const date = this.parseDate(record[columns.date] ?? "", order);
      const merchant = (record[columns.description] ?? "").replace(/\s+/g, " ").trim();
      const amount = this.parseAmount(record, columns);
      if (!date) return skipped.push({ line, reason: "Unreadable date" });
      if (!merchant) return skipped.push({ line, reason: "Missing description" });
      if (amount === null || amount === 0) return skipped.push({ line, reason: "Missing amount" });

      const key = merchantKey(merchant) || merchant.toLowerCase();
      const learnedCategory = rules.get(key);
      rows.push({
        line,
        date,
        merchant,
        merchantKey: key,
        amount,
        category: learnedCategory ?? guessCategory(merchant, amount),
        learned: Boolean(learnedCategory),
        raw: record,
      });
    });

    return { columns, dateOrder: order, rows, skipped, closingBalance: this.closingBalance(parsed.data, rows, columns) };
  }

  /**
   * The account balance after the statement's latest row, read from its balance column.
   * Statements run oldest-first or newest-first, so among rows on the latest date this takes
   * the one that comes last in time. Null when there is no balance column or it can't be read.
   */
  private closingBalance(records: Record<string, string>[], rows: ParsedRow[], columns: ColumnMap): number | null {
    if (!columns.balance || rows.length === 0) return null;
    const latest = rows.reduce((max, r) => (r.date > max ? r.date : max), rows[0].date);
    const newestFirst = rows[0].date > rows[rows.length - 1].date;
    const onLatest = rows.filter((r) => r.date === latest);
    const row = newestFirst ? onLatest[0] : onLatest[onLatest.length - 1];
    return this.toNumber(records[row.line - 2]?.[columns.balance] ?? "");
  }

  /** Whether a row could be this statement's header: it names a date, a description and an amount. */
  hasColumns(headers: string[]) {
    try {
      this.detectColumns(headers.map((h) => h.trim()));
      return true;
    } catch {
      return false;
    }
  }

  private detectColumns(headers: string[]): ColumnMap {
    const date = pick(headers, /date|posted|time/, /value date/) ?? pick(headers, /date/);
    const description = pick(headers, /description|narration|details|merchant|payee|memo|remarks|particulars|reference/);
    const amount = pick(headers, /amount/, /balance/);
    const debit = pick(headers, /debit|withdrawal|money out|paid out|^dr$/);
    const credit = pick(headers, /credit|deposit|money in|paid in|^cr$/);
    const balance = pick(headers, /balance/, /opening/);

    if (!date || !description || (!amount && !debit && !credit)) {
      throw badRequest(
        `Couldn't find date, description and amount columns. Found: ${headers.join(", ") || "no header row"}.`,
        "csv_columns_not_found",
      );
    }
    return { date, description, amount: amount ?? undefined, debit, credit, balance };
  }

  /** If any first part is above 12 the file is day-first; if any second part is, month-first. Default day-first. */
  private detectDateOrder(values: string[]): DateOrder {
    for (const v of values) {
      const m = /^(\d{1,2})[/.-](\d{1,2})[/.-]\d{2,4}/.exec(v.trim());
      if (!m) continue;
      if (Number(m[1]) > 12) return "dmy";
      if (Number(m[2]) > 12) return "mdy";
    }
    return "dmy";
  }

  private parseDate(value: string, order: DateOrder): string | null {
    const v = value.trim();
    let y: number, m: number, d: number;

    let match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v);
    if (match) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
    else if ((match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(v))) {
      const [a, b] = [Number(match[1]), Number(match[2])];
      [d, m] = order === "dmy" ? [a, b] : [b, a];
      y = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
    } else if ((match = /^(\d{1,2})[\s-]([A-Za-z]{3,4})[a-z]*[\s-,]+(\d{2,4})/.exec(v))) {
      d = Number(match[1]);
      m = MONTHS[match[2].toLowerCase()] ?? 0;
      y = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
    } else return null;

    if (!m || m > 12 || !d || d > 31 || y < 1990 || y > 2100) return null;
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  private parseAmount(record: Record<string, string>, columns: ColumnMap): number | null {
    if (columns.amount && record[columns.amount]?.trim()) return this.toNumber(record[columns.amount]);
    const debit = columns.debit ? this.toNumber(record[columns.debit] ?? "") : null;
    const credit = columns.credit ? this.toNumber(record[columns.credit] ?? "") : null;
    if (debit) return -Math.abs(debit);
    if (credit) return Math.abs(credit);
    return null;
  }

  /** "₦1,234.50", "(45.00)", "45.00 DR", "-12" → number. */
  private toNumber(value: string): number | null {
    let v = value.trim();
    if (!v) return null;
    let sign = 1;
    if (/^\(.*\)$/.test(v) || /\bdr\b/i.test(v)) sign = -1;
    v = v.replace(/\b(cr|dr)\b/gi, "").replace(/[()\s]/g, "");
    if (v.startsWith("-")) {
      sign = -1;
      v = v.slice(1);
    }
    const n = Number(v.replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) && v.replace(/[^0-9]/g, "") !== "" ? sign * n : null;
  }
}
